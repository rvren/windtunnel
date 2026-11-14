import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { ZERO_USAGE, addUsage, type Stage, type Usage } from "./schema";

/*
 * The one place the engine talks to a model. Everything else depends on the
 * small `LlmClient` interface, so tests and the sample mode can stand in for
 * the real API without touching the network.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface LlmCall<T> {
  stage: Stage;
  model: string;
  effort: Effort;
  system: string;
  /**
   * Context that several calls send byte for byte the same. It is marked for
   * caching, so the second and later calls read it at a fraction of the price.
   */
  shared?: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Called once, when the first bytes of the answer arrive. */
  onStart?: () => void;
  /** Called as the answer grows, with everything received so far. */
  onText?: (soFar: string) => void;
}

export type LlmResult<T> =
  | { kind: "ok"; value: T; usage: Usage }
  /** The model, and its fallback, declined on policy grounds. */
  | { kind: "declined"; category: string | null; usage: Usage };

/** Something the model may call while it works. Runs on this server. */
export interface LlmTool {
  name: string;
  description: string;
  input: z.ZodType;
  /**
   * Does the work and returns what the model should see. Throw a ToolFailure
   * to tell the model its request was wrong; it can then try again.
   */
  run: (input: never) => Promise<string>;
}

/** A tool's way of saying "no", with the reason the model should read. */
export class ToolFailure extends Error {}

export interface AgentCall<T> extends Omit<LlmCall<T>, "onText"> {
  tools: LlmTool[];
  /** How many times the model may come back with tool calls. */
  maxTurns: number;
}

export interface LlmClient {
  /** One question, one structured answer. */
  call<T>(request: LlmCall<T>): Promise<LlmResult<T>>;
  /** Lets the model use tools over several turns, then answer. */
  agent<T>(request: AgentCall<T>): Promise<LlmResult<T>>;
}

/** A problem with the run that the person can read and act on. */
export class RunError extends Error {}

// Streaming is on for every call, so a long answer cannot hit an HTTP
// timeout; the budget is generous because thinking counts against it.
const MAX_TOKENS = 64_000;

// Opt in to the server-side fallback: when a safety classifier declines a
// request, the API retries it once on the model's default fallback.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** One answer from the API: which model was asked, and which answered. */
export interface MessageRecord {
  stage: Stage;
  requested: string;
  /** The model that answered; the server-side fallback can change it. */
  served: string;
  stopReason: string | null;
  usage: Usage;
}

export class AnthropicLlm implements LlmClient {
  // Reads ANTHROPIC_API_KEY from the environment. The key never leaves the
  // server.
  private readonly client = new Anthropic();

  /** `onMessage` sees every answer; the eval uses it, the app does not. */
  constructor(private readonly onMessage?: (record: MessageRecord) => void) {}

  private record(
    request: { stage: Stage; model: string },
    message: { model: string; stop_reason: string | null },
    usage: Usage,
  ) {
    this.onMessage?.({
      stage: request.stage,
      requested: request.model,
      served: message.model,
      stopReason: message.stop_reason,
      usage,
    });
  }

  async call<T>(request: LlmCall<T>): Promise<LlmResult<T>> {
    let started = false;
    try {
      const stream = this.client.beta.messages.stream({
        model: request.model,
        max_tokens: MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        system: request.system,
        messages: [
          {
            role: "user",
            content: [
              ...(request.shared
                ? [
                    {
                      type: "text" as const,
                      text: request.shared,
                      cache_control: { type: "ephemeral" as const },
                    },
                  ]
                : []),
              { type: "text" as const, text: request.prompt },
            ],
          },
        ],
        output_config: {
          effort: request.effort,
          format: zodOutputFormat(request.schema),
        },
      });

      stream.on("streamEvent", () => {
        if (started) return;
        started = true;
        request.onStart?.();
      });
      if (request.onText) {
        stream.on("text", (_delta, soFar) => request.onText?.(soFar));
      }

      const message = await stream.finalMessage();
      const usage: Usage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      };
      this.record(request, message, usage);

      if (message.stop_reason === "refusal") {
        return {
          kind: "declined",
          category: message.stop_details?.category ?? null,
          usage,
        };
      }
      if (message.stop_reason === "max_tokens") {
        throw new RunError(
          "The model's answer was cut off before it finished. Try a shorter requirement.",
        );
      }
      if (message.parsed_output == null) {
        throw new RunError(
          "The model's answer did not match the expected shape.",
        );
      }
      return { kind: "ok", value: message.parsed_output as T, usage };
    } catch (error) {
      throw readable(error);
    } finally {
      // Whatever happened, anyone waiting on the first byte must not hang.
      if (!started) request.onStart?.();
    }
  }

  async agent<T>(request: AgentCall<T>): Promise<LlmResult<T>> {
    let started = false;
    let usage = ZERO_USAGE;
    const tools = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: z.toJSONSchema(
        tool.input,
      ) as Anthropic.Beta.BetaTool.InputSchema,
    }));
    const byName = new Map(request.tools.map((tool) => [tool.name, tool]));
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      {
        role: "user",
        content: [
          ...(request.shared
            ? [
                {
                  type: "text" as const,
                  text: request.shared,
                  cache_control: { type: "ephemeral" as const },
                },
              ]
            : []),
          { type: "text" as const, text: request.prompt },
        ],
      },
    ];

    try {
      for (let turn = 0; ; turn += 1) {
        // On the last turn the tools are switched off, so the model must
        // answer with what it has.
        const last = turn >= request.maxTurns;
        const stream = this.client.beta.messages.stream({
          model: request.model,
          max_tokens: MAX_TOKENS,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          system: request.system,
          messages,
          tools,
          ...(last ? { tool_choice: { type: "none" as const } } : {}),
          // Caches the conversation so far, so each turn re-reads it cheaply.
          cache_control: { type: "ephemeral" },
          output_config: {
            effort: request.effort,
            format: zodOutputFormat(request.schema),
          },
        });
        stream.on("streamEvent", () => {
          if (started) return;
          started = true;
          request.onStart?.();
        });
        const message = await stream.finalMessage();
        const answer: Usage = {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        };
        usage = addUsage(usage, answer);
        this.record(request, message, answer);

        if (message.stop_reason === "refusal") {
          return {
            kind: "declined",
            category: message.stop_details?.category ?? null,
            usage,
          };
        }
        if (message.stop_reason === "max_tokens") {
          throw new RunError(
            "The model's answer was cut off before it finished.",
          );
        }

        messages.push({ role: "assistant", content: message.content });
        if (message.stop_reason === "pause_turn") continue;

        const calls = message.content.filter(
          (block) => block.type === "tool_use",
        );
        if (message.stop_reason !== "tool_use" || calls.length === 0) {
          if (message.parsed_output == null) {
            throw new RunError(
              "The model's answer did not match the expected shape.",
            );
          }
          return { kind: "ok", value: message.parsed_output as T, usage };
        }

        // Every call gets an answer, all in one message, in the same order.
        const results = await Promise.all(
          calls.map(async (call) => {
            const answer = await runTool(byName.get(call.name), call.input);
            return {
              type: "tool_result" as const,
              tool_use_id: call.id,
              content: answer.text,
              is_error: answer.failed,
            };
          }),
        );
        messages.push({
          role: "user",
          content:
            turn + 1 >= request.maxTurns
              ? [
                  ...results,
                  {
                    type: "text" as const,
                    text: "You have used all your tool calls. Give your final answer now.",
                  },
                ]
              : results,
        });
      }
    } catch (error) {
      throw readable(error);
    } finally {
      if (!started) request.onStart?.();
    }
  }
}

/** Runs one tool call. A bad request is answered, never thrown. */
export async function runTool(
  tool: LlmTool | undefined,
  input: unknown,
): Promise<{ text: string; failed: boolean }> {
  if (!tool) return { text: "There is no such tool.", failed: true };
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    return {
      text: `The input is not valid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`,
      failed: true,
    };
  }
  try {
    return { text: await tool.run(parsed.data as never), failed: false };
  } catch (error) {
    if (error instanceof ToolFailure)
      return { text: error.message, failed: true };
    throw error;
  }
}

/** Turns an SDK error into a sentence a person can act on. */
function readable(error: unknown): Error {
  if (error instanceof RunError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new RunError(
      "The Claude API rejected the API key. Check ANTHROPIC_API_KEY.",
    );
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new RunError(
      "This API key is not allowed to use the configured model.",
    );
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new RunError(
      "The Claude API does not know the configured model. Check WINDTUNNEL_MODEL_REASONING and WINDTUNNEL_MODEL_AGENTS.",
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new RunError(
      "The Claude API rate limit was reached. Wait a minute and start the run again.",
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new RunError(`The Claude API refused the request: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new RunError("Could not reach the Claude API. Check the network.");
  }
  if (error instanceof Anthropic.APIError) {
    return new RunError(
      `The Claude API failed (${error.status ?? "no status"}). Try again.`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

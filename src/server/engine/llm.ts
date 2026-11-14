import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import type { Stage, Usage } from "./schema";

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

export interface LlmClient {
  call<T>(request: LlmCall<T>): Promise<LlmResult<T>>;
}

/** A problem with the run that the person can read and act on. */
export class RunError extends Error {}

// Streaming is on for every call, so a long answer cannot hit an HTTP
// timeout; the budget is generous because thinking counts against it.
const MAX_TOKENS = 64_000;

// Opt in to the server-side fallback: when a safety classifier declines a
// request, the API retries it once on the model's default fallback.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AnthropicLlm implements LlmClient {
  // Reads ANTHROPIC_API_KEY from the environment. The key never leaves the
  // server.
  private readonly client = new Anthropic();

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

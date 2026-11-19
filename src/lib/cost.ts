import type { RunRecord, Stage, Usage } from "@/server/engine/schema";

/*
 * What a run cost, from the tokens the API reported and the published
 * per-token prices. Cache writes cost 1.25 times the input price, cache
 * reads the listed read price.
 */

/** US dollars per million tokens. */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

export const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/** The price of a model id, allowing a dated snapshot of a known model. */
export function priceOf(model: string): Price | null {
  if (PRICES[model]) return PRICES[model];
  const known = Object.keys(PRICES).find((id) => model.startsWith(`${id}-`));
  return known ? PRICES[known] : null;
}

/** Dollars for one block of usage on one model; null for an unknown model. */
export function usageCost(usage: Usage, model: string): number | null {
  const price = priceOf(model);
  if (!price) return null;
  return (
    (usage.inputTokens * price.input +
      usage.cacheWriteTokens * price.input * 1.25 +
      usage.cacheReadTokens * price.cacheRead +
      usage.outputTokens * price.output) /
    1_000_000
  );
}

/** The stages answered by the agent model; every other is the reasoning one. */
const AGENT_STAGES = new Set<Stage>([
  "agents",
  "challenge",
  "proposals",
  "critique",
  "cut",
]);

/** A run's cost in dollars: 0 for a replayed sample, null when unknown. */
export function costOf(
  run: Pick<RunRecord, "usage" | "models" | "sample">,
): number | null {
  if (run.sample) return 0;
  let total = 0;
  for (const [stage, usage] of Object.entries(run.usage) as [Stage, Usage][]) {
    if (!usage) continue;
    const cost = usageCost(
      usage,
      AGENT_STAGES.has(stage) ? run.models.agents : run.models.reasoning,
    );
    if (cost === null) return null;
    total += cost;
  }
  return Math.round(total * 10_000) / 10_000;
}

/** Dollars as people read them: "$1.84", "$0.07", "under $0.01". */
export function formatCost(dollars: number | null): string {
  if (dollars === null) return "—";
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return "under $0.01";
  return `$${dollars.toFixed(2)}`;
}

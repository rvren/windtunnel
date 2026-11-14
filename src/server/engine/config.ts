/* The engine's settings, read from the environment each time they are asked for. */

export const DEFAULT_MODELS = {
  reasoning: "claude-opus-5-5",
  agents: "claude-sonnet-5-5",
} as const;

export function engineConfig() {
  return {
    /** Whether a key is present. The key itself is never returned. */
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    /**
     * Development only. When "1", runs replay hand-written sample data and
     * never call the model, so the screens can be worked on without spending.
     * Such runs are marked as samples everywhere they appear.
     */
    sampleMode: process.env.WINDTUNNEL_SAMPLE_RUN === "1",
    models: {
      reasoning:
        process.env.WINDTUNNEL_MODEL_REASONING?.trim() ||
        DEFAULT_MODELS.reasoning,
      agents:
        process.env.WINDTUNNEL_MODEL_AGENTS?.trim() || DEFAULT_MODELS.agents,
    },
  };
}

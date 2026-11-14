import { readFile } from "node:fs/promises";
import path from "node:path";

import { AGENT_IDS, type AgentId } from "@/lib/agents";

/*
 * What makes each agent a specialist: a set of notes it carries into every
 * run. They are plain Markdown files in ./expertise so that people can
 * sharpen them without touching code.
 */

const FILE: Record<AgentId, string> = {
  normal_user: "normal-user.md",
  adversarial_user: "adversarial-user.md",
  chaos: "chaos.md",
  scale: "scale.md",
  product_critic: "product-critic.md",
};

export type Expertise = Record<AgentId, string>;

let loaded: Promise<Expertise> | undefined;

export function loadExpertise(): Promise<Expertise> {
  loaded ??= (async () => {
    const folder = path.join(process.cwd(), "src/server/engine/expertise");
    const notes = {} as Expertise;
    for (const id of AGENT_IDS) {
      notes[id] = (await readFile(path.join(folder, FILE[id]), "utf8")).trim();
    }
    return notes;
  })().catch((error) => {
    loaded = undefined;
    throw error;
  });
  return loaded;
}

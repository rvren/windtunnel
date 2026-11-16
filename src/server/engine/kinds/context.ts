import type { LlmClient, RunError } from "../llm";
import type { RepoReader } from "../repo/tools";
import type { Survey } from "../repo/survey";
import type { RunEvent, RunRecord, Stage } from "../schema";
import type { RunStore } from "../store";

/*
 * What an executor of a newer kind of run gets from the orchestrator: the
 * run, the model client, and the same helpers the audit stages use, so
 * every kind saves, announces and reports its stages the same way.
 */
export interface KindContext {
  run: RunRecord;
  llm: LlmClient;
  store: RunStore;
  stage: (name: Stage, work: () => Promise<string>) => Promise<void>;
  emit: (event: RunEvent) => Promise<void>;
  save: () => Promise<void>;
  plural: (count: number, one: string, many?: string) => string;
  declined: (what: string, category: string | null) => RunError;
}

/** The repository, once it is on disk and surveyed. */
export interface CodeAtHand {
  reader: RepoReader;
  survey: Survey;
  outline: string;
}

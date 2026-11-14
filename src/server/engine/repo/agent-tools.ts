import { z } from "zod";

import { ToolFailure, type LlmTool } from "../llm";
import { FindingType, Severity, type Finding } from "../schema";
import type { RepoReader } from "./tools";

/* The tools an agent is handed for a repository run. */

/** At most this many findings per agent, so one agent cannot flood a run. */
export const FINDINGS_PER_AGENT = 12;
/** How much of the cited code is kept with a finding. */
const QUOTE_LINES = 40;

export function readTools(
  reader: RepoReader,
  onReading: (path: string) => void,
): LlmTool[] {
  return [
    {
      name: "list_files",
      description:
        "List the files and folders in one folder of the repository. Leave `path` empty for the top level.",
      input: z.object({ path: z.string() }),
      run: async ({ path }: { path: string }) => reader.listFiles(path),
    },
    {
      name: "read_file",
      description:
        "Read a file, with line numbers. Returns up to 400 lines from `startLine`; ask again from a later line to read on. Set `endLine` to 0 for the default.",
      input: z.object({
        path: z.string(),
        startLine: z.number().int(),
        endLine: z.number().int(),
      }),
      run: async (input: {
        path: string;
        startLine: number;
        endLine: number;
      }) => {
        const text = await reader.readFile(
          input.path,
          input.startLine || 1,
          input.endLine || undefined,
        );
        onReading(input.path);
        return text;
      },
    },
    {
      name: "search",
      description:
        "Find a piece of text across the repository, ignoring case. Plain text, not a pattern. Set `under` to a folder to search only there, or leave it empty.",
      input: z.object({ text: z.string(), under: z.string() }),
      run: async ({ text, under }: { text: string; under: string }) =>
        reader.search(text, under),
    },
  ];
}

const Report = z.object({
  type: FindingType,
  severity: Severity,
  title: z.string(),
  description: z.string(),
  suggestion: z.string(),
  path: z.string(),
  startLine: z.number().int(),
  endLine: z.number().int(),
});

/**
 * The tool an agent files a finding with. The cited file and lines are
 * checked on the spot: a finding that points at nothing is refused, with the
 * reason, and the agent can correct it. A sound one is handed to `onFinding`
 * at once, with the cited code attached.
 */
export function reportFindingTool(
  agentId: Finding["agentId"],
  reader: RepoReader,
  filed: Finding[],
  onFinding: (finding: Finding) => void,
): LlmTool {
  return {
    name: "report_finding",
    description:
      "File one finding as soon as you are sure of it. `path`, `startLine` and `endLine` must point at the lines of code that show the flaw; they are checked. File each flaw once.",
    input: Report,
    run: async (input: z.infer<typeof Report>) => {
      if (filed.length >= FINDINGS_PER_AGENT) {
        throw new ToolFailure(
          `You have filed ${FINDINGS_PER_AGENT} findings, which is the most one agent may file. Finish with your summary.`,
        );
      }
      if (!input.title.trim() || !input.description.trim()) {
        throw new ToolFailure("A finding needs a title and a description.");
      }
      if (input.endLine - input.startLine + 1 > 200) {
        throw new ToolFailure(
          "Cite the lines that show the flaw, not the whole file: at most 200 lines.",
        );
      }
      const slice = await reader.slice(
        input.path,
        input.startLine,
        input.endLine,
      );
      const id = `f${filed.length + 1}`;
      const finding: Finding = {
        id,
        uid: `${agentId}/${id}`,
        agentId,
        type: input.type,
        severity: input.severity,
        title: input.title.trim(),
        description: input.description.trim(),
        suggestion: input.suggestion.trim(),
        evidence: [],
        refs: [],
        location: {
          path: slice.path,
          startLine: slice.startLine,
          endLine: slice.endLine,
          quote: slice.text.split("\n").slice(0, QUOTE_LINES).join("\n"),
        },
      };
      filed.push(finding);
      onFinding(finding);
      return `Recorded as ${id}.`;
    },
  };
}

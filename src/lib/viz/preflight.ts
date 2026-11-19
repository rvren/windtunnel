import type {
  LineStatus,
  PreflightLine,
  RunPreflight,
} from "@/server/engine/schema";

/*
 * Preflight's result, ready to show and to export: the counts, the lines
 * in the spec's order, and the traceability table as Markdown and CSV.
 * Pure; read from the run.
 */

export const STATUS_LABEL: Record<LineStatus, string> = {
  implemented: "Implemented",
  partly: "Partly",
  missing: "Missing",
  contradicted: "Contradicted",
  unclear: "Not checked",
};

export const STATUS_ORDER: LineStatus[] = [
  "contradicted",
  "missing",
  "partly",
  "unclear",
  "implemented",
];

export function statusCounts(
  preflight: RunPreflight,
): Record<LineStatus, number> {
  const counts = {
    implemented: 0,
    partly: 0,
    missing: 0,
    contradicted: 0,
    unclear: 0,
  };
  for (const line of preflight.lines) counts[line.status] += 1;
  return counts;
}

/** The lines that need work, worst first: for the result card. */
export function worstLines(
  preflight: RunPreflight,
  count = 3,
): PreflightLine[] {
  return [...preflight.lines]
    .filter((line) => line.status !== "implemented")
    .sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
    )
    .slice(0, count);
}

const where = (line: PreflightLine) =>
  line.locations.length > 0
    ? line.locations
        .map((at) => `${at.path}:${at.startLine}-${at.endLine}`)
        .join("; ")
    : (line.searched ?? "");

/** The traceability table as Markdown: one row per line of the spec. */
export function traceabilityMarkdown(
  title: string,
  preflight: RunPreflight,
): string {
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `# ${title}`,
    "",
    "| # | Line of the spec | Status | Code | Note |",
    "| - | - | - | - | - |",
    ...preflight.lines.map(
      (line, index) =>
        `| ${index + 1} | ${cell(line.text)} | ${STATUS_LABEL[line.status]} | ${cell(where(line))} | ${cell(line.note)} |`,
    ),
    "",
  ].join("\n");
}

/** The traceability table as CSV, for a spreadsheet. */
export function traceabilityCsv(preflight: RunPreflight): string {
  const field = (text: string) => `"${text.replace(/"/g, '""')}"`;
  return [
    ["Number", "Line of the spec", "Status", "Code", "Note"].join(","),
    ...preflight.lines.map((line, index) =>
      [
        String(index + 1),
        field(line.text),
        field(STATUS_LABEL[line.status]),
        field(where(line)),
        field(line.note),
      ].join(","),
    ),
    "",
  ].join("\n");
}

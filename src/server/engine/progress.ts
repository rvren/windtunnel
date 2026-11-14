/*
 * Reads an agent's answer while it is still arriving. The answer is one JSON
 * object, `{"scenarios": [...], "findings": [...]}`, so until it ends it
 * cannot be parsed. This pulls out the titles that are already complete, which
 * is all the live view needs. The finished answer replaces it.
 */

const TITLE = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

function titles(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(TITLE)) {
    try {
      found.push(JSON.parse(`"${match[1]}"`) as string);
    } catch {
      // An escape cut in half by the stream: skip it, the next read has it.
    }
  }
  return found;
}

export function readProgress(partial: string): {
  scenarios: string[];
  findings: number;
} {
  // Scenarios come first in the schema, findings second.
  const split = partial.search(/"findings"\s*:/);
  if (split === -1) return { scenarios: titles(partial), findings: 0 };
  return {
    scenarios: titles(partial.slice(0, split)),
    findings: titles(partial.slice(split)).length,
  };
}

import { DOCUMENT_EXTENSIONS, LIMITS } from "@/lib/limits";

import type { RunInput } from "./run";

/*
 * Checks what a person sent before a run starts. Nothing is ever cut short to
 * make it fit: input over a limit is refused with the reason.
 */
export function parseRunInput(
  body: unknown,
): { ok: true; input: RunInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (typeof body !== "object" || body === null) {
    return fail("Send a JSON object with a requirement.");
  }
  const { requirement, documents = [] } = body as Record<string, unknown>;

  if (typeof requirement !== "string" || !requirement.trim()) {
    return fail("Enter a requirement.");
  }
  if (requirement.length > LIMITS.requirementChars) {
    return fail(
      `The requirement is ${requirement.length.toLocaleString("en")} characters. The limit is ${LIMITS.requirementChars.toLocaleString("en")}; put the rest in a Markdown file.`,
    );
  }
  if (!Array.isArray(documents)) return fail("Documents must be a list.");
  if (documents.length > LIMITS.documents) {
    return fail(`Attach at most ${LIMITS.documents} files.`);
  }

  const names = new Set<string>();
  const parsed: RunInput["documents"] = [];
  let total = requirement.length;
  for (const document of documents) {
    const { name, content } = (document ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || typeof content !== "string") {
      return fail("Each file needs a name and its text.");
    }
    if (!DOCUMENT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))) {
      return fail(`"${name}" is not a ${DOCUMENT_EXTENSIONS.join(", ")} file.`);
    }
    if (names.has(name)) return fail(`"${name}" is attached twice.`);
    names.add(name);
    if (!content.trim()) return fail(`"${name}" is empty.`);
    if (content.length > LIMITS.documentChars) {
      return fail(
        `"${name}" is ${content.length.toLocaleString("en")} characters. The limit for one file is ${LIMITS.documentChars.toLocaleString("en")}.`,
      );
    }
    total += content.length;
    parsed.push({ name, content });
  }
  if (total > LIMITS.totalChars) {
    return fail(
      `The requirement and files add up to ${total.toLocaleString("en")} characters. The limit is ${LIMITS.totalChars.toLocaleString("en")}.`,
    );
  }

  return { ok: true, input: { requirement, documents: parsed } };
}

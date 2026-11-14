// The size limits on a run's input. The form and the API both use them, so a
// file the form accepts is never refused by the server.

export const LIMITS = {
  requirementChars: 20_000,
  documents: 10,
  documentChars: 150_000,
  totalChars: 400_000,
} as const;

export const DOCUMENT_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

export const EXAMPLE_REQUIREMENT =
  "Build a multi-tenant dashboard where organization admins can invite users and manage permissions.";

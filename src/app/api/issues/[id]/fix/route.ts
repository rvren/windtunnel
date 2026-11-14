import { RunError } from "@/server/engine/llm";
import { writeFix } from "@/server/issues/fix";
import { getIssue } from "@/server/issues/store";

import { UUID, failure, withDatabase } from "../../../projects/shared";

/**
 * Runs the fix agent for one issue against the code as it is now. On a
 * project that is not a demo this calls the model on the owner's key: the
 * app asks before it sends this.
 */
export async function POST(
  _request: Request,
  context: RouteContext<"/api/issues/[id]/fix">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such issue.", 404);
  return withDatabase(async () => {
    const issue = await getIssue(id);
    if (!issue) return failure("No such issue.", 404);
    try {
      const record = await writeFix(issue);
      return Response.json({ remediation: record });
    } catch (error) {
      if (error instanceof RunError) return failure(error.message, 409);
      throw error;
    }
  });
}

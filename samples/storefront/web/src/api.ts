import { GATEWAY } from "./config";
import { sessionToken } from "./session";

export async function call(path: string, body?: unknown) {
  return fetch(`${GATEWAY}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: sessionToken() ?? "" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

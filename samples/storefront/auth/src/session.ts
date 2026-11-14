import { randomUUID } from "node:crypto";

import { sessions } from "./db";

export async function openSession(userId: string): Promise<string> {
  const token = randomUUID();
  await sessions.insert({ token, userId });
  return token;
}

export async function userOf(token: string): Promise<string | null> {
  const session = await sessions.findByToken(token);
  return session?.userId ?? null;
}

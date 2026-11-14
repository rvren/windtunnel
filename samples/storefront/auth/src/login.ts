import { users } from "./db";
import { hashPassword } from "./password";
import { openSession } from "./session";

export async function login(email: string, password: string) {
  const user = await users.findByEmail(email);
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { status: 401 };
  }
  return { status: 200, token: await openSession(user.id) };
}

// The users database. Tables: users, sessions.
export declare const users: {
  findByEmail(email: string): Promise<{ id: string; passwordHash: string } | null>;
};
export declare const sessions: {
  insert(row: { token: string; userId: string }): Promise<void>;
  findByToken(token: string): Promise<{ userId: string } | null>;
};

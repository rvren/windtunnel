export function saveSession(token: string) {
  localStorage.setItem("token", token);
}

export function sessionToken(): string | null {
  return localStorage.getItem("token");
}

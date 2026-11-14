import { SOFTWARE_FACTORY } from "@/server/connectors/software-factory";

export { failure, readJson, withDatabase } from "../projects/shared";

/** The connectors that can be connected today. The rest are "coming soon". */
export const LIVE = new Set([SOFTWARE_FACTORY]);

/** Where the outside server sends the person back to after sign-in. */
export const callbackUrl = (origin: string, provider: string) =>
  `${origin}/api/connectors/${provider}/callback`;

/**
 * The address this app is reached at, as the browser sees it. Inside Docker
 * the request's own URL is not that address, so the browser's Origin header
 * (on a form post) or the Host header is used.
 */
export function publicOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

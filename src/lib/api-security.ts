import "server-only";

const isProduction = process.env.NODE_ENV === "production";

function getAllowedOrigins(): Set<string> {
  const configuredOrigins = isProduction
    ? [process.env.BETTER_AUTH_URL ?? process.env.FRONTEND_ORIGIN]
    : [
        process.env.BETTER_AUTH_URL,
        process.env.FRONTEND_ORIGIN,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ];

  return new Set(
    configuredOrigins.flatMap((value) => {
      if (!value) return [];
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    })
  );
}

/** Reject cross-site browser requests before they reach authenticated mutations. */
export function isTrustedMutationRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;

  try {
    return getAllowedOrigins().has(new URL(originHeader).origin);
  } catch {
    return false;
  }
}

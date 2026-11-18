export type ErrorKind = "auth" | "rate_limit" | "transient" | "content" | "unknown";

export class ThreadsApiError extends Error {
  constructor(
    message: string,
    public readonly kind: ErrorKind,
    public readonly httpStatus?: number,
    public readonly code?: number,
    public readonly subcode?: number,
  ) { super(message); this.name = "ThreadsApiError"; }

  get retryable() { return this.kind === "transient" || this.kind === "rate_limit"; }
}

/** Класифікація помилок Graph API (Threads використовує ті ж коди). */
export function classify(httpStatus: number | undefined, code?: number, message = ""): ErrorKind {
  if (code === 190 || code === 102 || httpStatus === 401) return "auth";
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) return "auth"; // permission revoked
  if (httpStatus === 429 || code === 4 || code === 17 || code === 32 || code === 613 || /rate limit/i.test(message))
    return "rate_limit";
  if ((httpStatus !== undefined && httpStatus >= 500) || code === 1 || code === 2) return "transient";
  if (httpStatus !== undefined && httpStatus >= 400) return "content";
  return "unknown";
}

import type { ErrorBody, ErrorCode } from "@life-tracker/shared";

export class ApiError extends Error {
  status: number;
  code: ErrorCode;
  fields?: Record<string, string>;
  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** Message of the ApiError raised when the server cannot be reached; toasts ignore it (the offline screen covers it). */
export const NETWORK_ERROR_MESSAGE = "Network unreachable";

/** Fired on a 401 from any non-auth route; AuthGate listens and re-checks auth status. */
export const UNAUTHORIZED_EVENT = "lt:unauthorized";

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers:
        init.body !== undefined
          ? { "Content-Type": "application/json" }
          : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    if (e instanceof TypeError)
      throw new ApiError(0, "INTERNAL", NETWORK_ERROR_MESSAGE);
    throw e;
  }
  if (!res.ok) {
    let parsed: Partial<ErrorBody> | undefined;
    try {
      parsed = (await res.json()) as Partial<ErrorBody>;
    } catch {
      parsed = undefined;
    }
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const e = parsed?.error;
    throw new ApiError(
      res.status,
      e?.code ?? "INTERNAL",
      e?.message ?? `Request failed (${res.status})`,
      e?.fields,
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

import { NextResponse } from "next/server";

import { checkRateLimit, type RateLimitOptions } from "@/lib/qreview/rate-limit";

/**
 * Shared guards for public API route handlers: client identification,
 * request-size limits, field validation and non-leaking error responses.
 */

/**
 * Best-effort client IP.
 *
 * IMPORTANT: `x-forwarded-for` is attacker-controlled unless a trusted proxy
 * (nginx / Cloudflare / Vercel) overwrites it. Deploy this app behind such a
 * proxy, otherwise the rate limiter can be bypassed with a spoofed header.
 */
export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();

    if (first) {
      return first;
    }
  }

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

/** 429 response with a Retry-After header, or null when the caller is allowed. */
export function enforceRateLimit(request: Request, options: RateLimitOptions) {
  const result = checkRateLimit(getClientIp(request), options);

  if (result.ok) {
    return null;
  }

  return NextResponse.json(
    { error: "Ban thao tac qua nhanh. Vui long thu lai sau." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter),
        "Cache-Control": "no-store",
      },
    }
  );
}

const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

type JsonBodyResult<T> = {
  /** Non-null when the body was rejected; return it straight to the client. */
  error: NextResponse | null;
  data: T;
};

/**
 * Reads a JSON body while refusing oversized payloads, so a single request
 * cannot pin memory or fill the database.
 *
 * The result carries an explicit `error` response rather than a discriminated
 * union, because this project compiles with `strict: false` and TypeScript
 * cannot narrow a union on a boolean tag without `strictNullChecks`.
 */
export async function readJsonBody<T>(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<JsonBodyResult<T>> {
  const tooLarge = () => ({
    error: NextResponse.json(
      { error: "Noi dung gui len qua lon." },
      { status: 413 }
    ),
    data: {} as T,
  });

  const declaredLength = Number(request.headers.get("content-length") ?? "");

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return tooLarge();
  }

  const raw = await request.text();

  // Guard against a missing/lying Content-Length header.
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return tooLarge();
  }

  try {
    const data = JSON.parse(raw) as T;

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Body must be a JSON object");
    }

    return { error: null, data };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Du lieu gui len khong hop le." },
        { status: 400 }
      ),
      data: {} as T,
    };
  }
}

const TAB = 9;
const NEWLINE = 10;
const CARRIAGE_RETURN = 13;
const C0_END = 0x1f;
const DELETE_CHAR = 0x7f;
const C1_END = 0x9f;

/**
 * Drops C0/C1 control characters while keeping tab, newline and carriage
 * return. Checked by codepoint rather than a regex literal so the source file
 * itself stays free of raw control bytes.
 */
function stripControlChars(value: string) {
  let result = "";

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const isAllowedWhitespace =
      code === TAB || code === NEWLINE || code === CARRIAGE_RETURN;
    const isControl = code <= C0_END || (code >= DELETE_CHAR && code <= C1_END);

    if (isAllowedWhitespace || !isControl) {
      result += char;
    }
  }

  return result;
}

/** Trims, drops control characters and hard-caps the length of free text. */
export function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = stripControlChars(value).trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function sanitizeEmail(value: unknown, maxLength = 254) {
  const text = sanitizeText(value, maxLength);

  if (!text || !EMAIL_PATTERN.test(text)) {
    return null;
  }

  return text.toLowerCase();
}

/**
 * Allows only http(s) URLs. Blocks `javascript:`, `data:` and `vbscript:`
 * values that would otherwise become an XSS sink when rendered into an href.
 */
export function sanitizeHttpUrl(value: unknown) {
  const text = sanitizeText(value, 2048);

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Like `sanitizeHttpUrl`, but also allows site-relative paths (`/images/...`),
 * which is what most stored asset references look like. Protocol-relative
 * (`//evil.com`) and backslash variants are rejected along with every
 * non-http(s) scheme.
 */
export function sanitizeAssetUrl(value: unknown) {
  const text = sanitizeText(value, 2048);

  if (!text) {
    return null;
  }

  if (text.startsWith("/") && !text.startsWith("//") && !text.startsWith("/\\")) {
    return text;
  }

  return sanitizeHttpUrl(text);
}

/**
 * Detects an obvious bot fill of a hidden honeypot field. The client never
 * populates it; automated form submitters usually do.
 */
export function isHoneypotTripped(body: Record<string, unknown>) {
  const value = body["website"] ?? body["company"] ?? body["_hp"];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Logs the real error server-side and returns a generic message to the client.
 * Raw `error.message` from mysql2 leaks table names, column names and query
 * fragments, which is exactly the recon an attacker wants.
 */
export function serverErrorResponse(
  context: string,
  error: unknown,
  clientMessage = "Da co loi xay ra. Vui long thu lai sau.",
  extra: Record<string, unknown> = {}
) {
  console.error(`${context}:`, error);

  return NextResponse.json(
    { ...extra, error: clientMessage },
    { status: 500, headers: { "Cache-Control": "no-store" } }
  );
}

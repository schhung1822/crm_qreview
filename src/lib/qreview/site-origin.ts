export type QreviewSiteBaseResult =
  | { ok: true; base: string }
  | { ok: false; reason: string };

/**
 * Chuẩn hóa URL gốc của website Qreview trước khi ghép thêm `/api/uploads`
 * hoặc `/images/...`. Chỉ nhận HTTP(S), không nhận credential/query/hash để
 * tránh một giá trị `.env` tưởng đúng nhưng tạo ra URL đích sai khó phát hiện.
 */
export function parseQreviewSiteBaseUrl(raw: unknown): QreviewSiteBaseResult {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: false, reason: "đang để trống" };
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "không phải URL tuyệt đối hợp lệ" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "chỉ được dùng giao thức http hoặc https" };
  }

  if (url.username || url.password) {
    return { ok: false, reason: "không được chứa tài khoản hoặc mật khẩu" };
  }

  if (url.search || url.hash) {
    return { ok: false, reason: "không được chứa query hoặc hash" };
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  return { ok: true, base: `${url.origin}${pathname}` };
}

/** So host (kể cả port) với giá trị Host/X-Forwarded-Host của request. */
export function qreviewSiteMatchesRequestHost(base: string, hostHeader: string | null) {
  const requestHost = hostHeader?.split(",", 1)[0]?.trim().replace(/\.$/, "").toLowerCase();
  if (!requestHost) return false;

  try {
    const siteHost = new URL(base).host.replace(/\.$/, "").toLowerCase();
    return siteHost === requestHost;
  } catch {
    return false;
  }
}

export function qreviewSitesShareOrigin(first: string, second: string) {
  try {
    return new URL(first).origin === new URL(second).origin;
  } catch {
    return false;
  }
}

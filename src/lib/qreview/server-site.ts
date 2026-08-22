import "server-only";

import {
  parseQreviewSiteBaseUrl,
  qreviewSiteMatchesRequestHost,
  qreviewSitesShareOrigin,
} from "@/lib/qreview/site-origin";

export class QreviewSiteConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QreviewSiteConfigurationError";
  }
}

/**
 * URL server-to-server ưu tiên biến riêng chạy ở runtime. Biến NEXT_PUBLIC cũ
 * chỉ còn là fallback tương thích để các bản deploy trước không bị gãy ngay.
 */
export function qreviewServerSiteBaseUrl(request?: Request) {
  const raw =
    process.env.QREVIEW_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_QREVIEW_SITE_URL?.trim() ||
    "";
  const parsed = parseQreviewSiteBaseUrl(raw);

  if (!parsed.ok) {
    throw new QreviewSiteConfigurationError(
      `QREVIEW_SITE_URL ${parsed.reason}. Hãy đặt URL website, ví dụ https://qreview.asia.`
    );
  }

  const forwardedHost = request?.headers.get("x-forwarded-host");
  const requestHost = forwardedHost || request?.headers.get("host") || null;

  if (qreviewSiteMatchesRequestHost(parsed.base, requestHost)) {
    throw new QreviewSiteConfigurationError(
      "QREVIEW_SITE_URL đang trỏ về chính CRM nên tạo vòng lặp proxy. Hãy trỏ biến này về website Qreview (ví dụ https://qreview.asia)."
    );
  }

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && qreviewSitesShareOrigin(parsed.base, appUrl)) {
    throw new QreviewSiteConfigurationError(
      "QREVIEW_SITE_URL và APP_URL đang cùng một origin. Website Qreview phải dùng domain khác với CRM."
    );
  }

  return parsed.base;
}

export function requireQreviewUploadConfig(request?: Request) {
  const base = qreviewServerSiteBaseUrl(request);
  const token = (process.env.QREVIEW_ADMIN_TOKEN ?? "").trim();

  if (!token) {
    throw new QreviewSiteConfigurationError(
      "QREVIEW_ADMIN_TOKEN đang để trống nên CRM không thể tải ảnh lên website Qreview."
    );
  }

  return { base, token };
}

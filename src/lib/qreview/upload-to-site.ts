import "server-only";

import { randomUUID } from "crypto";

/**
 * Day mot anh da xu ly sang may chu cua WEBSITE Qreview va tra ve duong dan
 * tuong doi ma website se phuc vu (`/images/<thu-muc>/<ten-tep>.webp`).
 *
 * Vi sao khong ghi thang xuong dia: CRM va website la hai ung dung khac nhau,
 * co the nam tren hai may khac nhau (va tren Vercel thi dia con chi doc). Duong
 * dan luu trong CSDL duoc trinh duyet doc theo ten mien CUA WEBSITE, nen tep
 * phai nam o do thi anh moi hien.
 *
 * Xac thuc bang ADMIN_TOKEN cua website — co che server-to-server co san ben
 * do. Token khong bao gio roi khoi may chu.
 */

export type SiteUploadFolder = "products" | "posts";

function requireConfig() {
  const base = (process.env.NEXT_PUBLIC_QREVIEW_SITE_URL ?? "").trim().replace(/\/+$/, "");
  const token = (process.env.QREVIEW_ADMIN_TOKEN ?? "").trim();

  if (!base || !token) {
    const missing = [!base && "NEXT_PUBLIC_QREVIEW_SITE_URL", !token && "QREVIEW_ADMIN_TOKEN"]
      .filter(Boolean)
      .join(" và ");

    throw new Error(`Chưa cấu hình ${missing} nên không gửi ảnh sang website được.`);
  }

  return { base, token };
}

export async function uploadImageToSite(
  webpBuffer: Buffer,
  folder: SiteUploadFolder
): Promise<string> {
  const { base, token } = requireConfig();

  const form = new FormData();
  // Ten tep chi de website co cai ma doc; ben do tu sinh ten that.
  form.append("files", new Blob([new Uint8Array(webpBuffer)], { type: "image/webp" }), `${randomUUID()}.webp`);
  form.append("folder", folder);

  const response = await fetch(`${base}/api/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    redirect: "error",
  });

  const data = (await response.json().catch(() => null)) as { urls?: string[]; error?: string } | null;

  if (!response.ok) {
    throw new Error(data?.error ?? `Website từ chối ảnh (HTTP ${response.status}).`);
  }

  const url = data?.urls?.[0];

  if (!url) {
    throw new Error("Website không trả về đường dẫn ảnh.");
  }

  return url;
}

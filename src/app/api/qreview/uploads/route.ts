import { NextResponse } from "next/server";

import { guardAdminRequest } from "@/lib/qreview/api";
import { serverErrorResponse } from "@/lib/qreview/api-security";

export const runtime = "nodejs";

/**
 * Tai anh len cho khu quan tri website Qreview.
 *
 * Day KHONG phai noi luu tep. Anh phai nam tren may chu cua WEBSITE thi website
 * moi phuc vu duoc chung: CSDL luu duong dan tuong doi kieu
 * `/images/products/abc.webp`, va duong dan do duoc trinh duyet doc theo ten
 * mien cua website chu khong phai cua CRM. Neu ghi tep vao `public/` cua CRM
 * thi moi anh vua tai len se thanh anh vo tren website.
 *
 * Vi vay route nay chi lam hai viec:
 *   1. Xac thuc nguoi dang thao tac la sieu quan tri cua CRM.
 *   2. Chuyen tiep nguyen ven multipart sang `/api/uploads` cua website, ky
 *      bang ADMIN_TOKEN cua website (co che server-to-server co san ben do).
 *
 * Goi tu may chu sang may chu nen khong dinh toi CORS, va trinh duyet khong bao
 * gio nhin thay ADMIN_TOKEN.
 */

/** Nguoi dung co the tai nhieu anh mot luc; noi rong so voi mac dinh 4MB. */
export const maxDuration = 60;

function siteBaseUrl() {
  const raw = (process.env.NEXT_PUBLIC_QREVIEW_SITE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");

  return raw;
}

export async function POST(request: Request) {
  const guard = await guardAdminRequest(request, { bucket: "uploads", write: true });

  if (guard.response) {
    return guard.response;
  }

  const base = siteBaseUrl();
  const token = (process.env.QREVIEW_ADMIN_TOKEN ?? "").trim();

  // Bao ro rang thieu cau hinh nao, thay vi de nguoi dung doan tai sao nut tai
  // anh khong hoat dong.
  if (!base || !token) {
    const missing = [!base && "NEXT_PUBLIC_QREVIEW_SITE_URL", !token && "QREVIEW_ADMIN_TOKEN"]
      .filter(Boolean)
      .join(" và ");

    return NextResponse.json(
      {
        error: `Chưa cấu hình ${missing} nên không tải ảnh lên website được. Bổ sung vào .env rồi khởi động lại.`,
      },
      { status: 503 }
    );
  }

  try {
    // Doc lai form roi dung nguyen doi tuong `File`: giu ten tep va kieu MIME
    // de website tu kiem tra bang magic-byte nhu cu. Khong tu suy dien gi them
    // o day — moi luat ve dinh dang va kich thuoc van thuoc ve website.
    const incoming = await request.formData();
    const outgoing = new FormData();

    for (const [key, value] of incoming.entries()) {
      outgoing.append(key, value);
    }

    const response = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: outgoing,
      // Dia chi lay tu bien moi truong (quan tri vien dat), khong phai tu
      // request cua nguoi dung, nen day khong phai be mat SSRF.
      redirect: "error",
    });

    const text = await response.text();

    // Tra lai NGUYEN VEN phan hoi cua website: thong bao loi cua no da du ro,
    // dich lai mot lan nua chi lam sai lech.
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return serverErrorResponse(
      "Qreview upload proxy error",
      error,
      "Không kết nối được tới website để tải ảnh lên. Kiểm tra website có đang chạy không."
    );
  }
}

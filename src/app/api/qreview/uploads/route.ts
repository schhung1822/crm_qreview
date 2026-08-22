import { NextResponse } from "next/server";

import { guardAdminRequest } from "@/lib/qreview/api";
import { serverErrorResponse } from "@/lib/qreview/api-security";
import {
  QreviewSiteConfigurationError,
  requireQreviewUploadConfig,
} from "@/lib/qreview/server-site";

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

type UploadResponse = { urls?: unknown; error?: unknown };

export async function POST(request: Request) {
  const guard = await guardAdminRequest(request, { bucket: "uploads", write: true });

  if (guard.response) {
    return guard.response;
  }

  let config: ReturnType<typeof requireQreviewUploadConfig>;

  try {
    // Truyền request để phát hiện chính xác trường hợp URL website trỏ ngược
    // về host CRM — nguyên nhân gây 404 upload và vòng lặp 500 ở ảnh.
    config = requireQreviewUploadConfig(request);
  } catch (error) {
    if (error instanceof QreviewSiteConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
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

    const response = await fetch(`${config.base}/api/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      body: outgoing,
      // Dia chi lay tu bien moi truong (quan tri vien dat), khong phai tu
      // request cua nguoi dung, nen day khong phai be mat SSRF.
      redirect: "error",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    let data: UploadResponse | null = null;

    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(text || "null") as UploadResponse | null;
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          {
            error:
              "Website Qreview từ chối QREVIEW_ADMIN_TOKEN. Hãy đồng bộ token này với ADMIN_TOKEN của website rồi khởi động lại CRM.",
          },
          { status: 502 }
        );
      }

      // Lỗi hợp lệ của website (file quá lớn, sai định dạng...) vẫn
      // giữ nguyên status và thông báo. Riêng HTML/404 của sai upstream được
      // đổi thành JSON 502 để frontend không rơi vào response.json() error.
      if (data && typeof data.error === "string") {
        return NextResponse.json(data, { status: response.status });
      }

      const detail =
        response.status === 404
          ? "Không tìm thấy /api/uploads trên website đích. Kiểm tra QREVIEW_SITE_URL có đang trỏ đúng https://qreview.asia không."
          : `Website Qreview trả phản hồi không hợp lệ (HTTP ${response.status}).`;

      return NextResponse.json({ error: detail }, { status: 502 });
    }

    if (!data || !Array.isArray(data.urls)) {
      return NextResponse.json(
        { error: "Website Qreview không trả về danh sách đường dẫn ảnh hợp lệ." },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return serverErrorResponse(
      "Qreview upload proxy error",
      error,
      "Không kết nối được tới website để tải ảnh lên. Kiểm tra website có đang chạy không."
    );
  }
}

import "server-only";

import { NextResponse } from "next/server";

import { requireQreviewAdmin } from "@/lib/qreview/guard";
import { readJsonBody, serverErrorResponse } from "@/lib/qreview/api-security";
import { ensureDatabaseConfig } from "@/lib/qreview/db";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

/**
 * Khung chung cho cac route quan tri WEBSITE Qreview (`/api/qreview/*`).
 *
 * Moi endpoint deu can dung mot chuoi buoc: gioi han tan suat, kiem tra quyen,
 * kiem tra cau hinh CSDL, doc body co gioi han kich thuoc, va tra loi loi ma
 * khong lo chi tiet noi bo. Gom lai mot cho de khong endpoint nao lo quen mot
 * buoc.
 *
 * Khac ban goc trong du an Qreview o DUY NHAT lop xac thuc: quyen truy cap lay
 * tu phien dang nhap CUA CRM (superadmin) chu khong con doc bang `users` cua
 * website. Phan con lai — gioi han tan suat, doc body, dich loi MySQL — giu
 * nguyen de hang tram cau truy van ben duoi khong phai thay doi.
 */

const ADMIN_BODY_MAX_BYTES = 256 * 1024;

type GuardOptions = {
  /** Ten bucket rate limit; mac dinh tach rieng doc va ghi. */
  bucket: string;
  /** true khi request lam thay doi du lieu (siet chat hon). */
  write?: boolean;
};

export type AdminGuardResult = {
  /** Non-null khi bi tu choi — tra thang ve client. */
  response: NextResponse | null;
  /** Id nguoi dung CRM dang thao tac. */
  actorId: string | null;
  actorEmail: string | null;
};

/** Chan request khong hop le truoc khi handler cham vao du lieu. */
export async function guardAdminRequest(
  request: Request,
  options: GuardOptions
): Promise<AdminGuardResult> {
  const limit = options.write ? 60 : 120;
  const bucket = `qreview-${options.bucket}-${options.write ? "write" : "read"}`;
  const limited = rateLimit(`${bucket}:${clientIp(request)}`, limit, 60 * 1000);

  if (!limited.ok) {
    return {
      response: NextResponse.json(
        { error: "Ban thao tac qua nhanh. Vui long thu lai sau." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
      ),
      actorId: null,
      actorEmail: null,
    };
  }

  const auth = await requireQreviewAdmin();

  if ("response" in auth) {
    return { response: auth.response, actorId: null, actorEmail: null };
  }

  try {
    ensureDatabaseConfig();
  } catch (error) {
    return {
      response: serverErrorResponse(
        "Qreview admin route DB config error",
        error,
        "Cau hinh co so du lieu website chua day du."
      ),
      actorId: null,
      actorEmail: null,
    };
  }

  return {
    response: null,
    actorId: auth.user.id,
    actorEmail: auth.user.email,
  };
}

/**
 * Doc body JSON cua request quan tri.
 *
 * Mac dinh 256KB — du cho moi bieu mau quan tri. Truyen `maxBytes` de noi rong
 * cho noi dung dai (bai viet co the vai tram KB), nhung van phai co gioi han:
 * body khong gioi han la cach de nhat de lam can bo nho may chu.
 */
export function readAdminBody<T>(request: Request, maxBytes = ADMIN_BODY_MAX_BYTES) {
  return readJsonBody<T>(request, maxBytes);
}

/** Loi 400 kem thong bao cu the. */
export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Khong tim thay du lieu.") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

/**
 * Chuyen loi MySQL thanh phan hoi de hieu.
 *
 * Tra ve null neu day khong phai loi da biet — khi do handler nen nem tiep de
 * `serverErrorResponse` ghi log day du.
 */
export function translateDbError(error: unknown) {
  const code = (error as { code?: string }).code;

  if (code === "ER_DUP_ENTRY") {
    return conflict("Giá trị này đã tồn tại, vui lòng chọn giá trị khác.");
  }

  if (code === "ER_ROW_IS_REFERENCED_2" || code === "ER_ROW_IS_REFERENCED") {
    return conflict("Bản ghi đang được sử dụng ở nơi khác nên không thể xoá.");
  }

  return null;
}

// --- Chuan hoa gia tri -----------------------------------------------------

/**
 * Bo dau tieng Viet va chuyen thanh slug.
 *
 * `normalizeSlug` trong db.ts chi loai bo ky tu khong phai a-z0-9, nen ten
 * tieng Viet co dau se bi mat chu. Ham nay chuyen dau thanh chu khong dau
 * truoc, giu duoc y nghia cua ten.
 */
export function slugifyVietnamese(value: string) {
  const decomposed = value.toLowerCase().replace(/đ/g, "d").normalize("NFD");

  let stripped = "";

  for (const char of decomposed) {
    const code = char.codePointAt(0) ?? 0;

    // U+0300..U+036F la cac dau thanh/dau mu tach ra sau khi normalize("NFD").
    if (code >= 0x0300 && code <= 0x036f) {
      continue;
    }

    stripped += char;
  }

  return stripped.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Ep ve so nguyen khong am, dung cho id tu client. */
export function toPositiveInt(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && Number(text) > 0 ? text : null;
}

/** Ep ve so nguyen (co the am), dung cho sort_order. */
export function toInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

/** Chuyen checkbox cua form thanh 0/1 de luu vao cot TINYINT. */
export function toFlag(value: unknown) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "on" ? 1 : 0;
}

const ACTIVE_STATUSES = new Set(["active", "inactive"]);

export function toStatus(value: unknown, fallback = "active") {
  const text = String(value ?? "").trim().toLowerCase();
  return ACTIVE_STATUSES.has(text) ? text : fallback;
}

export function toIsoDate(value: unknown) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

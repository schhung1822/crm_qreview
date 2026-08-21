import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import {
  guardAdminRequest,
  readAdminBody,
} from "@/lib/qreview/api";
import { serverErrorResponse } from "@/lib/qreview/api-security";
import {
  normalizeHomepageConfig,
  parseStoredHomepageConfig,
} from "@/lib/qreview/homepage-config";
import { getDbPool, queryRows } from "@/lib/qreview/db";
import { createDefaultHomepageConfig } from "@/lib/qreview/homepage-types";

export const runtime = "nodejs";

const UTF8_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

type HomepageSettingsRow = RowDataPacket & {
  config_json: string | Record<string, unknown> | null;
  update_time: Date | string | null;
};

function isMissingHomepageTable(error: unknown) {
  return (error as { code?: string })?.code === "ER_NO_SUCH_TABLE";
}

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "homepage" });
    if (guard.response) return guard.response;

    try {
      const rows = await queryRows<HomepageSettingsRow>(
        "SELECT config_json, update_time FROM homepage_settings WHERE id = 1 LIMIT 1"
      );

      return NextResponse.json(
        {
          config: rows[0]
            ? parseStoredHomepageConfig(rows[0].config_json)
            : createDefaultHomepageConfig(),
          updatedAt: rows[0]?.update_time ?? null,
          setupRequired: false,
        },
        { headers: UTF8_HEADERS }
      );
    } catch (error) {
      if (!isMissingHomepageTable(error)) throw error;

      return NextResponse.json(
        {
          config: createDefaultHomepageConfig(),
          updatedAt: null,
          setupRequired: true,
        },
        { headers: UTF8_HEADERS }
      );
    }
  } catch (error) {
    return serverErrorResponse(
      "Admin homepage read error",
      error,
      "Không thể tải cấu hình trang chủ."
    );
  }
}

export async function PUT(request: Request) {
  try {
    const guard = await guardAdminRequest(request, {
      bucket: "homepage",
      write: true,
    });
    if (guard.response) return guard.response;

    const body = await readAdminBody<{ config?: unknown }>(request);
    if (body.error) return body.error;

    const config = normalizeHomepageConfig(body.data.config);

    try {
      await getDbPool().query(
        `
          INSERT INTO homepage_settings
            (id, config_json, updated_by, create_time, update_time)
          VALUES (1, ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            config_json = VALUES(config_json),
            updated_by = VALUES(updated_by),
            update_time = NOW()
        `,
        [JSON.stringify(config), guard.actorId]
      );
    } catch (error) {
      if (isMissingHomepageTable(error)) {
        return NextResponse.json(
          {
            error:
              "Chưa có bảng cấu hình trang chủ. Hãy chạy migration database/mysql/apply-20260811-homepage-settings.js.",
          },
          { status: 503, headers: UTF8_HEADERS }
        );
      }
      throw error;
    }

    return NextResponse.json(
      {
        config,
        message: "Đã cập nhật nội dung trang chủ.",
      },
      { headers: UTF8_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(
      "Admin homepage update error",
      error,
      "Không thể lưu cấu hình trang chủ."
    );
  }
}

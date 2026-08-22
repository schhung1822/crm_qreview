import { describe, expect, it } from "vitest";

import {
  parseQreviewSiteBaseUrl,
  qreviewSiteMatchesRequestHost,
  qreviewSitesShareOrigin,
} from "@/lib/qreview/site-origin";

describe("parseQreviewSiteBaseUrl", () => {
  it("chuẩn hóa dấu gạch chéo cuối", () => {
    expect(parseQreviewSiteBaseUrl(" https://qreview.asia/// ")).toEqual({
      ok: true,
      base: "https://qreview.asia",
    });
  });

  it("giữ subpath hợp lệ", () => {
    expect(parseQreviewSiteBaseUrl("https://example.com/qreview/")).toEqual({
      ok: true,
      base: "https://example.com/qreview",
    });
  });

  it.each([
    ["", "đang để trống"],
    ["qreview.asia", "không phải URL tuyệt đối hợp lệ"],
    ["ftp://qreview.asia", "chỉ được dùng giao thức http hoặc https"],
    ["https://user:pass@qreview.asia", "không được chứa tài khoản hoặc mật khẩu"],
    ["https://qreview.asia?x=1", "không được chứa query hoặc hash"],
  ])("từ chối cấu hình sai %s", (value, reason) => {
    expect(parseQreviewSiteBaseUrl(value)).toEqual({ ok: false, reason });
  });
});

describe("self proxy detection", () => {
  it("nhận ra website đang trỏ về chính host CRM", () => {
    expect(
      qreviewSiteMatchesRequestHost("https://crm.qreview.asia", "crm.qreview.asia")
    ).toBe(true);
    expect(
      qreviewSiteMatchesRequestHost(
        "https://crm.qreview.asia",
        "crm.qreview.asia, internal-proxy"
      )
    ).toBe(true);
  });

  it("không coi website thật là CRM", () => {
    expect(qreviewSiteMatchesRequestHost("https://qreview.asia", "crm.qreview.asia")).toBe(
      false
    );
  });

  it("so được origin từ hai URL", () => {
    expect(qreviewSitesShareOrigin("https://crm.qreview.asia/a", "https://crm.qreview.asia/b")).toBe(
      true
    );
    expect(qreviewSitesShareOrigin("https://qreview.asia", "https://crm.qreview.asia")).toBe(
      false
    );
  });
});

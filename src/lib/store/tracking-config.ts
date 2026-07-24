// Cấu hình PIXEL + CONVERSION API cấp nền tảng - .data/tracking-config.json (toàn cục, gitignored).
// Hỗ trợ NHIỀU pixel Facebook + NHIỀU pixel TikTok, cùng GA4 (Measurement Protocol) và Google Tag
// Manager. Access token/API secret mã hóa AES-GCM. Server-only.
import { randomBytes } from 'node:crypto';
import { decryptWith, encryptWith } from '../crypto';
import { mutateGlobalConfig, readGlobalConfig } from '../data/config-store';
import { resolveEncryptionKey } from '../secrets/key';

export interface FbPixel {
  id: string;
  pixelId: string; // = Dataset ID trong Events Manager
  accessToken: string; // token CAPI (đã giải mã ở getTrackingConfig)
  testCode: string;
  enabled: boolean;
}
export interface TtPixel {
  id: string;
  pixelCode: string; // event_source_id
  accessToken: string; // token Events API (đã giải mã)
  testCode: string;
  enabled: boolean;
}
export interface TrackingConfig {
  fb: FbPixel[];
  tt: TtPixel[];
  ga4Enabled: boolean;
  ga4MeasurementId: string; // G-XXXXXXX
  ga4ApiSecret: string; // Measurement Protocol API secret (đã giải mã)
  gtmEnabled: boolean;
  gtmContainerId: string; // GTM-XXXXXXX
}

interface StoredFb {
  id: string;
  pixelId?: string;
  accessToken?: string; // đã mã hóa
  testCode?: string;
  enabled?: boolean;
}
interface StoredTt {
  id: string;
  pixelCode?: string;
  accessToken?: string; // đã mã hóa
  testCode?: string;
  enabled?: boolean;
}
interface Data {
  fb?: StoredFb[];
  tt?: StoredTt[];
  ga4Enabled?: boolean;
  ga4MeasurementId?: string;
  ga4ApiSecret?: string; // đã mã hóa
  gtmEnabled?: boolean;
  gtmContainerId?: string;
}

const FILE = 'tracking-config.json';

// Đọc/ghi qua json-store: KHÓA theo file + ghi ATOMIC (chống mất token pixel/CAPI đã mã hóa).
async function read(): Promise<Data> {
  return readGlobalConfig<Data>(FILE, {});
}
function safeDecrypt(payload?: string): string {
  if (!payload) return '';
  try {
    return decryptWith(resolveEncryptionKey(), payload);
  } catch {
    return '';
  }
}
const enc = (v: string) => encryptWith(resolveEncryptionKey(), v);
const newId = () => randomBytes(8).toString('hex');

// ── Đầu vào lưu (token là plaintext hoặc rỗng = giữ token cũ theo id) ──
export interface SaveFb {
  id?: string;
  pixelId?: string;
  accessToken?: string;
  testCode?: string;
  enabled?: boolean;
}
export interface SaveTt {
  id?: string;
  pixelCode?: string;
  accessToken?: string;
  testCode?: string;
  enabled?: boolean;
}
export interface SavePatch {
  fb?: SaveFb[];
  tt?: SaveTt[];
  ga4Enabled?: boolean;
  ga4MeasurementId?: string;
  ga4ApiSecret?: string;
  gtmEnabled?: boolean;
  gtmContainerId?: string;
}

// Cấu hình đầy đủ (giải mã token) - dùng server (gửi Conversion API).
export async function getTrackingConfig(): Promise<TrackingConfig> {
  const d = await read();
  return {
    fb: (d.fb ?? []).map((p) => ({
      id: p.id,
      pixelId: p.pixelId ?? '',
      accessToken: safeDecrypt(p.accessToken),
      testCode: p.testCode ?? '',
      enabled: p.enabled ?? false,
    })),
    tt: (d.tt ?? []).map((p) => ({
      id: p.id,
      pixelCode: p.pixelCode ?? '',
      accessToken: safeDecrypt(p.accessToken),
      testCode: p.testCode ?? '',
      enabled: p.enabled ?? false,
    })),
    ga4Enabled: d.ga4Enabled ?? false,
    ga4MeasurementId: d.ga4MeasurementId ?? '',
    ga4ApiSecret: safeDecrypt(d.ga4ApiSecret),
    gtmEnabled: d.gtmEnabled ?? false,
    gtmContainerId: d.gtmContainerId ?? '',
  };
}

// Trạng thái cho UI Quản trị (KHÔNG trả token, chỉ báo đã đặt hay chưa).
export interface TrackingAdminView {
  fb: Array<{ id: string; pixelId: string; testCode: string; enabled: boolean; tokenSet: boolean }>;
  tt: Array<{ id: string; pixelCode: string; testCode: string; enabled: boolean; tokenSet: boolean }>;
  ga4Enabled: boolean;
  ga4MeasurementId: string;
  ga4ApiSecretSet: boolean;
  gtmEnabled: boolean;
  gtmContainerId: string;
}
export async function getTrackingConfigAdmin(): Promise<TrackingAdminView> {
  const d = await read();
  return {
    fb: (d.fb ?? []).map((p) => ({
      id: p.id,
      pixelId: p.pixelId ?? '',
      testCode: p.testCode ?? '',
      enabled: p.enabled ?? false,
      tokenSet: !!p.accessToken,
    })),
    tt: (d.tt ?? []).map((p) => ({
      id: p.id,
      pixelCode: p.pixelCode ?? '',
      testCode: p.testCode ?? '',
      enabled: p.enabled ?? false,
      tokenSet: !!p.accessToken,
    })),
    ga4Enabled: d.ga4Enabled ?? false,
    ga4MeasurementId: d.ga4MeasurementId ?? '',
    ga4ApiSecretSet: !!d.ga4ApiSecret,
    gtmEnabled: d.gtmEnabled ?? false,
    gtmContainerId: d.gtmContainerId ?? '',
  };
}

// Bản CÔNG KHAI cho trình duyệt nhúng pixel (chỉ id + bật/tắt, KHÔNG token).
export interface TrackingPublic {
  fb: string[]; // pixelId các pixel đang bật
  tt: string[]; // pixelCode các pixel đang bật
  ga4Enabled: boolean;
  ga4MeasurementId: string;
  gtmEnabled: boolean;
  gtmContainerId: string;
}
export async function getTrackingPublic(): Promise<TrackingPublic> {
  const d = await read();
  return {
    fb: (d.fb ?? []).filter((p) => p.enabled && p.pixelId).map((p) => p.pixelId!),
    tt: (d.tt ?? []).filter((p) => p.enabled && p.pixelCode).map((p) => p.pixelCode!),
    ga4Enabled: (d.ga4Enabled ?? false) && !!d.ga4MeasurementId,
    ga4MeasurementId: d.ga4MeasurementId ?? '',
    gtmEnabled: (d.gtmEnabled ?? false) && !!d.gtmContainerId,
    gtmContainerId: d.gtmContainerId ?? '',
  };
}

const clip = (s: string | undefined, n = 64) => (s ?? '').trim().slice(0, n);

export async function saveTrackingConfig(patch: SavePatch): Promise<void> {
  await mutateGlobalConfig<Data, void>(FILE, {}, (d) => {
  const oldFb = new Map((d.fb ?? []).map((p) => [p.id, p]));
  const oldTt = new Map((d.tt ?? []).map((p) => [p.id, p]));

  if (patch.fb) {
    d.fb = patch.fb.map((p) => {
      const id = p.id && oldFb.has(p.id) ? p.id : newId();
      const prev = p.id ? oldFb.get(p.id) : undefined;
      return {
        id,
        pixelId: clip(p.pixelId),
        testCode: clip(p.testCode),
        enabled: p.enabled ?? false,
        // Token rỗng = giữ token cũ (đã mã hóa) của item cùng id.
        accessToken: p.accessToken?.trim() ? enc(p.accessToken.trim()) : prev?.accessToken,
      };
    });
  }
  if (patch.tt) {
    d.tt = patch.tt.map((p) => {
      const id = p.id && oldTt.has(p.id) ? p.id : newId();
      const prev = p.id ? oldTt.get(p.id) : undefined;
      return {
        id,
        pixelCode: clip(p.pixelCode),
        testCode: clip(p.testCode),
        enabled: p.enabled ?? false,
        accessToken: p.accessToken?.trim() ? enc(p.accessToken.trim()) : prev?.accessToken,
      };
    });
  }
  if (patch.ga4Enabled !== undefined) d.ga4Enabled = patch.ga4Enabled;
  if (patch.ga4MeasurementId !== undefined) d.ga4MeasurementId = clip(patch.ga4MeasurementId);
  if (patch.ga4ApiSecret?.trim()) d.ga4ApiSecret = enc(patch.ga4ApiSecret.trim());
  if (patch.gtmEnabled !== undefined) d.gtmEnabled = patch.gtmEnabled;
  if (patch.gtmContainerId !== undefined) d.gtmContainerId = clip(patch.gtmContainerId);

    return [d, undefined];
  });
}

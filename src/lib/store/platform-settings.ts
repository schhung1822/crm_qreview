// Cấu hình VẬN HÀNH nền tảng dùng chung toàn cục - .data/platform-settings.json.
// Hiện chứa: công tắc TỰ ĐĂNG KÝ tài khoản mới. Superadmin bật/tắt ở Quản trị nền tảng → Người dùng.
// KHÔNG chứa bí mật. Server-only.
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

interface PlatformSettings {
  selfRegistrationEnabled?: boolean;
}

const FILE = globalFile('platform-settings.json');

// Mặc định khi CHƯA đặt qua admin: theo env DISABLE_SELF_REGISTRATION (giữ tương thích cũ).
// Một khi superadmin bật/tắt trong UI, giá trị đã lưu sẽ GHI ĐÈ env.
function envDefault(): boolean {
  return process.env.DISABLE_SELF_REGISTRATION !== 'true';
}

export async function getSelfRegistrationEnabled(): Promise<boolean> {
  const d = await readJson<PlatformSettings>(FILE, {});
  return typeof d.selfRegistrationEnabled === 'boolean' ? d.selfRegistrationEnabled : envDefault();
}

export async function setSelfRegistrationEnabled(enabled: boolean): Promise<boolean> {
  await mutateJson<PlatformSettings, void>(FILE, {}, (cur) => [
    { ...cur, selfRegistrationEnabled: enabled },
    undefined,
  ]);
  return getSelfRegistrationEnabled();
}

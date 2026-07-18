// CANH GÁC hồi quy lỗi "link trỏ 0.0.0.0:3000" (đã xảy ra production 07-2026):
// mọi URL tuyệt đối phía server PHẢI đi qua requestBaseUrl() (src/lib/base-url.ts) -
// helper này ưu tiên APP_URL → X-Forwarded-Host → origin. Dùng thẳng origin của request
// (new URL(req.url).origin) sau reverse-proxy sẽ ra địa chỉ bind nội bộ → link sai.
// Test này quét toàn bộ src/: pattern cấm xuất hiện ngoài base-url.ts là FAIL.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { requestBaseUrl } from '../src/lib/base-url';

const SRC = join(__dirname, '..', 'src');
const isAllowed = (f: string) => f.replace(/\\/g, '/').endsWith('lib/base-url.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('canh gác base URL (chống hồi quy link 0.0.0.0:3000)', () => {
  it('không file nào ngoài lib/base-url.ts dùng new URL(req.url).origin / env.appUrl || origin', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      if (isAllowed(f)) continue;
      const s = readFileSync(f, 'utf8');
      // Cấm cả 2 dạng đã từng gây lỗi: suy origin trực tiếp từ request, và pattern cũ
      // env.appUrl || <origin>. URL tuyệt đối phải dùng requestBaseUrl(req).
      if (/new URL\(req\.url\)\.origin/.test(s) || /env\.appUrl\s*\|\|/.test(s)) {
        offenders.push(f.slice(SRC.length + 1));
      }
    }
    expect(offenders, `Dùng requestBaseUrl(req) từ lib/base-url.ts thay vì origin request: ${offenders.join(', ')}`).toEqual([]);
  });

  it('requestBaseUrl: ưu tiên X-Forwarded-Proto/Host khi không có APP_URL', () => {
    const req = new Request('http://0.0.0.0:3000/api/link/abc', {
      headers: { 'x-forwarded-host': 'demo.noti.vn', 'x-forwarded-proto': 'https' },
    });
    expect(requestBaseUrl(req)).toBe('https://demo.noti.vn');
    // Không qua proxy → origin của chính request (dev localhost).
    expect(requestBaseUrl(new Request('http://localhost:3000/x'))).toBe('http://localhost:3000');
    // Nhiều giá trị phân tách phẩy (chuỗi proxy) → lấy giá trị ĐẦU.
    const req2 = new Request('http://0.0.0.0:3000/x', {
      headers: { 'x-forwarded-host': 'demo.noti.vn, internal', 'x-forwarded-proto': 'https, http' },
    });
    expect(requestBaseUrl(req2)).toBe('https://demo.noti.vn');
  });
});

// Kho kết nối CMS - credential mã hóa AES-GCM, lưu file .data/biz/<bizId>/connections.json.
// CÔ LẬP THEO BIZ: mỗi biz chỉ thấy/dùng kết nối của biz đó. Server-only. KHÔNG trả credential ra client.
import { randomBytes } from 'node:crypto';
import { decrypt, encrypt } from '../crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { getCmsAdapter, type CmsAdapter, type CmsProvider } from '../cms';

export type { CmsProvider };

export interface ConnectionInput {
  provider: CmsProvider;
  label: string;
  baseUrl: string; // WP site URL / Wix site URL / Shopify store domain
  locale: string;
  pathStrategy?: 'subdir' | 'subdomain';
  seoPlugin?: string; // wordpress: yoast | rankmath | none
  credentials: Record<string, string>;
}

export interface ConnectionRecord {
  id: string;
  provider: CmsProvider;
  label: string;
  baseUrl: string;
  locale: string;
  pathStrategy: 'subdir' | 'subdomain';
  seoPlugin?: string;
  status: 'active' | 'error';
  createdAt: string;
  encrypted: string;
}

// Bản an toàn để trả về client (không có credential).
export type ConnectionPublic = Omit<ConnectionRecord, 'encrypted'>;

const NAME = 'connections.json';

async function readAll(): Promise<ConnectionRecord[]> {
  return readJson<ConnectionRecord[]>(bizFile(NAME), []);
}

function toPublic(r: ConnectionRecord): ConnectionPublic {
  const { encrypted: _omit, ...rest } = r;
  void _omit;
  return rest;
}

function genId(): string {
  return 'conn_' + randomBytes(9).toString('hex');
}

export async function listConnections(): Promise<ConnectionPublic[]> {
  return (await readAll()).map(toPublic);
}

export async function createConnection(input: ConnectionInput): Promise<ConnectionPublic> {
  const record: ConnectionRecord = {
    id: genId(),
    provider: input.provider,
    label: input.label,
    baseUrl: input.baseUrl,
    locale: input.locale,
    pathStrategy: input.pathStrategy ?? 'subdir',
    seoPlugin: input.seoPlugin,
    status: 'active',
    createdAt: new Date().toISOString(),
    encrypted: encrypt(JSON.stringify(input.credentials)),
  };
  return mutateJson<ConnectionRecord[], ConnectionPublic>(bizFile(NAME), [], (rows) => [
    [...rows, record],
    toPublic(record),
  ]);
}

export async function deleteConnection(id: string): Promise<void> {
  await mutateJson<ConnectionRecord[], void>(bizFile(NAME), [], (rows) => [
    rows.filter((r) => r.id !== id),
    undefined,
  ]);
}

export async function setConnectionStatus(
  id: string,
  status: 'active' | 'error',
): Promise<void> {
  await mutateJson<ConnectionRecord[], void>(bizFile(NAME), [], (rows) => {
    const row = rows.find((r) => r.id === id);
    if (row) row.status = status;
    return [rows, undefined];
  });
}

// Lấy credential đã giải mã (server-only).
export async function getConnectionCreds(
  id: string,
): Promise<{ record: ConnectionRecord; credentials: Record<string, string> } | null> {
  const record = (await readAll()).find((r) => r.id === id);
  if (!record) return null; // thực sự không tồn tại
  try {
    return { record, credentials: JSON.parse(decrypt(record.encrypted)) };
  } catch (e) {
    // Record TỒN TẠI nhưng không giải mã được → nguyên nhân thường gặp: ENCRYPTION_KEY
    // đã đổi/khác so với lúc lưu. KHÔNG nuốt im lặng (trước đây trả null làm người dùng
    // tưởng "không tìm thấy kết nối"): log rõ + đánh dấu kết nối 'error' để UI hiện badge
    // đỏ, gợi ý nhập lại credential.
    console.error(
      `[connections] Không giải mã được credential cho "${id}" - nhiều khả năng ENCRYPTION_KEY ` +
        `đã thay đổi so với lúc lưu. Cần xóa & thêm lại kết nối này.`,
      e instanceof Error ? e.message : e,
    );
    await setConnectionStatus(id, 'error').catch(() => {});
    return null;
  }
}

// Tạo adapter CMS sẵn sàng gọi API từ một connection đã lưu.
export async function adapterFromConnection(id: string): Promise<{
  adapter: CmsAdapter;
  record: ConnectionRecord;
} | null> {
  const loaded = await getConnectionCreds(id);
  if (!loaded) return null;
  const adapter = getCmsAdapter(loaded.record.provider, {
    baseUrl: loaded.record.baseUrl,
    locale: loaded.record.locale,
    pathStrategy: loaded.record.pathStrategy,
    seoPlugin: loaded.record.seoPlugin,
    credentials: loaded.credentials,
  });
  return { adapter, record: loaded.record };
}

// Test 1 bộ credential chưa lưu (cho nút "Test kết nối" khi thêm mới).
export async function testConnectionInput(
  input: Pick<ConnectionInput, 'provider' | 'baseUrl' | 'locale' | 'seoPlugin' | 'credentials'>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const adapter = getCmsAdapter(input.provider, {
      baseUrl: input.baseUrl,
      locale: input.locale,
      pathStrategy: 'subdir',
      seoPlugin: input.seoPlugin,
      credentials: input.credentials,
    });
    const ok = await adapter.testConnection();
    return { ok };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

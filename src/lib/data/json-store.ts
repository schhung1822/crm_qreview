// Tiện ích đọc/ghi JSON cho kho dữ liệu. Có 2 backend, chọn qua STORAGE_DRIVER:
//  - 'file' (mặc định): .data/*.json — ghi atomic tmp+rename, lock in-process (1 instance).
//  - 'prisma': mỗi file thành MỘT hàng bảng JsonBlob(scope,name,data) trên Postgres. mutateJson
//    dùng SELECT ... FOR UPDATE trong transaction → atomic ĐA-INSTANCE (thay khóa in-process).
//
// 27 store GIỮ NGUYÊN: chúng chỉ gọi readJson/writeJsonAtomic/mutateJson với đường dẫn file; ở đây
// đường dẫn được quy đổi thành (scope, name): scope = bizId (nếu path là .data/biz/<id>/...) hoặc
// "_global"; name = tên file. Nhờ vậy switch sang Postgres KHÔNG phải sửa store nào.
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const locks = new Map<string, Promise<unknown>>();

// ─────────────────────── Chọn backend ───────────────────────
function usePrisma(): boolean {
  return process.env.STORAGE_DRIVER === 'prisma';
}

// Client Prisma nạp ĐỘNG (chỉ khi driver=prisma) để driver file KHÔNG kéo @prisma/client vào.
type PrismaClientT = (typeof import('../prisma'))['prisma'];
let cachedClient: PrismaClientT | null = null;
async function client(): Promise<PrismaClientT> {
  if (!cachedClient) cachedClient = (await import('../prisma')).prisma;
  return cachedClient;
}

// Quy đổi đường dẫn file .data → (scope, name) cho JsonBlob.
//  .data/biz/<bizId>/articles.json → { scope: <bizId>, name: 'articles.json' }
//  .data/users.json                → { scope: '_global', name: 'users.json' }
// QUAN TRỌNG: scope quyết định dữ liệu thuộc tenant nào — sai scope = rò/ghi nhầm biz. Export để
// test kỹ (gồm cả separator Windows). base mặc định là .data theo cwd (khớp bizFile/globalFile).
const DATA_BASE = path.join(process.cwd(), '.data');
export function blobKeyForPath(file: string, base: string = DATA_BASE): { scope: string; name: string } {
  const rel = path.relative(base, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { scope: '_global', name: path.basename(file) };
  }
  const parts = rel.split(/[\\/]/);
  if (parts[0] === 'biz' && parts.length >= 3) {
    return { scope: parts[1], name: parts.slice(2).join('/') };
  }
  return { scope: '_global', name: parts.join('/') };
}
const blobKey = (file: string) => blobKeyForPath(file);

// ─────────────────────── Lock (chỉ dùng cho driver file) ───────────────────────
export function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  // Chạy fn sau khi thao tác trước hoàn tất, BẤT KỂ nó thành công hay lỗi.
  const next = prev.then(fn, fn);
  // Giữ chuỗi sống nhưng nuốt lỗi để không vỡ hàng đợi.
  locks.set(
    file,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

// ─────────────────────── API công khai (không đổi chữ ký) ───────────────────────
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  if (usePrisma()) {
    const { scope, name } = blobKey(file);
    const row = await (await client()).jsonBlob.findUnique({ where: { scope_name: { scope, name } } });
    return row ? (row.data as T) : fallback;
  }
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  if (usePrisma()) {
    const { scope, name } = blobKey(file);
    const p = await client();
    await p.jsonBlob.upsert({
      where: { scope_name: { scope, name } },
      create: { scope, name, data: data as object },
      update: { data: data as object },
    });
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

// Đọc → biến đổi → ghi atomic. mutator trả về [dữ liệu-mới, kết-quả-trả-về].
//  - file: trong 1 lock theo file (an toàn 1 instance).
//  - prisma: trong 1 transaction có SELECT ... FOR UPDATE (an toàn ĐA-INSTANCE).
export async function mutateJson<T, R>(
  file: string,
  fallback: T,
  mutator: (current: T) => Promise<[T, R]> | [T, R],
): Promise<R> {
  if (usePrisma()) {
    const { scope, name } = blobKey(file);
    const p = await client();
    return p.$transaction(
      async (tx) => {
        // Đảm bảo hàng tồn tại (không khóa được hàng chưa có) rồi khóa nó để đọc-sửa-ghi atomic.
        await tx.$executeRaw`INSERT INTO "JsonBlob" ("scope","name","data","version","updatedAt")
          VALUES (${scope}, ${name}, ${JSON.stringify(fallback)}::jsonb, 0, now())
          ON CONFLICT ("scope","name") DO NOTHING`;
        const rows = await tx.$queryRaw<Array<{ data: T }>>`SELECT "data" FROM "JsonBlob"
          WHERE "scope"=${scope} AND "name"=${name} FOR UPDATE`;
        const current = (rows.length ? rows[0].data : fallback) as T;
        const [nextData, result] = await mutator(current);
        await tx.$executeRaw`UPDATE "JsonBlob"
          SET "data"=${JSON.stringify(nextData)}::jsonb, "version"="version"+1, "updatedAt"=now()
          WHERE "scope"=${scope} AND "name"=${name}`;
        return result;
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  }
  return withFileLock(file, async () => {
    const current = await readJson(file, fallback);
    const [next, result] = await mutator(current);
    await writeJsonAtomic(file, next);
    return result;
  });
}

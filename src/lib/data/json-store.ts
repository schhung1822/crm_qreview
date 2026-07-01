// Tiện ích đọc/ghi JSON cho kho file .data/*.json:
// - writeJsonAtomic: ghi ra file tạm rồi rename → không bao giờ để lại file hỏng/cụt
//   nếu tiến trình chết giữa chừng.
// - withFileLock: hàng đợi theo từng file → các thao tác read-modify-write KHÔNG xen
//   kẽ nhau (chống mất ghi khi nhiều request đồng thời trong 1 instance).
// - mutateJson: gói read → mutate → ghi atomic trong 1 lock (cách dùng khuyến nghị).
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const locks = new Map<string, Promise<unknown>>();

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

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
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

// Đọc → biến đổi → ghi atomic, toàn bộ trong một lock theo file. mutator trả về
// [dữ liệu-mới, kết-quả-trả-về].
export async function mutateJson<T, R>(
  file: string,
  fallback: T,
  mutator: (current: T) => Promise<[T, R]> | [T, R],
): Promise<R> {
  return withFileLock(file, async () => {
    const current = await readJson(file, fallback);
    const [next, result] = await mutator(current);
    await writeJsonAtomic(file, next);
    return result;
  });
}

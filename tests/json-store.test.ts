import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mutateJson, readJson, writeJsonAtomic } from '@/lib/data/json-store';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonstore-'));
  file = path.join(dir, 'data.json');
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('json-store', () => {
  it('readJson trả fallback khi file chưa có', async () => {
    expect(await readJson(file, [])).toEqual([]);
  });

  it('writeJsonAtomic ghi & đọc lại đúng', async () => {
    await writeJsonAtomic(file, { a: 1 });
    expect(await readJson(file, null)).toEqual({ a: 1 });
    // Không để lại file .tmp
    const left = (await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'));
    expect(left).toEqual([]);
  });

  it('mutateJson serialize 200 ghi đồng thời — KHÔNG mất update', async () => {
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        mutateJson<number[], void>(file, [], (rows) => [[...rows, i], undefined]),
      ),
    );
    const rows = await readJson<number[]>(file, []);
    expect(rows).toHaveLength(200);
    expect(new Set(rows).size).toBe(200); // đủ 0..199, không trùng/mất
  });

  it('lỗi trong mutator không phá hàng đợi của các lần sau', async () => {
    await expect(
      mutateJson<number[], void>(file, [], () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // Lần sau vẫn chạy bình thường
    await mutateJson<number[], void>(file, [], (rows) => [[...rows, 1], undefined]);
    expect(await readJson<number[]>(file, [])).toEqual([1]);
  });
});

// CANH GÁC cô lập tenant cho Thư viện ảnh (lỗ hổng đã vá 07-2026): user biz A KHÔNG được
// thấy / đổi tên / xóa ảnh của biz B. Index metadata cô lập theo biz (.data/biz/<id>/...).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Cookie sg_biz đổi được giữa các thao tác → giả lập user chuyển biz (bizFile đọc cookie này).
const state = vi.hoisted(() => ({ biz: 'biz_imgtestA' }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (k: string) => (k === 'sg_biz' ? { value: state.biz } : undefined) }),
}));

import {
  deleteImages,
  listImages,
  registerImage,
  renameImage,
} from '../src/lib/store/image-library';

const GEN_DIR = path.join(process.cwd(), 'public', 'generated');
const DATA = path.join(process.cwd(), '.data', 'biz');
const BIZ_A = 'biz_imgtestA';
const BIZ_B = 'biz_imgtestB';
const FILE_A = 'imgtest-a1b2c3.webp'; // ảnh của biz A
const FILE_B = 'imgtest-d4e5f6.webp'; // ảnh của biz B

async function touch(file: string) {
  await fs.mkdir(GEN_DIR, { recursive: true });
  await fs.writeFile(path.join(GEN_DIR, file), Buffer.from('fake-image-bytes'));
}
const exists = (file: string) =>
  fs
    .stat(path.join(GEN_DIR, file))
    .then(() => true)
    .catch(() => false);

beforeAll(async () => {
  await touch(FILE_A);
  await touch(FILE_B);
  state.biz = BIZ_A;
  await registerImage(FILE_A, 'ai', 'Ảnh của biz A');
  state.biz = BIZ_B;
  await registerImage(FILE_B, 'upload', 'Ảnh của biz B');
});

afterAll(async () => {
  await fs.rm(path.join(DATA, BIZ_A), { recursive: true, force: true });
  await fs.rm(path.join(DATA, BIZ_B), { recursive: true, force: true });
  await fs.rm(path.join(GEN_DIR, FILE_A), { force: true });
  await fs.rm(path.join(GEN_DIR, FILE_B), { force: true });
});

describe('Thư viện ảnh — cô lập tenant', () => {
  it('listImages CHỈ trả ảnh của biz hiện tại (không lộ ảnh biz khác)', async () => {
    state.biz = BIZ_A;
    const a = await listImages();
    expect(a.map((i) => i.file)).toEqual([FILE_A]);
    expect(a.map((i) => i.file)).not.toContain(FILE_B);

    state.biz = BIZ_B;
    const b = await listImages();
    expect(b.map((i) => i.file)).toEqual([FILE_B]);
    expect(b.map((i) => i.file)).not.toContain(FILE_A);
  });

  it('renameImage ảnh biz khác → FALSE (không đổi được)', async () => {
    state.biz = BIZ_B; // đứng ở biz B, thử đổi tên ảnh của biz A
    expect(await renameImage(FILE_A, 'chiếm tên')).toBe(false);

    // Xác nhận tên ảnh A ở biz A KHÔNG bị đổi.
    state.biz = BIZ_A;
    const a = await listImages();
    expect(a.find((i) => i.file === FILE_A)?.name).toBe('Ảnh của biz A');
    // Đổi tên ảnh của CHÍNH biz mình → OK.
    expect(await renameImage(FILE_A, 'Tên mới hợp lệ')).toBe(true);
    expect((await listImages()).find((i) => i.file === FILE_A)?.name).toBe('Tên mới hợp lệ');
  });

  it('deleteImages ảnh biz khác → 0 và FILE KHÔNG bị xóa', async () => {
    state.biz = BIZ_B; // đứng ở biz B, thử xóa ảnh của biz A
    expect(await deleteImages([FILE_A])).toBe(0);
    expect(await exists(FILE_A)).toBe(true); // file của biz A vẫn còn nguyên trên đĩa

    // Ảnh A vẫn thuộc biz A (index không bị đụng).
    state.biz = BIZ_A;
    expect((await listImages()).map((i) => i.file)).toContain(FILE_A);
  });

  it('deleteImages ảnh của CHÍNH mình → xóa cả index lẫn file', async () => {
    state.biz = BIZ_A;
    expect(await deleteImages([FILE_A])).toBe(1);
    expect(await exists(FILE_A)).toBe(false);
    expect((await listImages()).map((i) => i.file)).not.toContain(FILE_A);
    // Ảnh biz B không liên quan → vẫn còn.
    expect(await exists(FILE_B)).toBe(true);
  });
});

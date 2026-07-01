// Lưu ảnh đã tạo vào public/generated. NÉN bằng sharp → WebP (nhẹ, web load nhanh).
// Trả URL tĩnh /generated/<file>.webp. Server-only.
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

// Slug ngắn, không dấu, để đặt TÊN FILE ảnh theo chủ đề bài (tốt cho SEO ảnh).
function slugifyName(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu tiếng Việt
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

// hint: chủ đề/tiêu đề/alt để đặt tên + URL liên quan bài. Thêm hậu tố ngẫu nhiên
// ngắn tránh trùng. Không có hint → fallback "image".
export async function saveGeneratedImage(b64: string, hint?: string): Promise<string> {
  const dir = path.join(process.cwd(), 'public', 'generated');
  await fs.mkdir(dir, { recursive: true });
  const slug = slugifyName(hint ?? '') || 'image';
  const name = `${slug}-${randomBytes(3).toString('hex')}.webp`;

  const input = Buffer.from(b64, 'base64');
  let out: Buffer;
  try {
    // Giảm tối đa chiều rộng 1600px + nén WebP q72 → dung lượng nhỏ, đủ nét cho web.
    out = await sharp(input)
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
  } catch {
    // Nếu sharp lỗi (định dạng lạ) → giữ nguyên bytes gốc.
    out = input;
  }
  await fs.writeFile(path.join(dir, name), out);
  return `/generated/${name}`;
}

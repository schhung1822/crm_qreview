// Lưu ảnh đã tạo vào public/generated. NÉN bằng sharp → WebP (nhẹ, web load nhanh).
// Trả URL tĩnh /generated/<file>.webp. Server-only.
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { generatedImageDir } from '../generated-dir';
import { saveGeneratedImageBlob } from '../store/generated-images';
import { registerImage } from '../store/image-library';

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
export async function saveGeneratedImage(
  b64: string,
  hint?: string,
  // format: 'webp' (mặc định, ảnh nội dung — nhẹ) | 'jpeg' (ẢNH BÌA CHIA SẺ: Facebook/Zalo không
  // phải lúc nào cũng render WebP nên dùng JPEG cho chắc). maxWidth: giới hạn bề rộng (OG nên ~1200).
  opts?: { format?: 'webp' | 'jpeg'; maxWidth?: number },
): Promise<string> {
  const dir = generatedImageDir();
  await fs.mkdir(dir, { recursive: true });
  const slug = slugifyName(hint ?? '') || 'image';
  const format = opts?.format ?? 'webp';
  const ext = format === 'jpeg' ? 'jpg' : 'webp';
  const maxWidth = opts?.maxWidth ?? 1600;
  const name = `${slug}-${randomBytes(3).toString('hex')}.${ext}`;

  const input = Buffer.from(b64, 'base64');
  let out: Buffer;
  try {
    // Giảm bề rộng tối đa + nén: JPEG (mozjpeg, progressive) cho ảnh bìa; WebP q72 cho ảnh nội dung.
    const pipeline = sharp(input).resize({ width: maxWidth, withoutEnlargement: true });
    out =
      format === 'jpeg'
        ? await pipeline.jpeg({ quality: 82, mozjpeg: true, progressive: true }).toBuffer()
        : await pipeline.webp({ quality: 72 }).toBuffer();
  } catch {
    // Nếu sharp lỗi (định dạng lạ) → giữ nguyên bytes gốc.
    out = input;
  }
  await fs.writeFile(path.join(dir, name), out);
  await saveGeneratedImageBlob(name, format === 'jpeg' ? 'image/jpeg' : 'image/webp', out.toString('base64')).catch(() => {});
  // Ghi nhận vào Thư viện ảnh (best-effort — không chặn việc lưu ảnh nếu index lỗi).
  await registerImage(name, 'ai', hint).catch(() => {});
  return `/generated/${name}`;
}

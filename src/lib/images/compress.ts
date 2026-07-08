// Nén / chuyển định dạng ảnh bằng sharp. Server-only. Không lưu trữ - chỉ xử lý trong bộ nhớ.
// WebP/AVIF là định dạng thân thiện SEO/AEO/GEO (nhẹ hơn nhiều JPEG/PNG → tải nhanh → điểm
// Core Web Vitals tốt → engine tìm kiếm & AI ưu tiên). Mặc định STRIP metadata (nhẹ + riêng tư).
import sharp from 'sharp';

export type OutFormat = 'webp' | 'avif' | 'jpeg' | 'png' | 'original';
export const OUT_FORMATS: OutFormat[] = ['webp', 'avif', 'jpeg', 'png', 'original'];

export interface CompressOptions {
  format: OutFormat;
  quality: number; // 1..100
  maxWidth?: number; // px - thu nhỏ nếu ảnh rộng hơn (không phóng to)
  keepMeta?: boolean; // giữ EXIF/ICC (mặc định false = strip)
}
export interface CompressResult {
  buffer: Buffer;
  format: Exclude<OutFormat, 'original'>;
  mime: string;
  ext: string;
  width: number;
  height: number;
}

const MIME: Record<Exclude<OutFormat, 'original'>, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
const EXT: Record<Exclude<OutFormat, 'original'>, string> = {
  webp: 'webp',
  avif: 'avif',
  jpeg: 'jpg',
  png: 'png',
};

// Suy ra định dạng đích khi chọn "giữ nguyên" từ định dạng gốc mà sharp đọc được.
function resolveOriginal(srcFormat?: string): Exclude<OutFormat, 'original'> {
  switch (srcFormat) {
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'avif':
    case 'heif':
      return 'avif';
    default:
      return 'jpeg'; // jpeg/jpg/tiff/gif... → jpeg
  }
}

export async function compressImage(input: Buffer, opts: CompressOptions): Promise<CompressResult> {
  const q = Math.min(100, Math.max(1, Math.round(opts.quality || 80)));
  // animated:true để GIF/WebP động giữ được khung khi chuyển sang webp/avif. failOn:'none' để
  // vẫn xử lý được ảnh hơi lỗi. limitInputPixels: chặn "decompression bomb" (ảnh kích thước pixel
  // khổng lồ nở RAM khi decode) → giới hạn ~50MP, đủ cho ảnh web thực tế.
  let img = sharp(input, { failOn: 'none', animated: true, limitInputPixels: 50_000_000 });
  const meta = await img.metadata();

  // Chuẩn hóa hướng theo EXIF rồi bake vào pixel (tránh ảnh bị xoay khi strip metadata).
  img = img.rotate();

  if (opts.maxWidth && opts.maxWidth > 0 && meta.width && meta.width > opts.maxWidth) {
    img = img.resize({ width: Math.round(opts.maxWidth), withoutEnlargement: true });
  }

  // sharp mặc định LOẠI metadata; chỉ giữ khi người dùng yêu cầu.
  if (opts.keepMeta) img = img.withMetadata();

  const fmt: Exclude<OutFormat, 'original'> =
    opts.format === 'original' ? resolveOriginal(meta.format) : opts.format;

  switch (fmt) {
    case 'webp':
      img = img.webp({ quality: q, effort: 4 });
      break;
    case 'avif':
      img = img.avif({ quality: q, effort: 4 });
      break;
    case 'png':
      // PNG không có "quality" như JPEG; dùng palette + quality để giảm dung lượng đáng kể.
      img = img.png({ compressionLevel: 9, palette: true, quality: q, effort: 7 });
      break;
    case 'jpeg':
    default:
      img = img.jpeg({ quality: q, mozjpeg: true });
      break;
  }

  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  return { buffer: data, format: fmt, mime: MIME[fmt], ext: EXT[fmt], width: info.width, height: info.height };
}

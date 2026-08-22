import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import { saveGeneratedImage } from '../ai/image-store';
import { requestBaseUrl } from '../base-url';
import { safeFetchBuffer } from '../security/safe-fetch';

// Kích thước "thiết kế" (design units) — mọi thông số bố cục (khung, logo, inset) tính theo khung
// 1080 này. Ảnh THẬT được render ở bội số của khung (renderScale) tuỳ độ phân giải ảnh gốc, để
// không phải hạ ảnh 4000px xuống 1080px một cách vô ích. Xem getSocialImageRenderScale.
const OUTPUT_SIZE = 1080;
// Trần pixel thật. 2048 là mức Facebook lưu ảnh "chất lượng cao"; Instagram/Threads tự hạ xuống
// 1080 bằng bộ nén của họ — đưa ảnh lớn hơn vào luôn cho kết quả nét hơn là tự hạ trước.
const MAX_OUTPUT_SIZE = 2048;
const MAX_RENDER_SCALE = MAX_OUTPUT_SIZE / OUTPUT_SIZE;
const ZOOM = 1.1;
const FRAME_THICKNESS = 10;
const LOGO_MAX_WIDTH = 150;
const LOGO_MAX_HEIGHT = 150;
const LOGO_INSET = 24;
// JPEG là định dạng DUY NHẤT cả Facebook, Instagram, Threads và TikTok đều nhận (Instagram chỉ
// nhận JPEG). Nén một lần duy nhất ở chất lượng cao, chroma 4:4:4 để không mất chi tiết màu/viền
// chữ trước khi mạng xã hội nén lại lần của họ.
const JPEG_QUALITY_STEPS = [95, 92, 88, 84];
// Ngân sách dung lượng: Facebook/Instagram từ chối ảnh quá lớn (~4MB/8MB). Giữ dưới ngưỡng an toàn.
const MAX_OUTPUT_BYTES = 3.8 * 1024 * 1024;

export interface SocialImageProcessingOptions {
  scale?: number;
  barHeight?: number;
  cropSquare?: boolean;
  showLogo?: boolean;
  logoUrl?: string;
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
}

function internalAssetPath(url: string): string | null {
  if (!url.startsWith('/')) return null;
  const clean = url.split(/[?#]/)[0].replace(/^\/+/, '');
  return path.join(process.cwd(), 'public', clean);
}

function dataUriBuffer(value: string): Buffer | null {
  const m = value.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  return m ? Buffer.from(m[1], 'base64') : null;
}

async function readAsset(value: string): Promise<Buffer | null> {
  if (!value) return null;
  const data = dataUriBuffer(value);
  if (data) return data;
  const local = internalAssetPath(value);
  if (local) return fs.readFile(local).catch(() => null);
  if (/^https?:\/\//i.test(value)) {
    return safeFetchBuffer(value, { timeoutMs: 30_000 }, 4 * 1024 * 1024)
      .then((r) => r.buffer)
      .catch(() => null);
  }
  return null;
}

async function logoOverlay(
  frameThickness: number,
  canvasWidth: number,
  canvasHeight: number,
  renderScale: number,
  logoUrl?: string,
): Promise<OverlayOptions | null> {
  const logo = await readAsset(logoUrl?.trim() || '/images/qreview_toke.webp');
  if (!logo) return null;

  const inset = Math.round(LOGO_INSET * renderScale);
  const maxLogoWidth = Math.min(
    Math.round(LOGO_MAX_WIDTH * renderScale),
    canvasWidth - frameThickness * 2 - inset * 2,
  );
  const maxLogoHeight = Math.min(
    Math.round(LOGO_MAX_HEIGHT * renderScale),
    canvasHeight - frameThickness * 2 - inset * 2,
  );
  if (maxLogoWidth < 8 || maxLogoHeight < 8) return null;

  // PNG = lossless, logo giữ nguyên viền/alpha khi ghép lên canvas.
  const renderedLogo = await sharp(logo, { failOn: 'none' })
    .resize({
      width: maxLogoWidth,
      height: maxLogoHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const logoWidth = renderedLogo.info.width;
  const logoHeight = renderedLogo.info.height;

  return {
    input: renderedLogo.data,
    left: canvasWidth - frameThickness - inset - logoWidth,
    top: canvasHeight - frameThickness - inset - logoHeight,
  };
}

export function getSocialImageOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  frameThickness: number,
  cropSquare = true,
) {
  const safeFrameThickness = Math.max(0, Math.round(frameThickness));
  const maxInnerSize = Math.max(1, OUTPUT_SIZE - safeFrameThickness * 2);

  if (cropSquare) {
    return {
      innerWidth: maxInnerSize,
      innerHeight: maxInnerSize,
      outputWidth: OUTPUT_SIZE,
      outputHeight: OUTPUT_SIZE,
    };
  }

  const safeWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 1;
  const safeHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1;
  let innerWidth = maxInnerSize;
  let innerHeight = maxInnerSize;

  if (safeWidth >= safeHeight) {
    innerHeight = Math.max(1, Math.round(maxInnerSize * (safeHeight / safeWidth)));
  } else {
    innerWidth = Math.max(1, Math.round(maxInnerSize * (safeWidth / safeHeight)));
  }

  return {
    innerWidth,
    innerHeight,
    outputWidth: innerWidth + safeFrameThickness * 2,
    outputHeight: innerHeight + safeFrameThickness * 2,
  };
}

// Ảnh gốc thường lớn hơn khung 1080 rất nhiều. Thay vì luôn ép về 1080 (mất chi tiết vĩnh viễn),
// render ở bội số lớn nhất mà ảnh gốc còn ĐỦ pixel để không phải phóng to — tối đa MAX_RENDER_SCALE.
// Trả 1 khi ảnh gốc nhỏ (không phóng to ảnh mờ cho to ra, chỉ tốn dung lượng).
export function getSocialImageRenderScale(
  sourceWidth: number,
  sourceHeight: number,
  zoomWidth: number,
  zoomHeight: number,
): number {
  const available = Math.min(sourceWidth / zoomWidth, sourceHeight / zoomHeight);
  if (!Number.isFinite(available)) return 1;
  return Math.min(MAX_RENDER_SCALE, Math.max(1, available));
}

function getOrientedSourceDimensions(metadata: {
  width?: number;
  height?: number;
  orientation?: number;
}) {
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation ?? 1);

  return swapsDimensions ? { width: height, height: width } : { width, height };
}

async function saveSocialImage(
  canvas: Sharp,
  baseUrl: string,
  hint?: string,
): Promise<string> {
  const processed = await encodeWithinBudget(canvas);
  const rel = await saveGeneratedImage(
    processed.toString('base64'),
    hint || 'social-image',
    {
      format: 'jpeg',
      reencode: false,
    },
  );
  return `${baseUrl}${rel}`;
}

export async function processSocialImageUrl(
  url: string,
  req: Request,
  hint?: string,
  opts: SocialImageProcessingOptions = {},
): Promise<string> {
  const baseUrl = requestBaseUrl(req).replace(/\/+$/, '');
  const publicBase = new URL(baseUrl);
  if (
    publicBase.protocol !== 'https:' ||
    ['localhost', '127.0.0.1', '0.0.0.0'].includes(publicBase.hostname)
  ) {
    throw new Error(
      'Để đăng ảnh đã xử lý, APP_URL phải là URL HTTPS công khai để mạng xã hội tải được ảnh từ /generated.',
    );
  }
  const original = await safeFetchBuffer(url, { timeoutMs: 60_000 }, 25 * 1024 * 1024);
  const scale = clampNumber(opts.scale, 1, 1.5, ZOOM);
  const frameThickness = Math.round(clampNumber(opts.barHeight, 0, 80, FRAME_THICKNESS));
  const cropSquare = opts.cropSquare !== false;
  const showLogo = opts.showLogo !== false;
  const metadata = await sharp(original.buffer, { failOn: 'none' }).metadata();
  const sourceDimensions = getOrientedSourceDimensions(metadata);

  const design = getSocialImageOutputDimensions(
    sourceDimensions.width,
    sourceDimensions.height,
    frameThickness,
    cropSquare,
  );
  const renderScale = getSocialImageRenderScale(
    sourceDimensions.width,
    sourceDimensions.height,
    design.innerWidth * scale,
    design.innerHeight * scale,
  );
  const frame =
    frameThickness > 0 ? Math.max(1, Math.round(frameThickness * renderScale)) : 0;
  const innerWidth = Math.max(1, Math.round(design.innerWidth * renderScale));
  const innerHeight = Math.max(1, Math.round(design.innerHeight * renderScale));
  const outputWidth = innerWidth + frame * 2;
  const outputHeight = innerHeight + frame * 2;
  const zoomWidth = Math.max(innerWidth, Math.ceil(innerWidth * scale));
  const zoomHeight = Math.max(innerHeight, Math.ceil(innerHeight * scale));
  // MỘT lần lấy mẫu duy nhất từ ảnh gốc: xoay theo EXIF → resize lanczos3 → cắt.
  // (sharp tự chuyển ảnh có ICC profile — Display-P3/AdobeRGB — về sRGB nên màu không bị bạc.)
  // fastShrinkOnLoad tắt để JPEG không bị giảm mẫu thô ngay lúc giải mã.
  const base = sharp(original.buffer, { failOn: 'none', limitInputPixels: 50_000_000 })
    .rotate()
    .resize({
      width: zoomWidth,
      height: zoomHeight,
      fit: 'cover',
      position: 'center',
      kernel: 'lanczos3',
      fastShrinkOnLoad: false,
    })
    .extract({
      left: Math.floor((zoomWidth - innerWidth) / 2),
      top: Math.floor((zoomHeight - innerHeight) / 2),
      width: innerWidth,
      height: innerHeight,
    });

  // Raw = pixel thô, KHÔNG mã hoá trung gian. Trước đây bước này encode lại theo định dạng gốc
  // (ảnh JPEG bị nén lần 2 ở q80) rồi mới ghép — mất chất lượng mà không ai thấy.
  const baseRaw = await base.raw().toBuffer({ resolveWithObject: true });
  const overlays: OverlayOptions[] = [
    {
      input: baseRaw.data,
      raw: {
        width: baseRaw.info.width,
        height: baseRaw.info.height,
        channels: baseRaw.info.channels,
      },
      left: frame,
      top: frame,
    },
  ];
  const logo = showLogo
    ? await logoOverlay(frame, outputWidth, outputHeight, renderScale, opts.logoUrl)
    : null;
  if (logo) overlays.push(logo);

  const canvas = sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite(overlays)
    .withIccProfile('srgb');

  return saveSocialImage(canvas, baseUrl, hint);
}

// Nén JPEG một lần ở chất lượng cao nhất còn nằm trong ngân sách dung lượng của mạng xã hội.
async function encodeWithinBudget(canvas: Sharp): Promise<Buffer> {
  let last: Buffer | null = null;
  for (const quality of JPEG_QUALITY_STEPS) {
    const buffer = await canvas
      .clone()
      .jpeg({
        quality,
        mozjpeg: true,
        progressive: true,
        // 4:4:4 giữ nguyên độ phân giải kênh màu — viền chữ/logo không bị nhoè màu.
        chromaSubsampling: quality >= 92 ? '4:4:4' : '4:2:0',
      })
      .toBuffer();
    last = buffer;
    if (buffer.length <= MAX_OUTPUT_BYTES) return buffer;
  }
  return last!;
}

export async function processSocialImageUrls(
  urls: string[],
  req: Request,
  hint?: string,
  opts: SocialImageProcessingOptions = {},
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    out.push(
      await processSocialImageUrl(
        urls[i],
        req,
        `${hint || 'social-image'}-${i + 1}`,
        opts,
      ),
    );
  }
  return out;
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { saveGeneratedImage } from '../ai/image-store';
import { requestBaseUrl } from '../base-url';
import { safeFetchBuffer } from '../security/safe-fetch';

const OUTPUT_SIZE = 1080;
const ZOOM = 1.1;
const FRAME_THICKNESS = 10;
const LOGO_MAX_WIDTH = 150;
const LOGO_MAX_HEIGHT = 150;
const LOGO_INSET = 24;

export interface SocialImageProcessingOptions {
  scale?: number;
  barColor?: string;
  barHeight?: number;
  cropSquare?: boolean;
  showLogo?: boolean;
  logoUrl?: string;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
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
  logoUrl?: string,
): Promise<OverlayOptions | null> {
  const logo = await readAsset(logoUrl?.trim() || '/images/qreview_toke.webp');
  if (!logo) return null;

  const maxLogoWidth = Math.min(
    LOGO_MAX_WIDTH,
    canvasWidth - frameThickness * 2 - LOGO_INSET * 2,
  );
  const maxLogoHeight = Math.min(
    LOGO_MAX_HEIGHT,
    canvasHeight - frameThickness * 2 - LOGO_INSET * 2,
  );
  if (maxLogoWidth < 8 || maxLogoHeight < 8) return null;

  const renderedLogo = await sharp(logo, { failOn: 'none' }).resize({
    width: maxLogoWidth,
    height: maxLogoHeight,
    fit: 'inside',
    withoutEnlargement: true,
  }).png().toBuffer({ resolveWithObject: true });
  const logoWidth = renderedLogo.info.width;
  const logoHeight = renderedLogo.info.height;

  return {
    input: renderedLogo.data,
    left: canvasWidth - frameThickness - LOGO_INSET - logoWidth,
    top: canvasHeight - frameThickness - LOGO_INSET - logoHeight,
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

function getOrientedSourceDimensions(metadata: {
  width?: number;
  height?: number;
  orientation?: number;
}) {
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation ?? 1);

  return swapsDimensions
    ? { width: height, height: width }
    : { width, height };
}

export async function processSocialImageUrl(url: string, req: Request, hint?: string, opts: SocialImageProcessingOptions = {}): Promise<string> {
  const baseUrl = requestBaseUrl(req).replace(/\/+$/, '');
  const publicBase = new URL(baseUrl);
  if (publicBase.protocol !== 'https:' || ['localhost', '127.0.0.1', '0.0.0.0'].includes(publicBase.hostname)) {
    throw new Error('Để đăng ảnh đã xử lý, APP_URL phải là URL HTTPS công khai để mạng xã hội tải được ảnh từ /generated.');
  }
  const original = await safeFetchBuffer(url, { timeoutMs: 60_000 }, 25 * 1024 * 1024);
  const scale = clampNumber(opts.scale, 1, 1.5, ZOOM);
  const frameThickness = Math.round(clampNumber(opts.barHeight, 0, 80, FRAME_THICKNESS));
  const cropSquare = opts.cropSquare !== false;
  const showLogo = opts.showLogo !== false;
  const metadata = await sharp(original.buffer, { failOn: 'none' }).metadata();
  const sourceDimensions = getOrientedSourceDimensions(metadata);
  const { innerWidth, innerHeight, outputWidth, outputHeight } = getSocialImageOutputDimensions(
    sourceDimensions.width,
    sourceDimensions.height,
    frameThickness,
    cropSquare,
  );
  const zoomWidth = Math.ceil(innerWidth * scale);
  const zoomHeight = Math.ceil(innerHeight * scale);
  const base = sharp(original.buffer, { failOn: 'none', limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: zoomWidth, height: zoomHeight, fit: 'cover', position: 'center' })
    .extract({
      left: Math.floor((zoomWidth - innerWidth) / 2),
      top: Math.floor((zoomHeight - innerHeight) / 2),
      width: innerWidth,
      height: innerHeight,
    });

  const overlays: OverlayOptions[] = [];
  overlays.push({ input: await base.toBuffer(), left: frameThickness, top: frameThickness });
  const logo = showLogo
    ? await logoOverlay(frameThickness, outputWidth, outputHeight, opts.logoUrl)
    : null;
  if (logo) overlays.push(logo);

  const processed = await sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite(overlays)
    .webp({ quality: 88, effort: 4 })
    .toBuffer();
  const rel = await saveGeneratedImage(processed.toString('base64'), hint || 'social-image', {
    format: 'webp',
    maxWidth: OUTPUT_SIZE,
  });
  return `${baseUrl}${rel}`;
}

export async function processSocialImageUrls(urls: string[], req: Request, hint?: string, opts: SocialImageProcessingOptions = {}): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    out.push(await processSocialImageUrl(urls[i], req, `${hint || 'social-image'}-${i + 1}`, opts));
  }
  return out;
}

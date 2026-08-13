import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { saveGeneratedImage } from '../ai/image-store';
import { requestBaseUrl } from '../base-url';
import { safeFetchBuffer } from '../security/safe-fetch';
import { getBranding } from '../store/branding';

const OUTPUT_SIZE = 1080;
const ZOOM = 1.1;
const ORANGE = '#f97316';
const BAR_HEIGHT = 150;
const LOGO_MAX_WIDTH = 260;
const LOGO_MAX_HEIGHT = 76;
const LOGO_LEFT = 44;

export interface SocialImageProcessingOptions {
  scale?: number;
  barColor?: string;
  barHeight?: number;
  showLogo?: boolean;
  logoUrl?: string;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const color = value?.trim();
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
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

async function logoOverlay(barHeight: number, logoUrl?: string): Promise<OverlayOptions | null> {
  const branding = await getBranding().catch(() => null);
  const logo = await readAsset(logoUrl?.trim() || branding?.logoDuongBan || '/images/logo_duongban.webp');
  if (!logo) return null;
  const input = sharp(logo, { failOn: 'none' }).resize({
    width: LOGO_MAX_WIDTH,
    height: LOGO_MAX_HEIGHT,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const meta = await input.metadata().catch(() => null);
  const logoHeight = Math.min(meta?.height || LOGO_MAX_HEIGHT, LOGO_MAX_HEIGHT);
  const top = OUTPUT_SIZE - barHeight + Math.round((barHeight - logoHeight) / 2);
  return {
    input: await input.png().toBuffer(),
    left: LOGO_LEFT,
    top: Math.max(OUTPUT_SIZE - barHeight + 20, top),
  };
}

export async function processSocialImageUrl(url: string, req: Request, hint?: string, opts: SocialImageProcessingOptions = {}): Promise<string> {
  const baseUrl = requestBaseUrl(req).replace(/\/+$/, '');
  const publicBase = new URL(baseUrl);
  if (publicBase.protocol !== 'https:' || ['localhost', '127.0.0.1', '0.0.0.0'].includes(publicBase.hostname)) {
    throw new Error('Để đăng ảnh đã xử lý, APP_URL phải là URL HTTPS công khai để mạng xã hội tải được ảnh từ /generated.');
  }
  const original = await safeFetchBuffer(url, { timeoutMs: 60_000 }, 25 * 1024 * 1024);
  const scale = clampNumber(opts.scale, 1, 1.5, ZOOM);
  const barHeight = Math.round(clampNumber(opts.barHeight, 0, 320, BAR_HEIGHT));
  const barColor = normalizeHexColor(opts.barColor, ORANGE);
  const showLogo = opts.showLogo !== false;
  const zoomSize = Math.ceil(OUTPUT_SIZE * scale);
  const base = sharp(original.buffer, { failOn: 'none', limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: zoomSize, height: zoomSize, fit: 'cover', position: 'center' })
    .extract({
      left: Math.floor((zoomSize - OUTPUT_SIZE) / 2),
      top: Math.floor((zoomSize - OUTPUT_SIZE) / 2),
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
    });

  const overlays: OverlayOptions[] = [];
  if (barHeight > 0) {
    overlays.push({
      input: Buffer.from(
        `<svg width="${OUTPUT_SIZE}" height="${barHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${barColor}"/></svg>`,
      ),
      left: 0,
      top: OUTPUT_SIZE - barHeight,
    });
  }
  const logo = showLogo && barHeight > 0 ? await logoOverlay(barHeight, opts.logoUrl) : null;
  if (logo) overlays.push(logo);

  const processed = await base
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

import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/ai/image-store', () => ({ saveGeneratedImage: vi.fn() }));
vi.mock('../src/lib/base-url', () => ({ requestBaseUrl: () => 'https://app.example.com' }));
vi.mock('../src/lib/security/safe-fetch', () => ({ safeFetchBuffer: vi.fn() }));

import { saveGeneratedImage } from '../src/lib/ai/image-store';
import { safeFetchBuffer } from '../src/lib/security/safe-fetch';
import {
  getSocialImageOutputDimensions,
  getSocialImageRenderScale,
  processSocialImageUrl,
} from '../src/lib/social-publishing/image-processing';

const mockSaveGeneratedImage = vi.mocked(saveGeneratedImage);
const mockSafeFetchBuffer = vi.mocked(safeFetchBuffer);

beforeEach(() => {
  mockSaveGeneratedImage.mockReset();
  mockSafeFetchBuffer.mockReset();
  mockSaveGeneratedImage.mockResolvedValue('/generated/social-image.webp');
});

describe('social image output dimensions', () => {
  it('cắt ảnh vuông theo mặc định', () => {
    expect(getSocialImageOutputDimensions(1600, 900, 10)).toEqual({
      innerWidth: 1060,
      innerHeight: 1060,
      outputWidth: 1080,
      outputHeight: 1080,
    });
  });

  it('giữ tỷ lệ ảnh ngang khi tắt cắt vuông', () => {
    expect(getSocialImageOutputDimensions(1600, 900, 10, false)).toEqual({
      innerWidth: 1060,
      innerHeight: 596,
      outputWidth: 1080,
      outputHeight: 616,
    });
  });

  it('giữ tỷ lệ ảnh dọc khi tắt cắt vuông', () => {
    expect(getSocialImageOutputDimensions(900, 1600, 10, false)).toEqual({
      innerWidth: 596,
      innerHeight: 1060,
      outputWidth: 616,
      outputHeight: 1080,
    });
  });

  it('tạo file đầu ra theo tỷ lệ gốc khi cropSquare là false', async () => {
    const metadata = await runProcessing(1600, 900, { cropSquare: false, scale: 1, barHeight: 10, showLogo: false });
    // Ảnh gốc 1600x900 đủ pixel để render lớn hơn khung 1080 → giữ chi tiết, không hạ mẫu vô ích.
    expect(metadata.width).toBe(1630);
    expect(metadata.height).toBe(930);
    expect(metadata.width! / metadata.height!).toBeCloseTo(1080 / 616, 2);
  });
});

describe('social image render scale', () => {
  it('không phóng to khi ảnh gốc nhỏ hơn khung', () => {
    expect(getSocialImageRenderScale(800, 600, 1166, 1166)).toBe(1);
  });

  it('render lớn hơn khi ảnh gốc còn dư pixel', () => {
    expect(getSocialImageRenderScale(1800, 1800, 1166, 1166)).toBeCloseTo(1800 / 1166, 5);
  });

  it('chặn ở trần 2048px với ảnh gốc rất lớn', () => {
    expect(getSocialImageRenderScale(6000, 6000, 1166, 1166)).toBeCloseTo(2048 / 1080, 5);
  });
});

describe('social image encoding', () => {
  it('giữ ảnh nhỏ ở đúng khung 1080 (không phóng to)', async () => {
    const metadata = await runProcessing(500, 500, { scale: 1.1, barHeight: 10, showLogo: false });
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1080);
  });

  it('render tới trần 2048px khi ảnh gốc đủ lớn', async () => {
    const metadata = await runProcessing(4000, 4000, { scale: 1.1, barHeight: 10, showLogo: false });
    expect(metadata.width).toBe(2048);
    expect(metadata.height).toBe(2048);
  });

  it('xuất JPEG và không cho image-store nén lại lần hai', async () => {
    const metadata = await runProcessing(2400, 2400, { scale: 1.1, barHeight: 10, showLogo: false });
    expect(metadata.format).toBe('jpeg');
    expect(mockSaveGeneratedImage.mock.calls[0][2]).toEqual({ format: 'jpeg', reencode: false });
  });
});

async function runProcessing(
  width: number,
  height: number,
  opts: Parameters<typeof processSocialImageUrl>[3],
) {
  const source = await sharp({
    create: { width, height, channels: 3, background: '#dd5500' },
  }).png().toBuffer();
  mockSafeFetchBuffer.mockResolvedValue({ buffer: source, contentType: 'image/png' });

  await processSocialImageUrl(
    'https://cdn.example.com/source.png',
    new Request('https://app.example.com/api/social-publish'),
    'render-test',
    opts,
  );

  const savedBase64 = String(mockSaveGeneratedImage.mock.calls[0][0]);
  return sharp(Buffer.from(savedBase64, 'base64')).metadata();
}

import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/ai/image-store', () => ({ saveGeneratedImage: vi.fn() }));
vi.mock('../src/lib/base-url', () => ({ requestBaseUrl: () => 'https://app.example.com' }));
vi.mock('../src/lib/security/safe-fetch', () => ({ safeFetchBuffer: vi.fn() }));

import { saveGeneratedImage } from '../src/lib/ai/image-store';
import { safeFetchBuffer } from '../src/lib/security/safe-fetch';
import {
  getSocialImageOutputDimensions,
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
    const source = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: '#dd5500',
      },
    }).png().toBuffer();
    mockSafeFetchBuffer.mockResolvedValue({
      buffer: source,
      contentType: 'image/png',
    });

    await processSocialImageUrl(
      'https://cdn.example.com/source.png',
      new Request('https://app.example.com/api/social-publish'),
      'ratio-test',
      { cropSquare: false, scale: 1, barHeight: 10, showLogo: false },
    );

    const savedBase64 = String(mockSaveGeneratedImage.mock.calls[0][0]);
    const metadata = await sharp(Buffer.from(savedBase64, 'base64')).metadata();
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(616);
  });
});

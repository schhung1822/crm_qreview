import { describe, expect, it } from 'vitest';
import { detectVideoPlatform, normalizeVideoUrl } from '@/lib/social/detect';

describe('detectVideoPlatform', () => {
  it('TikTok các dạng URL', () => {
    expect(detectVideoPlatform('https://www.tiktok.com/@user/video/1234567890')).toBe('tiktok');
    expect(detectVideoPlatform('https://vt.tiktok.com/ZSabc/')).toBe('tiktok');
    expect(detectVideoPlatform('https://vm.tiktok.com/abc')).toBe('tiktok');
  });
  it('YouTube các dạng URL', () => {
    expect(detectVideoPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectVideoPlatform('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(detectVideoPlatform('https://www.youtube.com/shorts/abc123')).toBe('youtube');
  });
  it('Facebook các dạng URL', () => {
    expect(detectVideoPlatform('https://www.facebook.com/reel/123456')).toBe('facebook');
    expect(detectVideoPlatform('https://fb.watch/abcDEF/')).toBe('facebook');
    expect(detectVideoPlatform('https://www.facebook.com/watch/?v=123')).toBe('facebook');
  });
  it('nền tảng khác / URL rác → null', () => {
    expect(detectVideoPlatform('https://vimeo.com/12345')).toBeNull();
    expect(detectVideoPlatform('https://instagram.com/reel/x')).toBeNull();
    expect(detectVideoPlatform('not a url')).toBeNull();
    expect(detectVideoPlatform('javascript:alert(1)')).toBeNull();
    expect(detectVideoPlatform('ftp://tiktok.com/x')).toBeNull();
  });
  it('không bị lừa bởi host giả mạo', () => {
    expect(detectVideoPlatform('https://tiktok.com.evil.com/x')).toBeNull();
    expect(detectVideoPlatform('https://youtube.com.phish.net/watch')).toBeNull();
  });
  it('normalizeVideoUrl bỏ fragment, giữ query', () => {
    expect(normalizeVideoUrl('https://youtube.com/watch?v=abc#t=10 ')).toBe('https://youtube.com/watch?v=abc');
  });
});

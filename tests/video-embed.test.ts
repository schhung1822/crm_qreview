import { describe, expect, it } from 'vitest';
import { videoEmbed } from '@/lib/script-analysis/embed';

describe('videoEmbed', () => {
  it('YouTube watch/youtu.be → embed nocookie 16:9', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube')).toEqual({
      src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
      ratio: '16 / 9',
    });
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ?t=5', 'youtube')?.src).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
    );
  });
  it('YouTube Shorts → dọc 9:16', () => {
    expect(videoEmbed('https://www.youtube.com/shorts/abc123DEF45', 'youtube')?.ratio).toBe('9 / 16');
  });
  it('TikTok /video/<id> → player dọc; link rút gọn (không có id) → null', () => {
    const e = videoEmbed('https://www.tiktok.com/@user/video/7212345678901234567', 'tiktok');
    expect(e?.src).toBe('https://www.tiktok.com/player/v1/7212345678901234567?rel=0&description=0');
    expect(e?.ratio).toBe('9 / 16');
    expect(videoEmbed('https://vt.tiktok.com/ZSabc/', 'tiktok')).toBeNull();
  });
  it('Facebook → plugin video (URL gốc encode)', () => {
    const e = videoEmbed('https://www.facebook.com/watch/?v=123456', 'facebook');
    expect(e?.ratio).toBe('16 / 9');
    expect(e?.src).toContain('https://www.facebook.com/plugins/video.php?href=');
    expect(e?.src).toContain(encodeURIComponent('https://www.facebook.com/watch/?v=123456'));
  });
  it('URL rác / sai giao thức → null', () => {
    expect(videoEmbed('not a url', 'youtube')).toBeNull();
    expect(videoEmbed('javascript:alert(1)', 'youtube')).toBeNull();
  });
});

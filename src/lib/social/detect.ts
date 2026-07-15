// Nhận diện nền tảng video từ URL người dùng dán (TikTok / YouTube / Facebook). Thuần, test được.
// Dùng cho tính năng "Phân tích kịch bản video/reels": phát hiện link thuộc nền tảng nào để chọn
// đúng actor Apify lấy transcript.

export type VideoPlatform = 'tiktok' | 'youtube' | 'facebook';

// Trả nền tảng nếu URL hợp lệ (http/https) và thuộc 1 trong 3 nền tảng; ngược lại null.
export function detectVideoPlatform(url: string): VideoPlatform | null {
  let host: string;
  let protocol: string;
  try {
    const u = new URL(url.trim());
    host = u.host.toLowerCase().replace(/^www\./, '');
    protocol = u.protocol;
  } catch {
    return null;
  }
  if (protocol !== 'http:' && protocol !== 'https:') return null;

  // TikTok: tiktok.com, và các host rút gọn vt./vm.tiktok.com.
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  // YouTube: youtube.com, youtu.be, youtube-nocookie.com.
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host === 'youtube-nocookie.com')
    return 'youtube';
  // Facebook: facebook.com, fb.com, fb.watch.
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com' || host === 'fb.watch')
    return 'facebook';
  return null;
}

// Chuẩn hóa nhẹ URL trước khi gửi Apify: cắt khoảng trắng, bỏ fragment. Giữ query (cần cho watch?v=).
export function normalizeVideoUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    return u.toString();
  } catch {
    return url.trim();
  }
}

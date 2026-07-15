// Suy ra iframe NHÚNG video từ URL + nền tảng, để hiển thị video ngay trong báo cáo phân tích kịch bản
// (khối "Bóc tách theo thời gian") và trong link chia sẻ. Thuần, test được, không phụ thuộc runtime.
//
// Ghi chú CSP: next.config chỉ đặt `frame-ancestors 'none'` (chống trang MÌNH bị nhúng) — KHÔNG có
// frame-src → nhúng iframe bên thứ 3 (YouTube/TikTok/Facebook) không bị chặn. Mỗi endpoint nhúng của
// các nền tảng đều cho phép được đóng khung.
import type { VideoPlatform } from '../social/detect';

export interface VideoEmbed {
  src: string; // URL iframe
  ratio: string; // aspect-ratio CSS, vd "9 / 16" (dọc) hoặc "16 / 9" (ngang)
}

// YouTube: lấy videoId + đoán dọc (Shorts). Hỗ trợ youtu.be, watch?v=, /shorts/, /embed/, /v/, /live/.
function youtubeEmbed(u: URL): VideoEmbed | null {
  const host = u.host.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let id = '';
  let vertical = false;
  if (host === 'youtu.be') {
    id = u.pathname.split('/').filter(Boolean)[0] ?? '';
  } else {
    const v = u.searchParams.get('v');
    if (v) {
      id = v;
    } else {
      const parts = u.pathname.split('/').filter(Boolean);
      const i = parts.findIndex((p) => p === 'shorts' || p === 'embed' || p === 'v' || p === 'live');
      if (i >= 0 && parts[i + 1]) {
        id = parts[i + 1];
        if (parts[i] === 'shorts') vertical = true;
      }
    }
  }
  id = id.trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  // youtube-nocookie: riêng tư hơn (không đặt cookie theo dõi tới khi phát).
  return { src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, ratio: vertical ? '9 / 16' : '16 / 9' };
}

// TikTok: cần videoId dạng số (link rút gọn vt./vm. không có id → không nhúng được). Dùng player v1
// (trình phát gọn, không kèm caption). /video/123, /@user/video/123, /player/v1/123, /embed[/v2]/123.
function tiktokEmbed(u: URL): VideoEmbed | null {
  const m = u.pathname.match(/\/(?:video|player\/v1|embed(?:\/v2)?)\/(\d{6,})/);
  if (!m) return null;
  return { src: `https://www.tiktok.com/player/v1/${m[1]}?rel=0&description=0`, ratio: '9 / 16' };
}

// Facebook: plugin video nhận thẳng URL gốc (tự resolve, kể cả fb.watch) → không cần tách id.
function facebookEmbed(url: string): VideoEmbed {
  return {
    src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`,
    ratio: '16 / 9',
  };
}

// Trả iframe nhúng phù hợp, hoặc null nếu không suy ra được (vd TikTok link rút gọn) → khi đó báo cáo
// chỉ hiển thị timeline, không có video.
export function videoEmbed(url: string, platform: VideoPlatform): VideoEmbed | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (platform === 'youtube') return youtubeEmbed(u);
  if (platform === 'tiktok') return tiktokEmbed(u);
  if (platform === 'facebook') return facebookEmbed(u.toString());
  return null;
}

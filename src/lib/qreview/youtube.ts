const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Nhận URL YouTube phổ biến (watch, youtu.be, shorts, embed, live) hoặc video
 * ID thuần và trả về ID đã kiểm tra. Không trả URL người dùng nhập thẳng ra
 * iframe để tránh nhúng nhầm nguồn ngoài YouTube.
 */
export function extractYouTubeVideoId(value: unknown): string | null {
  const input = String(value ?? "").trim();
  if (!input) return null;
  if (YOUTUBE_ID_PATTERN.test(input)) return input;

  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v") ?? "";
      } else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(parts[0] ?? "")) {
          videoId = parts[1] ?? "";
        }
      }
    }

    return YOUTUBE_ID_PATTERN.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export function getYouTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

export function getYouTubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

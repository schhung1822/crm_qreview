import { lookup } from "dns/promises";
import { isIP } from "net";
import { NextResponse } from "next/server";

import {
  enforceRateLimit,
  readJsonBody,
  serverErrorResponse,
} from "@/lib/qreview/api-security";
import { requireQreviewAdmin } from "@/lib/qreview/guard";
import { uploadImageToSite } from "@/lib/qreview/upload-to-site";
import {
  getPostImageSources,
  sanitizePostContent,
} from "@/lib/qreview/post-content";
import { convertRasterToWebp } from "@/lib/qreview/server-image";

export const runtime = "nodejs";

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function decodeHtmlUrl(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();

  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }

  const ipv4 = normalized.startsWith("::ffff:")
    ? normalized.slice("::ffff:".length)
    : normalized;

  if (isIP(ipv4) === 4) {
    const [a, b] = ipv4.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  return false;
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Unsupported image URL protocol");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Private image host is not allowed");
  }

  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error("Private image address is not allowed");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("Image host resolves to a private address");
  }
}

function detectImage(buffer: Buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.subarray(0, 3).toString("latin1") === "GIF") {
    return "image/gif";
  }
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  if (buffer.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("latin1");
    if (brand.startsWith("avif") || brand.startsWith("avis")) {
      return "image/avif";
    }
  }
  return null;
}

async function readBoundedBody(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Remote image is too large");
  }

  if (!response.body) throw new Error("Remote image has no body");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("Remote image is too large");
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

async function downloadImage(source: string) {
  let currentUrl = new URL(source);

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
          "User-Agent": "QReview-Image-Importer/1.0",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Invalid image redirect");
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) throw new Error(`Remote image returned ${response.status}`);
      const buffer = await readBoundedBody(response);
      const detected = detectImage(buffer);
      if (!detected) throw new Error("Remote file is not a supported raster image");
      return buffer;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Too many image redirects");
}

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request, {
      name: "post-image-import",
      limit: 10,
      windowMs: 10 * 60 * 1000,
      blockMs: 10 * 60 * 1000,
    });
    if (limited) return limited;

    const auth = await requireQreviewAdmin();
    if ("response" in auth) {
      return auth.response;
    }

    const parsed = await readJsonBody<{ content?: string }>(request, MAX_BODY_BYTES);
    if (parsed.error) return parsed.error;

    const sanitized = sanitizePostContent(parsed.data.content);
    if (!sanitized) {
      return NextResponse.json({ error: "Nội dung bài viết đang trống." }, { status: 400 });
    }

    const externalSources = getPostImageSources(sanitized)
      .filter((source) => /^https?:\/\//i.test(decodeHtmlUrl(source)))
      .slice(0, MAX_IMAGES);

    if (!externalSources.length) {
      return NextResponse.json({ content: sanitized, imported: 0, failed: 0 });
    }

    let updatedContent = sanitized;
    let imported = 0;
    let failed = 0;

    for (const encodedSource of externalSources) {
      try {
        const buffer = await downloadImage(decodeHtmlUrl(encodedSource));
        const webpBuffer = await convertRasterToWebp(buffer);

        // Anh PHAI nam tren may chu cua website: noi dung bai viet luu duong dan
        // tuong doi, va duong dan do se duoc trinh duyet doc theo ten mien cua
        // website. Ghi vao dia cua CRM thi bai dang len se mat anh.
        const url = await uploadImageToSite(webpBuffer, "posts");

        updatedContent = updatedContent.split(encodedSource).join(url);
        imported += 1;
      } catch (error) {
        console.error("Post image import skipped:", encodedSource, error);
        failed += 1;
      }
    }

    return NextResponse.json({
      content: sanitizePostContent(updatedContent) ?? sanitized,
      imported,
      failed,
    });
  } catch (error) {
    return serverErrorResponse(
      "Post image import error",
      error,
      "Không thể lưu ảnh ngoài về server.",
      { content: null }
    );
  }
}

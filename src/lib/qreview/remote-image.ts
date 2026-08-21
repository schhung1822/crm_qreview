import "server-only";

import { lookup } from "dns/promises";
import { isIP } from "net";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateOrReservedAddress(address: string) {
  const normalized = address.toLowerCase();

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8")
  ) {
    return true;
  }

  const ipv4 = normalized.startsWith("::ffff:")
    ? normalized.slice("::ffff:".length)
    : normalized;

  if (isIP(ipv4) !== 4) return false;

  const [a, b, c] = ipv4.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

async function assertPublicHttpUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Ảnh phải dùng đường dẫn http:// hoặc https://.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Không cho phép tải ảnh từ địa chỉ nội bộ.");
  }

  if (isIP(hostname) && isPrivateOrReservedAddress(hostname)) {
    throw new Error("Không cho phép tải ảnh từ địa chỉ nội bộ.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateOrReservedAddress(item.address))) {
    throw new Error("Máy chủ ảnh trỏ tới địa chỉ nội bộ.");
  }
}

function isSupportedRaster(buffer: Buffer) {
  if (buffer.length < 12) return false;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  if (buffer.subarray(0, 3).toString("latin1") === "GIF") return true;
  if (
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return true;
  }
  if (buffer.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("latin1");
    return brand.startsWith("avif") || brand.startsWith("avis");
  }

  return false;
}

async function readBoundedBody(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Ảnh vượt quá dung lượng 5MB.");
  }

  if (!response.body) throw new Error("Máy chủ không trả về dữ liệu ảnh.");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Ảnh vượt quá dung lượng 5MB.");
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

/**
 * Downloads a public raster image while blocking SSRF targets and oversized
 * bodies. Redirect targets are validated independently before being fetched.
 */
export async function downloadPublicRasterImage(
  source: string,
  maxBytes = DEFAULT_MAX_BYTES
) {
  let currentUrl: URL;

  try {
    currentUrl = new URL(source);
  } catch {
    throw new Error("Đường dẫn ảnh không hợp lệ.");
  }

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicHttpUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
          "User-Agent": "QReview-Product-Importer/1.0",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Ảnh chuyển hướng tới địa chỉ không hợp lệ.");
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Máy chủ ảnh trả về mã ${response.status}.`);
      }

      const buffer = await readBoundedBody(response, maxBytes);
      if (!isSupportedRaster(buffer)) {
        throw new Error("Đường dẫn không trả về ảnh JPG, PNG, WEBP, GIF hoặc AVIF.");
      }
      return buffer;
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw new Error("Tải ảnh quá thời gian cho phép.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Ảnh chuyển hướng quá nhiều lần.");
}

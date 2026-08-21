import { sanitizeAssetUrl, sanitizeText } from "@/lib/qreview/api-security";
import {
  createDefaultHomepageConfig,
  type HomepageConfig,
  type HomepageHeroSlide,
  type HomepagePromoBanner,
  type HomepageSpotlight,
} from "@/lib/qreview/homepage-types";

const MAX_HERO_SLIDES = 5;
const MAX_SPOTLIGHTS = 4;

const WINDOWS_1252_BYTES: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f,
};

function byteForMojibakeChar(char: string) {
  const code = char.codePointAt(0) ?? 0;
  if (code <= 0xff) return code;
  return WINDOWS_1252_BYTES[char] ?? null;
}

/**
 * Giai ma tung cum byte UTF-8 hop le thay vi ca chuoi. Du lieu cu co the da bi
 * mat mot byte C1, nhung cac cum khac trong cung cau van co the phuc hoi duoc.
 */
function decodeEmbeddedUtf8(value: string) {
  const chars = Array.from(value);
  let decoded = "";

  for (let index = 0; index < chars.length; index += 1) {
    const first = byteForMojibakeChar(chars[index]);
    const expected =
      first !== null && first >= 0xc2 && first <= 0xdf
        ? 1
        : first !== null && first >= 0xe0 && first <= 0xef
          ? 2
          : first !== null && first >= 0xf0 && first <= 0xf4
            ? 3
            : 0;

    if (!expected || index + expected >= chars.length) {
      decoded += chars[index];
      continue;
    }

    const bytes = [first as number];
    let valid = true;

    for (let offset = 1; offset <= expected; offset += 1) {
      const byte = byteForMojibakeChar(chars[index + offset]);
      if (byte === null || byte < 0x80 || byte > 0xbf) {
        valid = false;
        break;
      }
      bytes.push(byte);
    }

    if (!valid) {
      decoded += chars[index];
      continue;
    }

    try {
      decoded += new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(bytes)
      );
      index += expected;
    } catch {
      decoded += chars[index];
    }
  }

  return decoded;
}

const TRUNCATED_VIETNAMESE_REPAIRS: Array<[RegExp, string]> = [
  [/Flashship/g, "Flagship"],
  [/Äiá»n/g, "Điện"],
  [/Hiá»u/g, "Hiệu"],
  [/nÄng/g, "năng"],
  [/nghiá»m/g, "nghiệm"],
  [/diá»n/g, "diện"],
  [/táº§m má»i/g, "tầm mới"],
  [/Flagship má»i/g, "Flagship mới"],
  [/má»i cuá»c/g, "mới cuộc"],
  [/cuá»c/g, "cuộc"],
  [/ná»i/g, "nổi"],
  [/Ãm thanh/g, "Âm thanh"],
  [/GIÃ(?=\s|$)/g, "GIÁ"],
  [/ÄẾN/g, "ĐẾN"],
  [/\sá»\s/g, " ở "],
  [/â³/g, "″"],
  [/Äạp/g, "đạp"],
  [/thá» thao/g, "thể thao"],
  [/luyá»n/g, "luyện"],
  [/nhÃ(?=\s|$)/g, "nhà"],
  [/Äá»ng/g, "đồng"],
  [/tá»i/g, "tới"],
  [/Vá»(?=\s)/g, "Vỏ"],
  [/Äạt/g, "đạt"],
  [/Äược/g, "được"],
  [/vá»(?=\s)/g, "về"],
  [/má»i máº·t/g, "mọi mặt"],
  [/má»i/g, "mới"],
];

/** Sua chuoi UTF-8 tung bi doc nham thanh Windows-1252/Latin-1. */
export function repairMojibakeText(value: string) {
  let repaired = value;

  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = decodeEmbeddedUtf8(repaired);
    const withMissingBytesRepaired = TRUNCATED_VIETNAMESE_REPAIRS.reduce(
      (text, [pattern, replacement]) => text.replace(pattern, replacement),
      decoded
    );

    if (withMissingBytesRepaired === repaired) break;
    repaired = withMissingBytesRepaired;
  }

  return repaired;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown, fallback: string, maxLength: number) {
  const repaired =
    typeof value === "string" ? repairMojibakeText(value) : value;
  return sanitizeText(repaired, maxLength) ?? fallback;
}

function assetValue(value: unknown, fallback: string) {
  const repaired =
    typeof value === "string" ? repairMojibakeText(value) : value;
  return sanitizeAssetUrl(repaired) ?? fallback;
}

function productIdValue(value: unknown) {
  const id = String(value ?? "").trim();
  return /^\d+$/.test(id) && Number(id) > 0 ? id : "";
}

function deadlineValue(value: unknown, fallback: string) {
  const candidate = sanitizeText(value, 80);
  if (!candidate) return fallback;

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeSlide(
  value: unknown,
  fallback: HomepageHeroSlide
): HomepageHeroSlide {
  const slide = objectValue(value);

  return {
    productId: productIdValue(slide.productId),
    badge: textValue(slide.badge, fallback.badge, 100),
    promotionText: textValue(slide.promotionText, fallback.promotionText, 100),
    title: textValue(slide.title, fallback.title, 200),
    description: textValue(slide.description, fallback.description, 1000),
    href: assetValue(slide.href, fallback.href),
    image: assetValue(slide.image, fallback.image),
    imageAlt: textValue(slide.imageAlt, fallback.imageAlt, 250),
  };
}

function normalizeSpotlight(
  value: unknown,
  fallback: HomepageSpotlight
): HomepageSpotlight {
  const spotlight = objectValue(value);

  return {
    productId: productIdValue(spotlight.productId),
    eyebrow: textValue(spotlight.eyebrow, fallback.eyebrow, 100),
    title: textValue(spotlight.title, fallback.title, 200),
    href: assetValue(spotlight.href, fallback.href),
    image: assetValue(spotlight.image, fallback.image),
    imageAlt: textValue(spotlight.imageAlt, fallback.imageAlt, 250),
    price: textValue(spotlight.price, fallback.price, 80),
    oldPrice: textValue(spotlight.oldPrice, fallback.oldPrice, 80),
    ctaLabel: textValue(spotlight.ctaLabel, fallback.ctaLabel, 80),
  };
}

function normalizePromoBanner(
  value: unknown,
  fallback: HomepagePromoBanner
): HomepagePromoBanner {
  const banner = objectValue(value);

  return {
    productId: productIdValue(banner.productId),
    eyebrow: textValue(banner.eyebrow, fallback.eyebrow, 100),
    title: textValue(banner.title, fallback.title, 200),
    description: textValue(banner.description, fallback.description, 1000),
    ctaLabel: textValue(banner.ctaLabel, fallback.ctaLabel, 80),
    href: assetValue(banner.href, fallback.href),
    image: assetValue(banner.image, fallback.image),
    imageAlt: textValue(banner.imageAlt, fallback.imageAlt, 250),
  };
}

/**
 * Whitelist toan bo cau hinh truoc khi tra ra trang khach hoac ghi vao CSDL.
 * Cac gioi han mang tranh body nho nhung sinh ra UI qua lon.
 */
export function normalizeHomepageConfig(value: unknown): HomepageConfig {
  const defaults = createDefaultHomepageConfig();
  const root = objectValue(value);
  const hero = objectValue(root.hero);
  const promoBanner = objectValue(root.promoBanner);
  const countdown = objectValue(root.countdown);

  const rawSlides = Array.isArray(hero.slides) ? hero.slides : defaults.hero.slides;
  const rawSpotlights = Array.isArray(hero.spotlights)
    ? hero.spotlights
    : defaults.hero.spotlights;

  const slides = rawSlides
    .slice(0, MAX_HERO_SLIDES)
    .map((slide, index) =>
      normalizeSlide(
        slide,
        defaults.hero.slides[index] ?? defaults.hero.slides[0]
      )
    );

  const spotlights = rawSpotlights
    .slice(0, MAX_SPOTLIGHTS)
    .map((spotlight, index) =>
      normalizeSpotlight(
        spotlight,
        defaults.hero.spotlights[index] ?? defaults.hero.spotlights[0]
      )
    );

  const rawPromoBanners = Array.isArray(promoBanner.banners)
    ? promoBanner.banners
    : [];
  const promoBanners = defaults.promoBanner.banners.map((fallback, index) =>
    normalizePromoBanner(rawPromoBanners[index], fallback)
  );

  return {
    hero: {
      slides: slides.length ? slides : defaults.hero.slides,
      spotlights: spotlights.length ? spotlights : defaults.hero.spotlights,
      primaryCtaLabel: textValue(
        hero.primaryCtaLabel,
        defaults.hero.primaryCtaLabel,
        80
      ),
      secondaryCtaLabel: textValue(
        hero.secondaryCtaLabel,
        defaults.hero.secondaryCtaLabel,
        80
      ),
      secondaryCtaHref: assetValue(
        hero.secondaryCtaHref,
        defaults.hero.secondaryCtaHref
      ),
    },
    promoBanner: {
      banners: promoBanners,
    },
    countdown: {
      productId: productIdValue(countdown.productId),
      eyebrow: textValue(countdown.eyebrow, defaults.countdown.eyebrow, 100),
      title: textValue(countdown.title, defaults.countdown.title, 200),
      description: textValue(
        countdown.description,
        defaults.countdown.description,
        1000
      ),
      deadline: deadlineValue(countdown.deadline, defaults.countdown.deadline),
      buttonLabel: textValue(
        countdown.buttonLabel,
        defaults.countdown.buttonLabel,
        80
      ),
      href: assetValue(countdown.href, defaults.countdown.href),
      image: assetValue(countdown.image, defaults.countdown.image),
      imageAlt: textValue(
        countdown.imageAlt,
        defaults.countdown.imageAlt,
        250
      ),
      backgroundImage: assetValue(
        countdown.backgroundImage,
        defaults.countdown.backgroundImage
      ),
    },
  };
}

export function parseStoredHomepageConfig(value: unknown) {
  if (typeof value !== "string") {
    return normalizeHomepageConfig(value);
  }

  try {
    return normalizeHomepageConfig(JSON.parse(value));
  } catch {
    return createDefaultHomepageConfig();
  }
}

export function collectHomepageProductIds(config: HomepageConfig) {
  return Array.from(
    new Set(
      [
        ...config.hero.slides.map((item) => item.productId),
        ...config.hero.spotlights.map((item) => item.productId),
        ...config.promoBanner.banners.map((item) => item.productId),
        config.countdown.productId,
      ].filter(Boolean)
    )
  );
}

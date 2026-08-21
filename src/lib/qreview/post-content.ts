const ALLOWED_TAGS = new Set([
  "p",
  "h2",
  "h3",
  "h4",
  "h5",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "mark",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "figure",
  "figcaption",
  "br",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "sup",
  "sub",
  "code",
  "pre",
  "span",
  "div",
]);

const VOID_TAGS = new Set(["img", "br", "hr"]);
const DANGEROUS_BLOCKS =
  /<(script|style|iframe|object|embed|form|button|input|textarea|select|option|meta|link|base|svg|math|canvas|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_SINGLE_TAGS =
  /<\/?(?:script|style|iframe|object|embed|form|button|input|textarea|select|option|meta|link|base|svg|math|canvas|video|audio)\b[^>]*>/gi;

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeAttribute(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
      const value = code.toLowerCase().startsWith("x")
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : "";
    });
}

function readAttribute(source: string, name: string) {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`,
    "i"
  );
  const match = source.match(pattern);
  return decodeAttribute(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function sanitizeUrl(value: string, allowMail = false) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return value.slice(0, 2048);
  }

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href.slice(0, 2048);
    }
    if (allowMail && (url.protocol === "mailto:" || url.protocol === "tel:")) {
      return url.href.slice(0, 2048);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Keeps semantic article markup while dropping executable/embedded content,
 * inline styles, event handlers and unsafe URLs. This intentionally preserves
 * structure rather than source-site presentation CSS.
 */
export function sanitizePostContent(value: unknown, maxLength = 4_000_000) {
  if (typeof value !== "string") return null;

  const input = value.trim().slice(0, maxLength);
  if (!input) return null;

  const withoutDangerousContent = input
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(DANGEROUS_BLOCKS, "")
    .replace(DANGEROUS_SINGLE_TAGS, "");

  const sanitized = withoutDangerousContent.replace(
    /<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g,
    (_full, closing: string, rawTag: string, rawAttributes: string) => {
      let tag = rawTag.toLowerCase();
      if (tag === "h1") tag = "h2";

      if (!ALLOWED_TAGS.has(tag)) return "";
      if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;

      if (tag === "a") {
        const href = sanitizeUrl(readAttribute(rawAttributes, "href"), true);
        const title = readAttribute(rawAttributes, "title").slice(0, 300);
        return `<a${href ? ` href="${escapeAttribute(href)}"` : ""}${
          title ? ` title="${escapeAttribute(title)}"` : ""
        } target="_blank" rel="noopener noreferrer nofollow">`;
      }

      if (tag === "img") {
        const src = sanitizeUrl(readAttribute(rawAttributes, "src"));
        if (!src) return "";
        const alt = readAttribute(rawAttributes, "alt").slice(0, 500);
        const title = readAttribute(rawAttributes, "title").slice(0, 300);
        const width = readAttribute(rawAttributes, "width").replace(/\D/g, "").slice(0, 5);
        const height = readAttribute(rawAttributes, "height").replace(/\D/g, "").slice(0, 5);
        return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}"${
          title ? ` title="${escapeAttribute(title)}"` : ""
        }${width ? ` width="${width}"` : ""}${height ? ` height="${height}"` : ""} loading="lazy" decoding="async">`;
      }

      if (tag === "td" || tag === "th") {
        const colspan = readAttribute(rawAttributes, "colspan").replace(/\D/g, "").slice(0, 2);
        const rowspan = readAttribute(rawAttributes, "rowspan").replace(/\D/g, "").slice(0, 2);
        return `<${tag}${colspan ? ` colspan="${colspan}"` : ""}${
          rowspan ? ` rowspan="${rowspan}"` : ""
        }>`;
      }

      return `<${tag}>`;
    }
  );

  return sanitized.trim() || null;
}

export function isRichPostContent(content: string) {
  return /<(?:p|h[1-6]|figure|img|ul|ol|blockquote|table|div)\b/i.test(content);
}

export function getPostImageSources(content: string) {
  const sources: string[] = [];
  const pattern = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    const source = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (source && !sources.includes(source)) sources.push(source);
  }
  return sources;
}

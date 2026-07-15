// Chuẩn hóa VĂN BẢN cho sạch trước khi hiển thị/đăng:
//  1) Giải mã tham chiếu ký tự HTML "typographic" (vd &#8230; &hellip; → …, &nbsp; → space,
//     &mdash; → —) thành KÝ TỰ THẬT. Không thì escapeHtml biến "&" → "&amp;" khiến literal
//     "&#8230;" bị escape hai lần (&amp;#8230;) và HIỆN NGUYÊN CHỮ trên web.
//  2) Đổi mọi gạch dài (— – …) → gạch nối thường "-".
// Xử lý DỨT ĐIỂM tại chokepoint (sinh nội dung + import + đăng bài) thay vì chỉ dặn prompt.
//
// ‐ U+2010 hyphen · ‑ U+2011 non-breaking hyphen · ‒ U+2012 figure dash · – U+2013 en dash
// — U+2014 em dash · ― U+2015 horizontal bar · ⸺ U+2E3A two-em dash · ⸻ U+2E3B three-em dash
// − U+2212 minus sign
const DASH_RE = /[‐‑‒–—―−⸺⸻]/g;

// KHÔNG giải mã các codepoint CẤU TRÚC HTML (" & < > ') — giữ nguyên entity để HTML/markdown
// không bị vỡ cấu trúc hay chèn thẻ ngoài ý muốn.
const STRUCTURAL = new Set([34, 38, 60, 62, 39]);

// Entity ĐẶT TÊN an toàn (typographic/ký hiệu) → ký tự thật. KHÔNG gồm amp/lt/gt/quot/apos.
const NAMED: Record<string, string> = {
  hellip: '…', mldr: '…',
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  mdash: '—', ndash: '–', minus: '−',
  lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', prime: '′', Prime: '″',
  copy: '©', reg: '®', trade: '™',
  deg: '°', middot: '·', bull: '•', hearts: '♥',
  times: '×', divide: '÷', plusmn: '±', ne: '≠', le: '≤', ge: '≥',
  euro: '€', pound: '£', yen: '¥', cent: '¢',
  frac12: '½', frac14: '¼', frac34: '¾',
  rarr: '→', larr: '←', harr: '↔', hArr: '⇔', rArr: '⇒',
  // KHÔNG có amp/lt/gt/quot/apos: giữ &amp; &lt; &gt; &quot; &apos; nguyên vẹn cho HTML an toàn.
};

const cp = (n: number, fallback: string): string => {
  if (STRUCTURAL.has(n) || !(n > 0 && n <= 0x10ffff)) return fallback;
  try {
    return String.fromCodePoint(n);
  } catch {
    return fallback;
  }
};

// Giải mã entity typographic thành ký tự thật (giữ nguyên " & < > ' và mọi entity không rõ).
export function decodeEntities(s: string): string {
  if (typeof s !== 'string' || s.indexOf('&') < 0) return s;
  let out = s;
  // 1) Gỡ ESCAPE HAI LẦN: &amp;#8230; / &amp;hellip; → &#8230; / &hellip; (rồi bước sau decode).
  //    Chỉ khi &amp; đứng ngay trước một entity thực (số/hex/tên kết thúc bằng ";") — nên
  //    "Tom &amp; Jerry" và "?a=1&amp;utm=x" KHÔNG bị đụng.
  out = out.replace(/&amp;(#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]{1,31};)/g, '&$1');
  // 2) Số thập phân &#N;
  out = out.replace(/&#(\d+);/g, (m, d) => cp(Number(d), m));
  // 3) Số hex &#xH;
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (m, h) => cp(parseInt(h, 16), m));
  // 4) Tên (whitelist typographic an toàn)
  out = out.replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : m,
  );
  return out;
}

// Chuẩn hóa văn bản: giải mã entity typographic + đổi gạch dài → "-". Giữ nguyên khoảng trắng
// ("a — b" → "a - b"). Tên giữ là dedash để không phải sửa mọi nơi đang gọi.
export function dedash(s: string): string {
  return typeof s === 'string' ? decodeEntities(s).replace(DASH_RE, '-') : s;
}

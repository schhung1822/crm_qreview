// Gộp + dọn mục "Bài viết liên quan" trong nội dung bài (HTML). Bất biến sản phẩm: mỗi bài
// chỉ còn 1 mục "Bài viết liên quan", và MỌI dòng đều trỏ tới bài khác (có link). Dùng chung
// cho: áp dụng internal link (interlink) và gộp bài liên quan (merge-related).

// Khớp mục do tool chèn: <h2>Bài viết liên quan</h2><ul>...</ul>
const SECTION_RE = /<h2[^>]*>\s*Bài viết liên quan\s*<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi;
// 1 <li> được coi là "có link" khi chứa <a ... href="...">.
const HAS_LINK = /<a\s[^>]*href=["'][^"']+["']/i;

// Chuẩn hóa href để so trùng: bỏ query/hash (kể cả utm_source) và dấu "/" cuối.
export function normHref(href: string): string {
  return (href || '').split(/[?#]/)[0].replace(/\/+$/, '');
}

// Tập href (đã chuẩn hóa) đang có trong các mục "Bài viết liên quan" của bài.
export function relatedHrefs(html: string): Set<string> {
  const set = new Set<string>();
  for (const s of html.matchAll(SECTION_RE)) {
    for (const li of s[1].matchAll(/<li[^>]*>[\s\S]*?<\/li>/gi)) {
      const href = li[0].match(/href=["']([^"']+)["']/i)?.[1];
      if (href) set.add(normHref(href));
    }
  }
  return set;
}

// GỘP + DỌN: nhiều mục "Bài viết liên quan" → 1; bỏ trùng theo href chuẩn hóa; BỎ dòng text
// suông (không có link). Nếu không còn dòng nào có link → bỏ luôn cả mục.
export function mergeRelated(html: string): {
  changed: boolean;
  html: string;
  sections: number;
  removed: number;
} {
  const sections = [...html.matchAll(SECTION_RE)];
  if (sections.length === 0) return { changed: false, html, sections: 0, removed: 0 };

  const seen = new Set<string>();
  const lis: string[] = [];
  let totalItems = 0;
  for (const s of sections) {
    const items = [...s[1].matchAll(/<li[^>]*>[\s\S]*?<\/li>/gi)].map((m) => m[0]);
    for (const li of items) {
      totalItems++;
      if (!HAS_LINK.test(li)) continue; // text suông → bỏ
      const href = normHref(li.match(/href=["']([^"']+)["']/i)?.[1] ?? '');
      if (seen.has(href)) continue; // trùng href → bỏ
      seen.add(href);
      lis.push(li.trim());
    }
  }

  const removed = totalItems - lis.length; // số dòng bị bỏ (text suông + trùng)
  // Có thay đổi khi: nhiều mục, hoặc có dòng bị bỏ.
  const changed = sections.length > 1 || removed > 0;
  if (!changed) return { changed: false, html, sections: sections.length, removed: 0 };

  // Bỏ mọi mục cũ; chỉ thêm lại 1 mục gộp NẾU còn dòng có link.
  let out = html.replace(SECTION_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  if (lis.length) out += `\n<h2>Bài viết liên quan</h2>\n<ul>${lis.join('')}</ul>\n`;
  else out += '\n';
  return { changed: true, html: out, sections: sections.length, removed };
}

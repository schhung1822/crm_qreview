// Render Markdown ↔ HTML. Dùng cho: xem trước trong editor, HTML gửi lên CMS,
// và chuyển bài CMS (HTML) về markdown để chấm điểm/sửa.
// An toàn XSS: inline() escape < > & trước khi chèn thẻ do ta tự dựng.
import { decodeEntities } from './dedash';

function escapeHtml(s: string): string {
  // PHẢI escape cả " và ' - nếu không, URL ảnh/link chèn vào thuộc tính (src="...", href="...")
  // có thể thoát khỏi attribute và bơm onerror/onclick (XSS lưu trữ). Đây là chokepoint chung.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

// Đường dẫn nội bộ an toàn: bắt đầu bằng "/" nhưng KHÔNG phải "//" (protocol-relative).
function isRootRelative(u: string): boolean {
  return u.startsWith('/') && !u.startsWith('//');
}

// Chỉ cho phép scheme an toàn cho href. Chặn javascript:, data:, vbscript:, file:…
// (nội dung import từ CMS đa tác giả có thể chứa link độc → XSS khi render preview).
function safeLinkHref(u: string): string {
  const t = u.trim();
  if (isHttpUrl(t) || isRootRelative(t) || /^(mailto:|tel:)/i.test(t) || t.startsWith('#')) {
    return escapeHtml(t);
  }
  return '#';
}

function imageHtml(alt: string, src: string): string {
  const a = escapeHtml(alt);
  // Ảnh thật: URL http(s) HOẶC đường dẫn nội bộ "/..." (KHÔNG nhận "//evil.com" hay data:).
  if (isHttpUrl(src) || isRootRelative(src)) {
    return `<img src="${escapeHtml(src)}" alt="${a}" loading="lazy" />`;
  }
  // Placeholder (vd "image-placeholder" - chưa có URL ảnh thật) → khung gợi ý có chú thích.
  return `<span class="md-img-ph" role="img" aria-label="${a}">${a || 'Ảnh minh họa'}</span>`;
}

// Dựng thẻ <img> an toàn cho ảnh bìa (escape + chỉ nhận http/đường dẫn nội bộ).
// Trả '' nếu URL không an toàn → tránh XSS khi nhúng vào dangerouslySetInnerHTML.
export function coverImageHtml(src: string, alt = 'cover'): string {
  if (!src) return '';
  if (!isHttpUrl(src) && !isRootRelative(src)) return '';
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`;
}

function inline(s: string): string {
  // decodeEntities: đổi &#8230; &hellip;… → ký tự thật TRƯỚC khi escape, để không bị escape hai
  // lần thành literal "&#8230;" trên trang. Bỏ qua < > & " nên KHÔNG mở lỗ XSS.
  let out = escapeHtml(decodeEntities(s));
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => imageHtml(alt, src));
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) =>
    `<a href="${safeLinkHref(u)}" target="_blank" rel="noreferrer">${t}</a>`,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

// ─── Markdown → HTML (đầy đủ cho bài viết) ───
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length) html.push(`<p>${inline(buf.join(' '))}</p>`);
    buf.length = 0;
  };

  const para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Dòng trống → kết thúc đoạn
    if (!trimmed) {
      flushParagraph(para);
      i++;
      continue;
    }

    // Khối code ```lang … ``` → <pre><code> (escape nội dung, không render markdown bên trong)
    if (/^```/.test(trimmed)) {
      flushParagraph(para);
      i++; // bỏ dòng mở ```
      const code: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      i++; // bỏ dòng đóng ```
      html.push(`<pre class="md-code"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // Heading H1-H6
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushParagraph(para);
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Đường kẻ ngang
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph(para);
      html.push('<hr />');
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      flushParagraph(para);
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }

    // Bảng GFM: dòng có "|" và dòng kế là dòng phân cách (---). Chấp nhận CẢ bảng KHÔNG có "|" ở
    // biên ("Cột A | Cột B" + "--- | ---") — khớp với cách chấm điểm hasTable, tránh lệch hiển thị/điểm.
    const isSep = (l: string) => /^[\s:|-]+$/.test(l) && l.includes('-') && l.includes('|');
    if (trimmed.includes('|') && i + 1 < lines.length && isSep(lines[i + 1].trim())) {
      flushParagraph(para);
      const headerCells = splitRow(trimmed);
      i += 2; // bỏ header + separator
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        bodyRows.push(splitRow(lines[i].trim()));
        i++;
      }
      const thead = `<thead><tr>${headerCells.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${bodyRows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      html.push(`<table class="md-table">${thead}${tbody}</table>`);
      continue;
    }

    // Danh sách (- * hoặc số.)
    const isUl = /^[-*]\s+/.test(trimmed);
    const isOl = /^\d+\.\s+/.test(trimmed);
    if (isUl || isOl) {
      flushParagraph(para);
      const tag = isUl ? 'ul' : 'ol';
      const items: string[] = [];
      const re = isUl ? /^[-*]\s+/ : /^\d+\.\s+/;
      while (i < lines.length && re.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(re, ''))}</li>`);
        i++;
      }
      html.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    // Mặc định: gom vào đoạn văn
    para.push(trimmed);
    i++;
  }
  flushParagraph(para);
  return html.join('\n');
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

// ─── HTML (từ CMS) → Markdown (để chấm điểm & sửa) ───
export function htmlToMarkdown(html: string): string {
  let s = html;
  s = s.replace(/<\s*br\s*\/?>/gi, '\n');
  // INLINE trước (đậm/nghiêng/ảnh/LINK) → biến thành Markdown text. Phải làm trước khi
  // rút gọn block (heading/li/p/blockquote) vì các block dùng stripTags sẽ XÓA mọi thẻ
  // còn sót - nếu để <a> trong <li> chưa chuyển thì link bài viết liên quan sẽ mất.
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  s = s.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi, '![$1]($2)');
  // src ĐỨNG TRƯỚC alt (WordPress/Wix hay xuất kiểu này) — vẫn phải giữ alt, đừng bỏ.
  s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '![$2]($1)');
  s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '![]($1)');
  s = s.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, t) => `[${stripTags(t).trim()}](${href})`);
  // BLOCK sau (lúc này nội dung bên trong đã là Markdown, stripTags không phá link/đậm).
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, l, t) => `\n${'#'.repeat(Number(l))} ${stripTags(t)}\n`);
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => `- ${stripTags(t).trim()}\n`);
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, t) => `\n> ${stripTags(t)}\n`);
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, t) => `\n${stripTags(t)}\n`);
  s = stripTags(s);
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

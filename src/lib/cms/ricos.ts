// Chuyển HTML (từ markdownToHtml) sang Ricos "richContent" mà Wix Blog dùng.
// Wix KHÔNG nhận HTML cho nội dung bài — phải là cây node Ricos. Bộ chuyển này phủ các
// khối phổ biến mà bài của app tạo ra: heading, đoạn văn, danh sách, ảnh, trích dẫn, code,
// đường kẻ. Định dạng inline: đậm / nghiêng / liên kết. Không hỗ trợ được thì hạ về text.
//
// LƯU Ý: schema Ricos khá chi tiết và chưa test với API Wix thật — viết theo tài liệu Ricos,
// bọc try/catch ở nơi gọi để không bao giờ làm hỏng cả bài (fallback 1 đoạn text thuần).

interface Deco {
  type: 'BOLD' | 'ITALIC' | 'LINK';
  fontWeightValue?: number;
  italicData?: boolean;
  linkData?: { link: { url: string; target: string; rel?: { noreferrer: boolean } } };
}
interface RicosNode {
  type: string;
  id?: string;
  nodes: unknown[];
  [k: string]: unknown;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// Node đếm id ổn định trong 1 lần chuyển.
function makeIds() {
  let n = 0;
  return () => `n${(n += 1)}`;
}

// Inline HTML → mảng TEXT node (gộp run cùng kiểu trang trí).
function inlineNodes(html: string): RicosNode[] {
  const out: Array<{ text: string; decos: Deco[] }> = [];
  const active: Deco[] = [];
  let i = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    const decos = active.slice();
    if (last && JSON.stringify(last.decos) === JSON.stringify(decos)) last.text += t;
    else out.push({ text: t, decos });
  };
  const tagRe = /<(\/?)(strong|b|em|i|a|br)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    pushText(decodeEntities(html.slice(i, m.index)));
    i = m.index + m[0].length;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'br') {
      pushText('\n');
    } else if (tag === 'strong' || tag === 'b') {
      if (closing) removeDeco(active, 'BOLD');
      else active.push({ type: 'BOLD', fontWeightValue: 700 });
    } else if (tag === 'em' || tag === 'i') {
      if (closing) removeDeco(active, 'ITALIC');
      else active.push({ type: 'ITALIC', italicData: true });
    } else if (tag === 'a') {
      if (closing) removeDeco(active, 'LINK');
      else {
        const href = /href=["']([^"']+)["']/i.exec(m[3])?.[1];
        if (href)
          active.push({
            type: 'LINK',
            linkData: { link: { url: href, target: 'BLANK', rel: { noreferrer: true } } },
          });
      }
    }
  }
  pushText(decodeEntities(html.slice(i)));

  return out
    .filter((r) => r.text.length > 0)
    .map((r) => ({
      type: 'TEXT',
      nodes: [],
      textData: { text: r.text, decorations: r.decos },
    }));
}

function removeDeco(arr: Deco[], type: Deco['type']) {
  const idx = arr.map((d) => d.type).lastIndexOf(type);
  if (idx >= 0) arr.splice(idx, 1);
}

function imageNode(id: () => string, src: string, alt: string): RicosNode {
  return {
    type: 'IMAGE',
    id: id(),
    nodes: [],
    imageData: {
      containerData: { alignment: 'CENTER', textWrap: true },
      image: { src: { url: src } },
      altText: alt || undefined,
    },
  };
}

function paragraph(id: () => string, inner: string): RicosNode {
  return { type: 'PARAGRAPH', id: id(), nodes: inlineNodes(inner), paragraphData: {} };
}

// Tách ảnh khỏi khối rồi phát IMAGE + PARAGRAPH cho phần còn lại.
function blockWithImages(id: () => string, inner: string): RicosNode[] {
  const nodes: RicosNode[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const flushText = (from: number, to: number) => {
    const chunk = inner.slice(from, to);
    if (stripTags(chunk)) nodes.push(paragraph(id, chunk));
  };
  while ((m = imgRe.exec(inner))) {
    flushText(last, m.index);
    last = m.index + m[0].length;
    const src = /src=["']([^"']+)["']/i.exec(m[0])?.[1];
    const alt = /alt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? '';
    // Bỏ ảnh chưa có URL thật (placeholder). Chỉ nhận http(s).
    if (src && /^https?:\/\//i.test(src)) nodes.push(imageNode(id, src, alt));
  }
  flushText(last, inner.length);
  return nodes;
}

function listNodes(id: () => string, inner: string, ordered: boolean): RicosNode {
  const items: RicosNode[] = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(inner))) {
    items.push({ type: 'LIST_ITEM', id: id(), nodes: [paragraph(id, m[1])] });
  }
  return { type: ordered ? 'ORDERED_LIST' : 'BULLETED_LIST', id: id(), nodes: items };
}

/**
 * Chuyển HTML → tài liệu Ricos { nodes }. Luôn trả về document hợp lệ (tối thiểu 1 đoạn).
 */
export function htmlToRicos(html: string): { nodes: RicosNode[] } {
  const id = makeIds();
  // Bỏ phần không phải nội dung: script (JSON-LD), style, link (hreflang), comment.
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const nodes: RicosNode[] = [];
  const blockRe =
    /<(h[1-6]|p|ul|ol|blockquote|pre|figure|table)\b[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*>|<hr\s*\/?>(?:<\/hr>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(cleaned))) {
    const tag = m[1]?.toLowerCase();
    const inner = m[2] ?? '';
    if (!tag) {
      // <img> đứng riêng (ảnh bìa) hoặc <hr>.
      if (/^<img/i.test(m[0])) {
        const src = /src=["']([^"']+)["']/i.exec(m[0])?.[1];
        const alt = /alt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? '';
        if (src && /^https?:\/\//i.test(src)) nodes.push(imageNode(id, src, alt));
      } else {
        nodes.push({ type: 'DIVIDER', id: id(), nodes: [], dividerData: {} });
      }
      continue;
    }
    if (/^h[1-6]$/.test(tag)) {
      nodes.push({
        type: 'HEADING',
        id: id(),
        nodes: inlineNodes(inner),
        headingData: { level: Number(tag[1]) },
      });
    } else if (tag === 'p') {
      // <p> có thể chứa ảnh → tách ra.
      if (/<img/i.test(inner)) nodes.push(...blockWithImages(id, inner));
      else if (stripTags(inner)) nodes.push(paragraph(id, inner));
    } else if (tag === 'ul') {
      nodes.push(listNodes(id, inner, false));
    } else if (tag === 'ol') {
      nodes.push(listNodes(id, inner, true));
    } else if (tag === 'blockquote') {
      nodes.push({ type: 'BLOCKQUOTE', id: id(), nodes: [paragraph(id, inner)] });
    } else if (tag === 'pre') {
      nodes.push({
        type: 'CODE_BLOCK',
        id: id(),
        nodes: inlineNodes(inner.replace(/<\/?code[^>]*>/gi, '')),
        codeBlockData: {},
      });
    } else if (tag === 'figure') {
      nodes.push(...blockWithImages(id, inner));
    } else if (tag === 'table') {
      // Bảng: Ricos table phức tạp/hiếm dùng → hạ về text NHƯNG giữ ranh giới ô (" | ") và hàng
      // (" // ") để không dính liền thành khối vô nghĩa.
      const t = stripTags(inner.replace(/<\/(?:td|th)>/gi, ' | ').replace(/<\/tr>/gi, ' // '))
        .replace(/\s*\|\s*\/\/\s*/g, ' // ') // dọn "| //" ở cuối hàng
        .replace(/(?:^|\s)\|\s*/, '') // bỏ dấu "|" thừa đầu chuỗi
        .trim();
      if (t) nodes.push(paragraph(id, t));
    }
  }

  if (nodes.length === 0) {
    const t = stripTags(cleaned);
    nodes.push(paragraph(id, t || ' '));
  }
  return { nodes };
}

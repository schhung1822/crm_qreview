// Trích JSON BỀN từ output AI: chịu được code fence, prose thừa, khác biệt provider/model,
// JSON bị cắt cụt (hết maxTokens) và dấu phẩy thừa. Dùng chung cho mọi nơi parse JSON từ AI.

function tryParse(s: string): { ok: true; val: unknown } | { ok: false } {
  try {
    return { ok: true, val: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

// Đóng JSON bị cắt cụt: đóng chuỗi đang mở + đóng nốt ngoặc còn thiếu.
function closeTruncated(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
  }
  let out = s;
  if (inStr) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']';
  return out;
}

const dropTrailingCommas = (s: string) => s.replace(/,\s*([}\]])/g, '$1');

// Escape ký tự điều khiển THÔ (xuống dòng/tab/CR…) nằm BÊN TRONG chuỗi JSON. Nhiều model
// (nhất là khi trả markdown dài) chèn newline thật vào giá trị thay vì "\n" → JSON.parse
// hỏng. Hàm chỉ sửa bên trong chuỗi, không đụng cấu trúc → KHÔNG phá JSON vốn hợp lệ.
function escapeControlInStrings(s: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        out += c;
        esc = false;
        continue;
      }
      if (c === '\\') {
        out += c;
        esc = true;
        continue;
      }
      if (c === '"') {
        out += c;
        inStr = false;
        continue;
      }
      const code = s.charCodeAt(i);
      if (code < 0x20) {
        out += c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      out += c;
    } else {
      if (c === '"') inStr = true;
      out += c;
    }
  }
  return out;
}

export function extractJson(text: string): unknown {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const candidates: string[] = [s];

  // Khối cân bằng từ "{" hoặc "[" đầu tiên (object hoặc array).
  const objAt = s.indexOf('{');
  const arrAt = s.indexOf('[');
  const start = objAt === -1 ? arrAt : arrAt === -1 ? objAt : Math.min(objAt, arrAt);
  if (start >= 0) {
    const open = s[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    let endIdx = -1;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx >= 0) candidates.push(s.slice(start, endIdx + 1));
    else candidates.push(s.slice(start)); // cắt cụt → vòng dưới cứu
  }

  for (const c of candidates) {
    // Thử lần lượt các bản "sửa" tăng dần độ nới lỏng. Bản gốc trước (nhanh cho JSON tốt),
    // rồi bỏ dấu phẩy thừa, đóng JSON cắt cụt, và escape ký tự điều khiển trong chuỗi.
    const e = escapeControlInStrings(c);
    const repairs = [
      c,
      dropTrailingCommas(c),
      dropTrailingCommas(closeTruncated(c)),
      e,
      dropTrailingCommas(e),
      dropTrailingCommas(closeTruncated(e)),
    ];
    for (const repaired of repairs) {
      const r = tryParse(repaired);
      if (r.ok) return r.val;
    }
  }
  return null;
}

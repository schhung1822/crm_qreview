// Diff theo TỪ (word-level) để hiển thị đề xuất sửa bài của AI: xanh = thêm, đỏ = xóa.
// Thuần, không phụ thuộc DOM → test được. Dùng LCS trên token (từ + khoảng trắng) để giữ
// nguyên định dạng khi ghép lại.
export type DiffSeg = { type: 'same' | 'add' | 'del'; text: string };

// Tách thành token: mỗi cụm khoảng trắng hoặc mỗi cụm ký tự không-trắng là 1 token.
const tokenize = (s: string): string[] => s.match(/\s+|[^\s]+/g) ?? [];

// Ngưỡng an toàn: bài quá dài → bỏ diff chi tiết (bảng LCS O(n·m) tốn bộ nhớ), trả nguyên khối.
const MAX_TOKENS = 1500;

export function diffWords(before: string, after: string): DiffSeg[] {
  if (before === after) return before ? [{ type: 'same', text: before }] : [];
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    const segs: DiffSeg[] = [];
    if (before) segs.push({ type: 'del', text: before });
    if (after) segs.push({ type: 'add', text: after });
    return segs;
  }
  const n = a.length;
  const m = b.length;
  // Bảng độ dài LCS (đi từ cuối lên) để truy vết đường đi chung dài nhất.
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: DiffSeg[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'del', text: a[i] });
      i++;
    } else {
      raw.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) raw.push({ type: 'del', text: a[i++] });
  while (j < m) raw.push({ type: 'add', text: b[j++] });

  // Gộp các token liên tiếp cùng loại → ít segment, dễ render.
  const out: DiffSeg[] = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last && last.type === s.type) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

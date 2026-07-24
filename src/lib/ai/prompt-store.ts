// Kho GHI ĐÈ prompt (toàn nền tảng) + bộ resolve. Superadmin sửa prompt ở tab "Prompt" của
// Quản trị nền tảng → lưu vào .data/prompt-overrides.json (toàn cục). Toàn hệ thống dùng bản này.
//
// CHỐNG LỆCH: nếu KHÔNG có bản ghi đè → dùng CHÍNH hàm build() mặc định với giá trị thật
// (giữ nguyên văn như trước). Chỉ khi có bản ghi đè mới thay [ten_bien] trong template của admin.
//
// AN TOÀN [...]: chỉ thay các token trùng ĐÚNG tên biến đã đăng ký của prompt → KHÔNG đụng các
// "[...]" văn bản thường (vd "[cần kiểm chứng]", link markdown "[nguồn](url)").
import { mutateGlobalConfig, readGlobalConfig } from '../data/config-store';
import { PROMPT_BY_ID, type PromptEntry } from './prompt-registry';

export interface PromptOverride {
  system?: string; // ghi đè prompt hệ thống (rỗng/vắng = dùng mặc định)
  user?: string; // ghi đè template phần user (dạng [ten_bien])
}
export type PromptOverrides = Record<string, PromptOverride>;

const FILE = 'prompt-overrides.json';

// Cache nhẹ (đọc file rẻ nhưng gọi AI không quá dày) - TTL ngắn để admin lưu là thấy gần như ngay.
let cache: { at: number; data: PromptOverrides } | null = null;
const TTL_MS = 3000;

async function loadOverrides(): Promise<PromptOverrides> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await readGlobalConfig<PromptOverrides>(FILE, {});
  cache = { at: Date.now(), data };
  return data;
}

function invalidate() {
  cache = null;
}

// Thay [ten_bien] CHỈ với các biến đã đăng ký của prompt (an toàn với "[...]" văn bản thường).
export function fillTemplate(tpl: string, entry: PromptEntry, vars: Record<string, string>): string {
  let out = tpl;
  for (const varDef of entry.vars) {
    const token = `[${varDef.name}]`;
    if (out.includes(token)) out = out.split(token).join(vars[varDef.name] ?? '');
  }
  return out;
}

// Phần USER hiệu lực (override đã điền biến, hoặc build() mặc định với giá trị thật).
async function effectiveUser(entry: PromptEntry, vars: Record<string, string>): Promise<string> {
  const ov = (await loadOverrides())[entry.id];
  const custom = ov?.user?.trim();
  return custom ? fillTemplate(ov!.user!, entry, vars) : entry.build(vars);
}

// Prompt hệ thống hiệu lực (override hoặc mặc định). Không có biến động.
async function effectiveSystem(entry: PromptEntry): Promise<string> {
  const ov = (await loadOverrides())[entry.id];
  const custom = ov?.system?.trim();
  return custom || entry.system;
}

// Render đầy đủ {system, user} cho 1 prompt (dùng cho các prompt gọi model văn bản).
export async function renderPrompt(
  id: string,
  vars: Record<string, string>,
): Promise<{ system: string; user: string }> {
  const entry = PROMPT_BY_ID[id];
  if (!entry) throw new Error(`Prompt không tồn tại trong registry: ${id}`);
  const [system, user] = await Promise.all([effectiveSystem(entry), effectiveUser(entry, vars)]);
  return { system, user };
}

// Render CHỈ phần user (dùng cho fragment như rubric/giọng thương hiệu, và prompt ảnh - không system).
export async function renderUser(id: string, vars: Record<string, string>): Promise<string> {
  const entry = PROMPT_BY_ID[id];
  if (!entry) throw new Error(`Prompt không tồn tại trong registry: ${id}`);
  return effectiveUser(entry, vars);
}

// ── Quản trị (tab Prompt) ──
export async function getPromptOverrides(): Promise<PromptOverrides> {
  return loadOverrides();
}

// Lưu bản ghi đè cho 1 prompt. Trường rỗng/chỉ khoảng trắng → XÓA (trở về mặc định phần đó).
export async function savePromptOverride(id: string, patch: PromptOverride): Promise<void> {
  if (!PROMPT_BY_ID[id]) throw new Error(`Prompt không tồn tại: ${id}`);
  await mutateGlobalConfig<PromptOverrides, void>(FILE, {}, (cur) => {
    const next = { ...cur };
    const clean: PromptOverride = {};
    if (patch.system?.trim()) clean.system = patch.system;
    if (patch.user?.trim()) clean.user = patch.user;
    if (Object.keys(clean).length) next[id] = clean;
    else delete next[id]; // cả 2 rỗng → xóa hẳn (về mặc định)
    return [next, undefined];
  });
  invalidate();
}

// Khôi phục 1 prompt về mặc định (xóa bản ghi đè).
export async function resetPromptOverride(id: string): Promise<void> {
  await mutateGlobalConfig<PromptOverrides, void>(FILE, {}, (cur) => {
    const next = { ...cur };
    delete next[id];
    return [next, undefined];
  });
  invalidate();
}

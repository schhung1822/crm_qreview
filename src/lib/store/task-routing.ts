// Định tuyến tác vụ: AI + model MẶC ĐỊNH cho từng tác vụ người dùng (viết bài, nghiên
// cứu từ khóa, content plan). Lưu .data/task-routing.json. Các trang tác vụ đọc cấu hình
// này để hiển thị sẵn AI/model - người dùng dùng luôn hoặc đổi. provider '' = Tự động.
import type { AiOverride } from '../ai/providers';
import type { AiProviderId } from '../secrets/store';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

// Tác vụ người dùng có ô chọn AI riêng:
// - 'blueprint': AI LÊN KHUNG (kịch bản/dàn ý/keyword) cho bài.
// - 'write': AI VIẾT BÀI HOÀN THIỆN (lấy khung để viết) - cũng dùng cho tối ưu.
// - 'keywords': trang Nghiên cứu từ khóa (gồm cả Lên Content Plan, dùng chung ô chọn AI).
export const AI_TASK_KEYS = ['blueprint', 'write', 'keywords'] as const;
export type AiTaskKey = (typeof AI_TASK_KEYS)[number];

export interface TaskAi {
  provider: string; // '' = Tự động (theo định tuyến mặc định)
  model: string; // '' = model mặc định của provider
}
export type TaskRouting = Record<AiTaskKey, TaskAi>;

const EMPTY: TaskAi = { provider: '', model: '' };
export const DEFAULT_TASK_ROUTING: TaskRouting = {
  blueprint: { ...EMPTY },
  write: { ...EMPTY },
  keywords: { ...EMPTY },
};

const NAME = 'task-routing.json'; // CÔ LẬP THEO BIZ

export async function getTaskRouting(): Promise<TaskRouting> {
  const saved = await readJson<Partial<TaskRouting>>(bizFile(NAME), {});
  const out = { ...DEFAULT_TASK_ROUTING };
  for (const k of AI_TASK_KEYS) {
    const v = saved[k];
    if (v && typeof v === 'object') {
      out[k] = { provider: String(v.provider ?? ''), model: String(v.model ?? '') };
    }
  }
  return out;
}

export async function saveTaskRouting(patch: Partial<TaskRouting>): Promise<TaskRouting> {
  return mutateJson<Partial<TaskRouting>, TaskRouting>(bizFile(NAME), {}, (cur) => {
    const merged = { ...DEFAULT_TASK_ROUTING, ...cur, ...patch };
    const next: TaskRouting = {
      blueprint: merged.blueprint ?? { ...EMPTY },
      write: merged.write ?? { ...EMPTY },
      keywords: merged.keywords ?? { ...EMPTY },
    };
    return [next, next];
  });
}

// Lấy AiOverride (provider/model) đã cấu hình cho 1 tác vụ; undefined nếu để Tự động.
export async function taskOverride(task: AiTaskKey): Promise<AiOverride | undefined> {
  const v = (await getTaskRouting())[task];
  if (!v?.provider) return undefined;
  return { provider: v.provider as AiProviderId, model: v.model || undefined };
}

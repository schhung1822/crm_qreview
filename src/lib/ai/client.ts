// Wrapper Anthropic Claude. Dùng model id mới nhất (xem CLAUDE.md mục 6).
// Không có key → các hàm gọi sẽ fallback sang mock ở tầng trên.
import Anthropic from '@anthropic-ai/sdk';
import { env, hasClaude } from '../env';

let client: Anthropic | null = null;

export function getClaude(): Anthropic | null {
  if (!hasClaude()) return null;
  if (!client) client = new Anthropic({ apiKey: env.anthropicKey });
  return client;
}

export const MODELS = {
  writer: env.claudeWriter, // viết / sửa bài chất lượng cao
  fast: env.claudeFast, // phân loại / chấm điểm / phân nhóm
};

// Gọi Claude và ép trả JSON. Trả null nếu không có client (để caller fallback).
export async function completeJson<T>(opts: {
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T | null> {
  const claude = getClaude();
  if (!claude) return null;

  const msg = await claude.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: 'user', content: opts.prompt }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Trích khối JSON đầu tiên.
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

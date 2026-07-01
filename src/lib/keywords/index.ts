// Chọn provider keyword theo thứ tự ưu tiên:
//   1) DataForSEO (số liệu THẬT) nếu đã cấu hình.
//   2) AI sinh danh sách từ khóa (đúng ngôn ngữ, metrics ước lượng) nếu có API key AI.
//   3) Mock theo quy tắc (cuối cùng).
import { aiReady, type AiOverride } from '../ai/providers';
import { hasKeywordProvider } from '../env';
import { AiKeywordProvider } from './ai';
import { DataForSeoProvider } from './dataforseo';
import { MockKeywordProvider } from './mock';
import type { KeywordProvider } from './types';

// Đồng bộ (không xét AI) - giữ cho nơi gọi cũ.
export function getKeywordProvider(): KeywordProvider {
  return hasKeywordProvider() ? new DataForSeoProvider() : new MockKeywordProvider();
}

// Bất đồng bộ: ưu tiên DataForSEO → AI → mock. override = chọn provider/model AI cụ thể.
export async function resolveKeywordProvider(override?: AiOverride): Promise<KeywordProvider> {
  if (hasKeywordProvider()) return new DataForSeoProvider();
  if (await aiReady()) return new AiKeywordProvider(override);
  return new MockKeywordProvider();
}

export * from './types';

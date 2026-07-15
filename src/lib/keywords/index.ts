// Chọn provider keyword theo thứ tự ưu tiên:
//   1) DataForSEO (số liệu THẬT) nếu đã cấu hình.
//   2) AI sinh danh sách từ khóa (đúng ngôn ngữ, metrics ước lượng) nếu có API key AI.
//   3) Mock theo quy tắc (cuối cùng).
import { aiReady, type AiOverride } from '../ai/providers';
import { dataForSeoReady } from '../store/dataforseo';
import { AiKeywordProvider } from './ai';
import { DataForSeoProvider } from './dataforseo';
import { MockKeywordProvider } from './mock';
import type { KeywordProvider } from './types';

// Bất đồng bộ: ưu tiên DataForSEO (credential UI hoặc env) → AI → mock.
// override = chọn provider/model AI cụ thể. useDataForSeo=false → người dùng chọn KHÔNG dùng DataForSEO.
export async function resolveKeywordProvider(
  override?: AiOverride,
  useDataForSeo = true,
): Promise<KeywordProvider> {
  if (useDataForSeo && (await dataForSeoReady())) return new DataForSeoProvider();
  if (await aiReady()) return new AiKeywordProvider(override);
  return new MockKeywordProvider();
}

export * from './types';

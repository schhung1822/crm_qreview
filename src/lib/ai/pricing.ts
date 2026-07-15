// Bảng GIÁ DỰ KIẾN (USD / 1 triệu token) cho các model phổ biến - để ước tính chi phí.
// Giá tham khảo công khai, CÓ THỂ LỖI THỜI; chỉ mang tính ước lượng (đánh dấu "dự kiến").
// Khi không khớp model → trả null (UI hiển thị "-").

export interface ModelPrice {
  in: number; // USD / 1M token vào
  out: number; // USD / 1M token ra
}

// Mỗi mục: regex khớp model id (ưu tiên khớp cụ thể trước). provider để thu hẹp.
const TABLE: Array<{ provider?: string; match: RegExp; price: ModelPrice }> = [
  // Anthropic Claude
  { provider: 'anthropic', match: /opus/i, price: { in: 15, out: 75 } },
  { provider: 'anthropic', match: /sonnet/i, price: { in: 3, out: 15 } },
  { provider: 'anthropic', match: /haiku/i, price: { in: 1, out: 5 } },
  // Model TẠO ẢNH (tính theo token in/out của API ảnh) - để trước các pattern chung.
  { provider: 'openai', match: /gpt-image/i, price: { in: 5, out: 40 } },
  { provider: 'gemini', match: /image/i, price: { in: 0.3, out: 30 } },
  // OpenAI
  { provider: 'openai', match: /gpt-4o-mini|o\d-mini|gpt-5.*mini|mini/i, price: { in: 0.15, out: 0.6 } },
  { provider: 'openai', match: /gpt-4o|gpt-4\.1|chatgpt-4o/i, price: { in: 2.5, out: 10 } },
  { provider: 'openai', match: /gpt-5/i, price: { in: 1.25, out: 10 } },
  { provider: 'openai', match: /o3|o4/i, price: { in: 2, out: 8 } },
  { provider: 'openai', match: /gpt-4-turbo|gpt-4(?!o)/i, price: { in: 10, out: 30 } },
  { provider: 'openai', match: /gpt-3\.5/i, price: { in: 0.5, out: 1.5 } },
  // Google Gemini
  { provider: 'gemini', match: /flash-lite/i, price: { in: 0.1, out: 0.4 } },
  { provider: 'gemini', match: /flash/i, price: { in: 0.3, out: 2.5 } },
  { provider: 'gemini', match: /pro/i, price: { in: 1.25, out: 5 } },
  // DeepSeek
  { provider: 'deepseek', match: /reasoner|r1|pro/i, price: { in: 0.55, out: 2.19 } },
  { provider: 'deepseek', match: /chat|v\d/i, price: { in: 0.27, out: 1.1 } },
  // Moonshot (Kimi)
  { provider: 'moonshot', match: /k2|kimi/i, price: { in: 0.6, out: 2.5 } },
  { provider: 'moonshot', match: /128k/i, price: { in: 8.4, out: 8.4 } },
  { provider: 'moonshot', match: /32k/i, price: { in: 1.68, out: 1.68 } },
  { provider: 'moonshot', match: /8k|moonshot/i, price: { in: 0.17, out: 0.17 } },
  // Qwen (Alibaba)
  { provider: 'qwen', match: /max/i, price: { in: 1.6, out: 6.4 } },
  { provider: 'qwen', match: /turbo/i, price: { in: 0.05, out: 0.2 } },
  { provider: 'qwen', match: /plus|qwen/i, price: { in: 0.4, out: 1.2 } },
  // MiniMax
  { provider: 'minimax', match: /text-01|abab|minimax/i, price: { in: 0.2, out: 1.1 } },
];

// Giá MẶC ĐỊNH theo provider (khi model không khớp pattern cụ thể nào, vd model mới ra).
// Lấy mức trung bình điển hình của provider để vẫn ước tính được - vẫn là "dự kiến".
const FALLBACK: Record<string, ModelPrice> = {
  anthropic: { in: 3, out: 15 },
  openai: { in: 2.5, out: 10 },
  gemini: { in: 0.5, out: 3 },
  deepseek: { in: 0.27, out: 1.1 },
  moonshot: { in: 0.6, out: 2.5 },
  qwen: { in: 0.4, out: 1.2 },
  minimax: { in: 0.2, out: 1.1 },
};

export function priceFor(provider: string, model: string): ModelPrice | null {
  for (const row of TABLE) {
    if (row.provider && row.provider !== provider) continue;
    if (row.match.test(model)) return row.price;
  }
  return FALLBACK[provider] ?? null; // model lạ → giá mặc định của provider
}

// Chi phí dự kiến (USD) cho lượng token đã dùng. null nếu không biết giá model.
export function estimateCostUsd(
  provider: string,
  model: string,
  inTokens: number,
  outTokens: number,
): number | null {
  const p = priceFor(provider, model);
  if (!p) return null;
  return (inTokens / 1_000_000) * p.in + (outTokens / 1_000_000) * p.out;
}

// GIÁ DỰ KIẾN theo ẢNH (USD/ảnh) cho model tạo ảnh - dùng khi API tính phí theo ảnh,
// KHÔNG trả token (Imagen, DALL·E) hoặc làm fallback khi thiếu usage token.
const IMAGE_PRICE: Array<{ match: RegExp; usd: number }> = [
  { match: /ultra/i, usd: 0.06 },
  { match: /dall-e-2/i, usd: 0.02 },
  { match: /fast/i, usd: 0.02 },
  { match: /gpt-image|dall-e|imagen|image/i, usd: 0.04 },
];

// Giá 1 ảnh (USD) cho model ảnh; null nếu không phải model ảnh.
export function perImagePriceUsd(model: string): number | null {
  for (const row of IMAGE_PRICE) if (row.match.test(model)) return row.usd;
  return null;
}

// Chi phí tổng dự kiến (USD) cho 1 dòng usage: ưu tiên theo TOKEN; nếu là model ảnh mà
// KHÔNG có token (API tính theo ảnh) thì tính theo SỐ ẢNH × giá/ảnh.
export function rowCostUsd(
  provider: string,
  model: string,
  inTokens: number,
  outTokens: number,
  images: number,
): number | null {
  const tokenCost = estimateCostUsd(provider, model, inTokens, outTokens) ?? 0;
  const hasTokens = inTokens + outTokens > 0;
  if (hasTokens) return tokenCost; // model tính theo token → đã đủ
  if (images > 0) {
    const per = perImagePriceUsd(model);
    if (per != null) return images * per; // model ảnh không token → theo số ảnh
  }
  return estimateCostUsd(provider, model, inTokens, outTokens);
}

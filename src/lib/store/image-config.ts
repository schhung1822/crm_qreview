// Cấu hình ảnh AI toàn cục (1 bản) - lưu file .data/image-config.json. Server-only.
// Người dùng cấu hình 1 lần ở trang "Cài đặt ảnh AI"; editor dùng lại để khỏi nhập lại.
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536';
export type ImageProvider = '' | 'openai' | 'gemini';

export interface ImageConfig {
  // Yếu tố dẫn dắt chính: mô tả hệ thống thiết kế / brand (chỉ tham chiếu màu/mood).
  systemDesign: string;
  // Tỉ lệ mặc định (override per-article ở editor).
  size: ImageSize;
  // AI tạo ảnh: '' = tự động (OpenAI ưu tiên rồi Gemini). Model rỗng = mặc định.
  imageProvider: ImageProvider;
  imageModel: string;
}

export const DEFAULT_IMAGE_CONFIG: ImageConfig = {
  systemDesign: '',
  size: '1536x1024',
  imageProvider: '',
  imageModel: '',
};

const NAME = 'image-config.json'; // CÔ LẬP THEO BIZ

export async function getImageConfig(): Promise<ImageConfig> {
  const saved = await readJson<Partial<ImageConfig>>(bizFile(NAME), {});
  return { ...DEFAULT_IMAGE_CONFIG, ...saved };
}

export async function saveImageConfig(patch: Partial<ImageConfig>): Promise<ImageConfig> {
  return mutateJson<Partial<ImageConfig>, ImageConfig>(bizFile(NAME), {}, (current) => {
    const next = { ...DEFAULT_IMAGE_CONFIG, ...current, ...patch };
    return [next, next];
  });
}

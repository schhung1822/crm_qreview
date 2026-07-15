// Kiểu template email + render biến {var}. (Danh sách sự kiện + template mặc định đã gom hết về
// email/platform-templates.ts - toàn hệ thống dùng chung "Email nền tảng".)

export interface EmailTemplate {
  subject: string;
  body: string;
}

// Thay {var} bằng giá trị (khuyết → chuỗi rỗng). Không diễn giải HTML - an toàn.
export function renderTemplate(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
}

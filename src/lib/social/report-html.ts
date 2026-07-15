// Dựng HTML cho Báo cáo Social - THUẦN (không phụ thuộc browser/server) → dùng được cả 2 phía.
// 1 nguồn chân lý cho 2 chế độ:
//   - Trang xem trong app: buildSocialReportBody(..., { collapsible: true }) → mỗi mục là
//     <details> THU GỌN mặc định, bấm tiêu đề để mở; style theo token Polaris (đồng bộ UI).
//   - Bản xuất (PDF in / .doc / Drive): buildSocialReportHtml(...) → mở hết mọi mục, kèm
//     logo + dòng nguồn cấu hình ở Quản trị nền tảng → Thông tin hệ thống (truyền qua brand).
// Nhãn tiêu đề mục truyền từ ngoài vào (client lấy từ i18n socialReport.view).
import type {
  ShopeeProduct,
  ShopeeReview,
  SocialAd,
  SocialChannelData,
  SocialChannelKind,
  SocialComment,
  SocialPost,
  SocialReportRecord,
} from './types';
import { canonicalUrl, mergePosts } from './metrics';

export type SocialReportLabels = Record<string, string>;

// Logo + dòng nguồn cho bản xuất (từ store branding - server đọc, client nhận qua API).
export interface SocialReportBrand {
  logo?: string; // logo dương bản (nền sáng)
  sourceText?: string;
  sourceUrl?: string;
}

// Bộ màu của báo cáo - admin đổi được ở Quản trị nền tảng → Thông tin hệ thống
// (colorSocialAccent/Strength/Weakness). Rỗng = mặc định bên dưới (~ tông Polaris).
export interface SocialReportTheme {
  accent?: string; // màu nhấn (tiêu đề mục, header bài đăng, chip, link, TOFU)
  strength?: string; // khối Điểm mạnh + BOFU
  weakness?: string; // khối Điểm yếu
}

const DEFAULT_THEME = { accent: '#005bd3', strength: '#1f8a4c', weakness: '#c5280c' };
// Theme hiệu lực cho lượt build hiện tại - đặt lại ở ĐẦU mỗi build* (render đồng bộ).
let T = { ...DEFAULT_THEME };
function applyTheme(theme?: SocialReportTheme): void {
  T = {
    accent: theme?.accent || DEFAULT_THEME.accent,
    strength: theme?.strength || DEFAULT_THEME.strength,
    weakness: theme?.weakness || DEFAULT_THEME.weakness,
  };
}

// Chế độ DOC (bản xuất .doc/Drive mở bằng Word/Google Docs): các trình này KHÔNG hỗ trợ
// flexbox, gradient và SVG → khối flex phải dựng bằng <table>, nền gradient thay bằng màu
// đặc, icon SVG bỏ. Trang xem trong app và bản in PDF (render trong trình duyệt) giữ flex.
// Đặt lại ở đầu MỖI lần build như theme (render đồng bộ, không giữ trạng thái giữa các lần).
let DOC = false;

const BORDER = '#e3e3e3';
const SUBDUED = '#616a75';

// Tên + màu nhận diện nền tảng (tên thương hiệu - không dịch).
const PLATFORM_META: Record<SocialChannelKind, { label: string; color: string }> = {
  facebook: { label: 'Facebook', color: '#1877f2' },
  tiktok: { label: 'TikTok', color: '#111111' },
  youtube: { label: 'YouTube', color: '#ff0000' },
  fbgroup: { label: 'Facebook Group', color: '#1877f2' },
  fbprofile: { label: 'Facebook cá nhân', color: '#1877f2' },
  instagram: { label: 'Instagram', color: '#e4405f' },
  threads: { label: 'Threads', color: '#111111' },
  shopee: { label: 'Shopee', color: '#ee4d2d' },
  shopeeshop: { label: 'Shopee Shop', color: '#ee4d2d' },
  tiktokshop: { label: 'TikTok Shop', color: '#111111' },
  tiktokshopshop: { label: 'TikTok Shop', color: '#111111' },
  lazada: { label: 'Lazada', color: '#0f146d' },
  lazadashop: { label: 'Lazada', color: '#0f146d' },
};

// Logo CHÍNH THỨC của nền tảng (SVG đầy đủ nhận diện thương hiệu, tự có nền bo góc).
// Xuất public để UI React dùng lại (dangerouslySetInnerHTML) → 1 nguồn logo duy nhất.
// 'shopeeshop' dùng chung logo 'shopee'; 2 kind TikTok Shop dùng logo 'tiktok'; 'lazadashop'
// dùng chung logo 'lazada' (alias trong platformIconSvg).
const PLATFORM_LOGO_SVG: Record<
  Exclude<SocialChannelKind, 'shopeeshop' | 'tiktokshop' | 'tiktokshopshop' | 'lazadashop' | 'fbprofile'>,
  (s: number) => string
> = {
  facebook: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 193 193" width="${s}" height="${s}" aria-hidden="true"><g transform="translate(-136 -677)"><rect width="193" height="193" fill="#1778f2" rx="40" transform="translate(136 677)"></rect><path fill="#fdfdfd" d="M240.195 827.969v-51.655h17.339l2.6-20.131h-19.939V743.33c0-5.828 1.619-9.8 9.977-9.8h10.66v-18a142.87 142.87 0 0 0-15.534-.792c-15.37 0-25.892 9.381-25.892 26.61v14.835h-17.383v20.131h17.383v51.655h20.789Z"></path></g></svg>`,
  tiktok: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38.51 38.51" width="${s}" height="${s}" aria-hidden="true"><defs><linearGradient id="srtt-a" x1="3.65" x2="34.85" y1=".66" y2="37.84" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#323232"></stop><stop offset="1"></stop></linearGradient><linearGradient id="srtt-b" x1="3.85" x2="35.05" y1=".5" y2="37.68" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#646464"></stop><stop offset=".43" stop-color="#1d1d1d"></stop><stop offset=".6"></stop></linearGradient></defs><g style="isolation:isolate"><g><g><g><rect width="38.51" height="38.51" fill="url(#srtt-a)" rx="6.97" ry="6.97"></rect><g><path fill="url(#srtt-b)" d="M38.51,31.54v-11.64c-2.31-2.35-4.72-4.62-6.98-7.03-.45,0-.9-.05-1.33-.14v3.59c-2.37,0-4.56-.75-6.35-2.03v9.3c0,4.65-3.77,8.42-8.43,8.42-1.74,0-3.35-.52-4.69-1.42,2.69,2.67,5.27,5.27,7.92,7.92h12.9c3.83,0,6.97-3.14,6.97-6.97Z"></path><path fill="#ff1753" d="M38.51,31.54v-11.64c-2.31-2.35-4.72-4.62-6.98-7.03-.45,0-.9-.05-1.33-.14v3.59c-2.37,0-4.56-.75-6.35-2.03v9.3c0,4.65-3.77,8.42-8.43,8.42-1.74,0-3.35-.52-4.69-1.42,2.69,2.67,5.27,5.27,7.92,7.92h12.9c3.83,0,6.97-3.14,6.97-6.97Z" style="mix-blend-mode:multiply"></path></g><g><g><path fill="#ff1753" fill-rule="evenodd" d="M26.82,10.8c-.92-1-1.52-2.29-1.65-3.72v-.59h-1.26c.32,1.81,1.4,3.37,2.91,4.31h0ZM13.66,27.02c-.51-.67-.79-1.49-.79-2.33,0-2.13,1.73-3.85,3.86-3.85.4,0,.79.06,1.17.18v-4.66c-.44-.06-.89-.09-1.33-.08v3.63c-.38-.12-.77-.18-1.17-.18-2.13,0-3.86,1.73-3.86,3.85,0,1.5.86,2.81,2.12,3.44Z" opacity=".8"></path><path fill="#fff" fill-rule="evenodd" d="M23.84,14.29c1.79,1.28,3.99,2.03,6.35,2.03v-3.59c-1.32-.28-2.49-.97-3.37-1.93-1.51-.94-2.59-2.49-2.91-4.31h-3.32v18.2c0,2.12-1.73,3.84-3.86,3.84-1.25,0-2.36-.6-3.07-1.52-1.26-.63-2.12-1.94-2.12-3.44,0-2.13,1.73-3.85,3.86-3.85.41,0,.8.06,1.17.18v-3.63c-4.57.09-8.25,3.83-8.25,8.42,0,2.29.92,4.37,2.4,5.89,1.34.9,2.96,1.42,4.69,1.42,4.65,0,8.43-3.77,8.43-8.42v-9.3Z"></path><path fill="#00c9d0" fill-rule="evenodd" d="M30.19,12.73v-.97c-1.19,0-2.36-.33-3.37-.96.9.98,2.08,1.66,3.37,1.93ZM23.91,6.49c-.03-.17-.05-.35-.07-.52v-.59h-4.59v18.2c0,2.12-1.73,3.84-3.86,3.84-.62,0-1.21-.15-1.73-.41.7.92,1.82,1.52,3.07,1.52,2.12,0,3.85-1.72,3.86-3.84V6.49h3.32ZM16.57,16.28v-1.03c-.38-.05-.77-.08-1.16-.08-4.66,0-8.43,3.77-8.43,8.42,0,2.92,1.48,5.49,3.74,7-1.49-1.52-2.4-3.6-2.4-5.89,0-4.59,3.68-8.33,8.25-8.42h0Z"></path></g><path fill="#ff1753" fill-rule="evenodd" d="M25.17,15.4c1.79,1.28,3.99,2.03,6.35,2.03v-4.56c-.45,0-.9-.05-1.33-.14v3.59c-2.37,0-4.56-.75-6.35-2.03v9.3c0,4.65-3.77,8.42-8.43,8.42-1.74,0-3.35-.52-4.69-1.42,1.53,1.56,3.66,2.53,6.03,2.53,4.66,0,8.43-3.77,8.43-8.42v-9.3h0Z" opacity=".8"></path></g></g></g></g></g></svg>`,
  youtube: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" fill="#ed1d24" viewBox="0 0 512 512" width="${s}" height="${s}" aria-hidden="true"><rect width="512" height="512" rx="15%"></rect><path fill="#fff" d="m427 169c-4-15-17-27-32-31-34-9-239-10-278 0-15 4-28 16-32 31-9 38-10 135 0 174 4 15 17 27 32 31 36 10 241 10 278 0 15-4 28-16 32-31 9-36 9-137 0-174"></path><path d="m220 203v106l93-53"></path></svg>`,
  // Nhóm Facebook: nền xanh FB + biểu tượng 2 người (cộng đồng) - phân biệt với logo fanpage.
  fbgroup: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true"><rect width="48" height="48" fill="#1778f2" rx="10"></rect><g fill="#fdfdfd"><circle cx="18.5" cy="18" r="5.5"></circle><path d="M8 35.5c0-5.5 4.7-9.5 10.5-9.5S29 30 29 35.5V37H8v-1.5z"></path><circle cx="32.5" cy="19.5" r="4.5" opacity=".85"></circle><path d="M31 26.7c5-.4 9 3.3 9 8V37h-8.6v-1.5c0-3.4-1.4-6.5-3.7-8.7 1-.6 2.1-1 3.3-1.1z" opacity=".85"></path></g></svg>`,
  // Instagram: logo CHÍNH THỨC (gradient + máy ảnh trắng). Id gradient prefix "srig-"
  // để không đụng id khi icon xuất hiện nhiều lần trên cùng trang (như srtt- của TikTok).
  instagram: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 132.004 132" width="${s}" height="${s}" aria-hidden="true"><defs><linearGradient id="srig-b"><stop offset="0" stop-color="#3771c8"/><stop stop-color="#3771c8" offset=".128"/><stop offset="1" stop-color="#60f" stop-opacity="0"/></linearGradient><linearGradient id="srig-a"><stop offset="0" stop-color="#fd5"/><stop offset=".1" stop-color="#fd5"/><stop offset=".5" stop-color="#ff543e"/><stop offset="1" stop-color="#c837ab"/></linearGradient><radialGradient id="srig-c" cx="158.429" cy="578.088" r="65" xlink:href="#srig-a" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 -1.98198 1.8439 0 -1031.402 454.004)" fx="158.429" fy="578.088"/><radialGradient id="srig-d" cx="147.694" cy="473.455" r="65" xlink:href="#srig-b" gradientUnits="userSpaceOnUse" gradientTransform="matrix(.17394 .86872 -3.5818 .71718 1648.348 -458.493)" fx="147.694" fy="473.455"/></defs><path fill="url(#srig-c)" d="M65.03 0C37.888 0 29.95.028 28.407.156c-5.57.463-9.036 1.34-12.812 3.22-2.91 1.445-5.205 3.12-7.47 5.468C4 13.126 1.5 18.394.595 24.656c-.44 3.04-.568 3.66-.594 19.188-.01 5.176 0 11.988 0 21.125 0 27.12.03 35.05.16 36.59.45 5.42 1.3 8.83 3.1 12.56 3.44 7.14 10.01 12.5 17.75 14.5 2.68.69 5.64 1.07 9.44 1.25 1.61.07 18.02.12 34.44.12 16.42 0 32.84-.02 34.41-.1 4.4-.207 6.955-.55 9.78-1.28 7.79-2.01 14.24-7.29 17.75-14.53 1.765-3.64 2.66-7.18 3.065-12.317.088-1.12.125-18.977.125-36.81 0-17.836-.04-35.66-.128-36.78-.41-5.22-1.305-8.73-3.127-12.44-1.495-3.037-3.155-5.305-5.565-7.624C116.9 4 111.64 1.5 105.372.596 102.335.157 101.73.027 86.19 0H65.03z" transform="translate(1.004 1)"/><path fill="url(#srig-d)" d="M65.03 0C37.888 0 29.95.028 28.407.156c-5.57.463-9.036 1.34-12.812 3.22-2.91 1.445-5.205 3.12-7.47 5.468C4 13.126 1.5 18.394.595 24.656c-.44 3.04-.568 3.66-.594 19.188-.01 5.176 0 11.988 0 21.125 0 27.12.03 35.05.16 36.59.45 5.42 1.3 8.83 3.1 12.56 3.44 7.14 10.01 12.5 17.75 14.5 2.68.69 5.64 1.07 9.44 1.25 1.61.07 18.02.12 34.44.12 16.42 0 32.84-.02 34.41-.1 4.4-.207 6.955-.55 9.78-1.28 7.79-2.01 14.24-7.29 17.75-14.53 1.765-3.64 2.66-7.18 3.065-12.317.088-1.12.125-18.977.125-36.81 0-17.836-.04-35.66-.128-36.78-.41-5.22-1.305-8.73-3.127-12.44-1.495-3.037-3.155-5.305-5.565-7.624C116.9 4 111.64 1.5 105.372.596 102.335.157 101.73.027 86.19 0H65.03z" transform="translate(1.004 1)"/><path fill="#fff" d="M66.004 18c-13.036 0-14.672.057-19.792.29-5.11.234-8.598 1.043-11.65 2.23-3.157 1.226-5.835 2.866-8.503 5.535-2.67 2.668-4.31 5.346-5.54 8.502-1.19 3.053-2 6.542-2.23 11.65C18.06 51.327 18 52.964 18 66s.058 14.667.29 19.787c.235 5.11 1.044 8.598 2.23 11.65 1.227 3.157 2.867 5.835 5.536 8.503 2.667 2.67 5.345 4.314 8.5 5.54 3.054 1.187 6.543 1.996 11.652 2.23 5.12.233 6.755.29 19.79.29 13.037 0 14.668-.057 19.788-.29 5.11-.234 8.602-1.043 11.656-2.23 3.156-1.226 5.83-2.87 8.497-5.54 2.67-2.668 4.31-5.346 5.54-8.502 1.18-3.053 1.99-6.542 2.23-11.65.23-5.12.29-6.752.29-19.788 0-13.036-.06-14.672-.29-19.792-.24-5.11-1.05-8.598-2.23-11.65-1.23-3.157-2.87-5.835-5.54-8.503-2.67-2.67-5.34-4.31-8.5-5.535-3.06-1.187-6.55-1.996-11.66-2.23-5.12-.233-6.75-.29-19.79-.29zm-4.306 8.65c1.278-.002 2.704 0 4.306 0 12.816 0 14.335.046 19.396.276 4.68.214 7.22.996 8.912 1.653 2.24.87 3.837 1.91 5.516 3.59 1.68 1.68 2.72 3.28 3.592 5.52.657 1.69 1.44 4.23 1.653 8.91.23 5.06.28 6.58.28 19.39s-.05 14.33-.28 19.39c-.214 4.68-.996 7.22-1.653 8.91-.87 2.24-1.912 3.835-3.592 5.514-1.68 1.68-3.275 2.72-5.516 3.59-1.69.66-4.232 1.44-8.912 1.654-5.06.23-6.58.28-19.396.28-12.817 0-14.336-.05-19.396-.28-4.68-.216-7.22-.998-8.913-1.655-2.24-.87-3.84-1.91-5.52-3.59-1.68-1.68-2.72-3.276-3.592-5.517-.657-1.69-1.44-4.23-1.653-8.91-.23-5.06-.276-6.58-.276-19.398s.046-14.33.276-19.39c.214-4.68.996-7.22 1.653-8.912.87-2.24 1.912-3.84 3.592-5.52 1.68-1.68 3.28-2.72 5.52-3.592 1.692-.66 4.233-1.44 8.913-1.655 4.428-.2 6.144-.26 15.09-.27zm29.928 7.97c-3.18 0-5.76 2.577-5.76 5.758 0 3.18 2.58 5.76 5.76 5.76 3.18 0 5.76-2.58 5.76-5.76 0-3.18-2.58-5.76-5.76-5.76zm-25.622 6.73c-13.613 0-24.65 11.037-24.65 24.65 0 13.613 11.037 24.645 24.65 24.645C79.617 90.645 90.65 79.613 90.65 66S79.616 41.35 66.003 41.35zm0 8.65c8.836 0 16 7.163 16 16 0 8.836-7.164 16-16 16-8.837 0-16-7.164-16-16 0-8.837 7.163-16 16-16z"/></svg>`,
  // Threads: logo CHÍNH THỨC (nền đen bo góc + vòng xoắn trắng).
  threads: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${s}" height="${s}" aria-hidden="true"><path fill="#000000" d="M105 0h302c57.75 0 105 47.25 105 105v302c0 57.75-47.25 105-105 105H105C47.25 512 0 464.75 0 407V105C0 47.25 47.25 0 105 0z"/><path fill="#fff" fill-rule="nonzero" d="M337.36 243.58c-1.46-.7-2.95-1.38-4.46-2.02-2.62-48.36-29.04-76.05-73.41-76.33-25.6-.17-48.52 10.27-62.8 31.94l24.4 16.74c10.15-15.4 26.08-18.68 37.81-18.68h.4c14.61.09 25.64 4.34 32.77 12.62 5.19 6.04 8.67 14.37 10.39 24.89-12.96-2.2-26.96-2.88-41.94-2.02-42.18 2.43-69.3 27.03-67.48 61.21.92 17.35 9.56 32.26 24.32 42.01 12.48 8.24 28.56 12.27 45.26 11.35 22.07-1.2 39.37-9.62 51.45-25.01 9.17-11.69 14.97-26.84 17.53-45.92 10.51 6.34 18.3 14.69 22.61 24.73 7.31 17.06 7.74 45.1-15.14 67.96-20.04 20.03-44.14 28.69-80.55 28.96-40.4-.3-70.95-13.26-90.81-38.51-18.6-23.64-28.21-57.79-28.57-101.5.36-43.71 9.97-77.86 28.57-101.5 19.86-25.25 50.41-38.21 90.81-38.51 40.68.3 71.76 13.32 92.39 38.69 10.11 12.44 17.73 28.09 22.76 46.33l28.59-7.63c-6.09-22.45-15.67-41.8-28.72-57.85-26.44-32.53-65.1-49.19-114.92-49.54h-.2c-49.72.35-87.96 17.08-113.64 49.73-22.86 29.05-34.65 69.48-35.04 120.16v.24c.39 50.68 12.18 91.11 35.04 120.16 25.68 32.65 63.92 49.39 113.64 49.73h.2c44.2-.31 75.36-11.88 101.03-37.53 33.58-33.55 32.57-75.6 21.5-101.42-7.94-18.51-23.08-33.55-43.79-43.48zm-76.32 71.76c-18.48 1.04-37.69-7.26-38.64-25.03-.7-13.18 9.38-27.89 39.78-29.64 3.48-.2 6.9-.3 10.25-.3 11.04 0 21.37 1.07 30.76 3.13-3.5 43.74-24.04 50.84-42.15 51.84z"/></svg>`,
  // Lazada: icon app CHÍNH THỨC dựng lại bằng SVG theo ảnh logo user cung cấp (07-2026):
  // nền navy gradient + lá cờ hình tim gradient cam→hồng + chữ "Laz" trắng.
  // Id gradient prefix "srlz-" để không đụng khi icon xuất hiện nhiều lần trên cùng trang.
  lazada: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true"><defs><linearGradient id="srlz-bg" x1="24" y1="0" x2="24" y2="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0000c9"/><stop offset="1" stop-color="#171377"/></linearGradient><linearGradient id="srlz-h" x1="4.5" y1="24" x2="43.5" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff9200"/><stop offset=".45" stop-color="#f4511e"/><stop offset=".75" stop-color="#f50057"/><stop offset="1" stop-color="#ff00e0"/></linearGradient></defs><rect width="48" height="48" fill="url(#srlz-bg)" rx="10"/><path fill="url(#srlz-h)" d="M11.2 10.4 24 17.4l12.8-7a1.8 1.8 0 0 1 1.8 0l4 2.4c.55.34.9.94.9 1.6v14.4c0 .66-.35 1.27-.9 1.6L24.9 41.9a1.8 1.8 0 0 1-1.8 0L5.4 30.4a1.9 1.9 0 0 1-.9-1.6V14.4c0-.65.35-1.26.9-1.6l4-2.4a1.8 1.8 0 0 1 1.8 0z"/><text x="24" y="35.5" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="14.5" fill="#ffffff" text-anchor="middle">Laz</text></svg>`,
  // Shopee: logo CHÍNH THỨC (túi + chữ S cam, nền trong suốt; fill inline thay class CSS).
  shopee: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109.59 122.88" width="${s}" height="${s}" aria-hidden="true"><path fill="#ee4d2d" d="M74.98,91.98C76.15,82.36,69.96,76.22,53.6,71c-7.92-2.7-11.66-6.24-11.57-11.12 c0.33-5.4,5.36-9.34,12.04-9.47c4.63,0.09,9.77,1.22,14.76,4.56c0.59,0.37,1.01,0.32,1.35-0.2c0.46-0.74,1.61-2.53,2-3.17 c0.26-0.42,0.31-0.96-0.35-1.44c-0.95-0.7-3.6-2.13-5.03-2.72c-3.88-1.62-8.23-2.64-12.86-2.63c-9.77,0.04-17.47,6.22-18.12,14.47 c-0.42,5.95,2.53,10.79,8.86,14.47c1.34,0.78,8.6,3.67,11.49,4.57c9.08,2.83,13.8,7.9,12.69,13.81c-1.01,5.36-6.65,8.83-14.43,8.93 c-6.17-0.24-11.71-2.75-16.02-6.1c-0.11-0.08-0.65-0.5-0.72-0.56c-0.53-0.42-1.11-0.39-1.47,0.15c-0.26,0.4-1.92,2.8-2.34,3.43 c-0.39,0.55-0.18,0.86,0.23,1.2c1.8,1.5,4.18,3.14,5.81,3.97c4.47,2.28,9.32,3.53,14.48,3.72c3.32,0.22,7.5-0.49,10.63-1.81 C70.63,102.67,74.25,97.92,74.98,91.98L74.98,91.98z M54.79,7.18c-10.59,0-19.22,9.98-19.62,22.47h39.25 C74.01,17.16,65.38,7.18,54.79,7.18L54.79,7.18z M94.99,122.88l-0.41,0l-80.82-0.01h0c-5.5-0.21-9.54-4.66-10.09-10.19l-0.05-1 l-3.61-79.5v0C0,32.12,0,32.06,0,32c0-1.28,1.03-2.33,2.3-2.35l0,0h25.48C28.41,13.15,40.26,0,54.79,0s26.39,13.15,27.01,29.65 h25.4h0.04c1.3,0,2.35,1.05,2.35,2.35c0,0.04,0,0.08,0,0.12v0l-3.96,79.81l-0.04,0.68C105.12,118.21,100.59,122.73,94.99,122.88 L94.99,122.88z"/></svg>`,
};

// Logo kênh SẮP RA MẮT (user cung cấp SVG chính thức 07-2026) - hiện ở card "Coming soon"
// của wizard; khi build kênh thật thì chuyển thành SocialChannelKind + vào PLATFORM_LOGO_SVG.
export const UPCOMING_LOGO_SVG: Record<'zalo' | 'messenger', (s: number) => string> = {
  zalo: (s) =>
    `<svg width="${s}" height="${s}" aria-hidden="true" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M22.782 0.166016H27.199C33.2653 0.166016 36.8103 1.05701 39.9572 2.74421C43.1041 4.4314 45.5875 6.89585 47.2557 10.0428C48.9429 13.1897 49.8339 16.7347 49.8339 22.801V27.1991C49.8339 33.2654 48.9429 36.8104 47.2557 39.9573C45.5685 43.1042 43.1041 45.5877 39.9572 47.2559C36.8103 48.9431 33.2653 49.8341 27.199 49.8341H22.8009C16.7346 49.8341 13.1896 48.9431 10.0427 47.2559C6.89583 45.5687 4.41243 43.1042 2.7442 39.9573C1.057 36.8104 0.166016 33.2654 0.166016 27.1991V22.801C0.166016 16.7347 1.057 13.1897 2.7442 10.0428C4.43139 6.89585 6.89583 4.41245 10.0427 2.74421C13.1707 1.05701 16.7346 0.166016 22.782 0.166016Z" fill="#0068FF"/><path opacity="0.12" fill-rule="evenodd" clip-rule="evenodd" d="M49.8336 26.4736V27.1994C49.8336 33.2657 48.9427 36.8107 47.2555 39.9576C45.5683 43.1045 43.1038 45.5879 39.9569 47.2562C36.81 48.9434 33.265 49.8344 27.1987 49.8344H22.8007C17.8369 49.8344 14.5612 49.2378 11.8104 48.0966L7.27539 43.4267L49.8336 26.4736Z" fill="#001A33"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7.779 43.5892C10.1019 43.846 13.0061 43.1836 15.0682 42.1825C24.0225 47.1318 38.0197 46.8954 46.4923 41.4732C46.8209 40.9803 47.1279 40.4677 47.4128 39.9363C49.1062 36.7779 50.0004 33.22 50.0004 27.1316V22.7175C50.0004 16.629 49.1062 13.0711 47.4128 9.91273C45.7385 6.75436 43.2461 4.28093 40.0877 2.58758C36.9293 0.894239 33.3714 0 27.283 0H22.8499C17.6644 0 14.2982 0.652754 11.4699 1.89893C11.3153 2.03737 11.1636 2.17818 11.0151 2.32135C2.71734 10.3203 2.08658 27.6593 9.12279 37.0782C9.13064 37.0921 9.13933 37.1061 9.14889 37.1203C10.2334 38.7185 9.18694 41.5154 7.55068 43.1516C7.28431 43.399 7.37944 43.5512 7.779 43.5892Z" fill="white"/><path d="M20.5632 17H10.8382V19.0853H17.5869L10.9329 27.3317C10.7244 27.635 10.5728 27.9194 10.5728 28.5639V29.0947H19.748C20.203 29.0947 20.5822 28.7156 20.5822 28.2606V27.1421H13.4922L19.748 19.2938C19.8428 19.1801 20.0134 18.9716 20.0893 18.8768L20.1272 18.8199C20.4874 18.2891 20.5632 17.8341 20.5632 17.2844V17Z" fill="#0068FF"/><path d="M32.9416 29.0947H34.3255V17H32.2402V28.3933C32.2402 28.7725 32.5435 29.0947 32.9416 29.0947Z" fill="#0068FF"/><path d="M25.814 19.6924C23.1979 19.6924 21.0747 21.8156 21.0747 24.4317C21.0747 27.0478 23.1979 29.171 25.814 29.171C28.4301 29.171 30.5533 27.0478 30.5533 24.4317C30.5723 21.8156 28.4491 19.6924 25.814 19.6924ZM25.814 27.2184C24.2785 27.2184 23.0273 25.9672 23.0273 24.4317C23.0273 22.8962 24.2785 21.645 25.814 21.645C27.3495 21.645 28.6007 22.8962 28.6007 24.4317C28.6007 25.9672 27.3685 27.2184 25.814 27.2184Z" fill="#0068FF"/><path d="M40.4867 19.6162C37.8516 19.6162 35.7095 21.7584 35.7095 24.3934C35.7095 27.0285 37.8516 29.1707 40.4867 29.1707C43.1217 29.1707 45.2639 27.0285 45.2639 24.3934C45.2639 21.7584 43.1217 19.6162 40.4867 19.6162ZM40.4867 27.2181C38.9322 27.2181 37.681 25.9669 37.681 24.4124C37.681 22.8579 38.9322 21.6067 40.4867 21.6067C42.0412 21.6067 43.2924 22.8579 43.2924 24.4124C43.2924 25.9669 42.0412 27.2181 40.4867 27.2181Z" fill="#0068FF"/><path d="M29.4562 29.0944H30.5747V19.957H28.6221V28.2793C28.6221 28.7153 29.0012 29.0944 29.4562 29.0944Z" fill="#0068FF"/></svg>`,
  messenger: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true"><path fill="#448AFF" d="M24,4C13.5,4,5,12.1,5,22c0,5.2,2.3,9.8,6,13.1V44l7.8-4.7c1.6,0.4,3.4,0.7,5.2,0.7c10.5,0,19-8.1,19-18C43,12.1,34.5,4,24,4z"></path><path fill="#FFF" d="M12 28L22 17 27 22 36 17 26 28 21 23z"></path></svg>`,
};

// Icon nền tảng = logo chính thức, bọc span để canh giữa dòng. size = cạnh hình vuông.
// Báo cáo SHOP dùng chung logo sàn tương ứng.
export function platformIconSvg(kind: SocialChannelKind, size = 22): string {
  const logo =
    kind === 'shopeeshop'
      ? PLATFORM_LOGO_SVG.shopee
      : kind === 'tiktokshop' || kind === 'tiktokshopshop'
        ? PLATFORM_LOGO_SVG.tiktok
        : kind === 'lazadashop'
          ? PLATFORM_LOGO_SVG.lazada
          : kind === 'fbprofile'
            ? PLATFORM_LOGO_SVG.facebook // profile cá nhân dùng chung logo Facebook
            : PLATFORM_LOGO_SVG[kind];
  return (
    `<span style="display:inline-flex;flex-shrink:0;vertical-align:middle;line-height:0">` +
    logo(size) +
    `</span>`
  );
}

function platformIcon(kind: SocialChannelKind, size = 14): string {
  if (DOC) return ''; // Word/Google Docs bỏ qua SVG → tránh khoảng trống lệch dòng
  return platformIconSvg(kind, size + 8);
}

// Chip nền tảng: icon + tên (+ tên kênh nếu có).
function platformChip(kind: SocialChannelKind, name?: string, light = false): string {
  const m = PLATFORM_META[kind];
  const fg = light ? '#fff' : '#202223';
  const bg = light ? 'rgba(255,255,255,.16)' : '#f4f5f7';
  return (
    `<span style="display:inline-flex;align-items:center;gap:6px;background:${bg};color:${fg};border-radius:16px;padding:4px 12px 4px 4px;font-size:12px;font-weight:600;margin:2px 6px 2px 0">` +
    `${platformIcon(kind, 12)}<span>${esc(name ? `${m.label} · ${name}` : m.label)}</span></span>`
  );
}

// Sắc đậm hơn của màu accent (cho gradient hero) - trộn 35% về đen.
function shade(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (x: number) => Math.round(x * 0.65);
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: number | undefined, locale: string): string {
  return n === undefined ? 'n.a' : n.toLocaleString(locale);
}

// Tiêu đề mục (chỉ dùng ở chế độ MỞ HẾT - bản xuất).
function sectionTitle(text: string): string {
  return `<h2 style="color:${T.accent};border-left:4px solid ${T.accent};padding-left:10px;font-size:17px;margin:28px 0 12px;page-break-after:avoid">${esc(text)}</h2>`;
}

// Tiêu đề con bên trong một mục (dùng ở cả 2 chế độ).
function subTitle(text: string): string {
  return `<div style="color:${T.accent};font-weight:700;font-size:13.5px;margin:16px 0 8px">${esc(text)}</div>`;
}

function statCards(cards: Array<{ value: string; label: string }>): string {
  if (DOC) {
    // Word/Google Docs: hàng thẻ chỉ số phải là bảng mới giữ được bố cục ngang.
    const w = Math.floor(100 / Math.max(1, cards.length));
    const cells = cards
      .map(
        (c) =>
          `<td width="${w}%" style="border:1px solid ${BORDER};padding:12px 8px;text-align:center">` +
          `<div style="font-size:17px;font-weight:700">${esc(c.value)}</div>` +
          `<div style="font-size:10px;color:${SUBDUED};text-transform:uppercase">${esc(c.label)}</div></td>`,
      )
      .join('');
    return `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:12px 0"><tr>${cells}</tr></table>`;
  }
  const cells = cards
    .map(
      (c) =>
        `<div style="flex:1;min-width:120px;border:1px solid ${BORDER};border-radius:10px;padding:14px 10px;text-align:center">` +
        `<div style="font-size:18px;font-weight:700">${esc(c.value)}</div>` +
        `<div style="font-size:11px;color:${SUBDUED};margin-top:4px;text-transform:uppercase">${esc(c.label)}</div></div>`,
    )
    .join('');
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">${cells}</div>`;
}

// Thanh tiêu đề nền màu của thẻ (bài đăng/quảng cáo/khối SWOT). Word/Google Docs hay bỏ
// background của <div> nhưng giữ của <td> → chế độ DOC dựng bằng bảng 1 ô.
// `text` truyền vào PHẢI đã escape sẵn.
function barHeader(bg: string, fg: string, text: string): string {
  if (DOC)
    return (
      `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">` +
      `<tr><td style="background-color:${bg};background:${bg};color:${fg};font-weight:700;padding:8px 14px;font-size:13px">${text}</td></tr></table>`
    );
  return `<div style="background:${bg};color:${fg};font-weight:700;padding:8px 14px;font-size:13px">${text}</div>`;
}

// Hàng "trái đậm - phải mờ" (thành viên nổi bật, chỉ số từng kênh của báo cáo tổng thể).
// `left`/`right` truyền vào PHẢI đã escape sẵn.
function metaRow(left: string, right: string): string {
  if (DOC)
    return (
      `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:6px 0"><tr>` +
      `<td style="border:1px solid ${BORDER};border-right:0;padding:8px 14px;font-size:13px;font-weight:700">${left}</td>` +
      `<td style="border:1px solid ${BORDER};border-left:0;padding:8px 14px;text-align:right;color:${SUBDUED};font-size:12px">${right}</td>` +
      `</tr></table>`
    );
  return (
    `<div style="display:flex;align-items:center;gap:10px;border:1px solid ${BORDER};border-radius:10px;padding:8px 14px;margin:6px 0;font-size:13px">` +
    `<span style="font-weight:700">${left}</span>` +
    `<span style="margin-left:auto;color:${SUBDUED};font-size:12px">${right}</span></div>`
  );
}

// ═══ HỆ BIỂU ĐỒ ĐỒNG BỘ (1 ngôn ngữ thiết kế cho mọi báo cáo) ═══
// - Trang xem/PDF: thẻ chart bo góc xếp LƯỚI 2 CỘT; thanh ngang có NỀN TRACK xám (so sánh
//   tức thì), nhãn 1 dòng ellipsis (hover xem đủ); cột dọc có trục đáy; donut kèm chú giải %.
// - Bản .doc/Drive: Word không hỗ trợ flex/gradient → mọi chart rơi về CỘT NGANG dạng bảng.
const TRACK = '#eef0f3';

// Thẻ bọc 1 biểu đồ: tiêu đề nằm TRONG thẻ; wide=true chiếm cả hàng (nhãn dài/nhiều cột).
function chartCard(title: string, inner: string, wide = false): string {
  if (DOC) return subTitle(title) + inner;
  return (
    `<div style="flex:1 1 ${wide ? '100%' : '340px'};min-width:280px;max-width:100%;box-sizing:border-box;border:1px solid ${BORDER};border-radius:12px;padding:14px 16px 10px;page-break-inside:avoid">` +
    `<div style="font-weight:650;font-size:13px;margin-bottom:10px">${esc(title)}</div>${inner}</div>`
  );
}

// Lưới thẻ biểu đồ (view: flex wrap 2 cột; DOC: xếp dọc).
function chartGrid(cards: string[]): string {
  if (!cards.length) return '';
  if (DOC) return cards.join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:12px;margin:4px 0 8px">${cards.join('')}</div>`;
}

// CỘT NGANG cho dữ liệu XẾP HẠNG. View: nhãn cột trái ellipsis + thanh trên nền track
// + giá trị cột phải thẳng hàng. DOC: bảng thuần (ô td nền màu).
function barChart(
  rows: Array<{ label: string; value: number; valueText: string; color?: string }>,
): string {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (DOC)
    return rows
      .map((r) => {
        const pct = Math.max(2, Math.round((r.value / max) * 100));
        const color = r.color ?? T.accent;
        return (
          `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:5px 0"><tr>` +
          `<td width="36%" style="font-size:12px;line-height:1.35;padding:2px 8px 2px 0;word-break:break-word;vertical-align:middle">${esc(r.label)}</td>` +
          `<td style="vertical-align:middle"><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
          `<td width="${pct}%" style="background-color:${color};background:${color};height:14px;border-radius:4px;font-size:2px;line-height:14px">&nbsp;</td>` +
          `<td style="padding-left:8px;font-size:12px;color:${SUBDUED};white-space:nowrap;vertical-align:middle">${esc(r.valueText)}</td>` +
          `</tr></table></td></tr></table>`
        );
      })
      .join('');
  return rows
    .map((r) => {
      const pct = Math.max(3, Math.round((r.value / max) * 100));
      const color = r.color ?? T.accent;
      return (
        `<div style="display:flex;align-items:center;gap:10px;margin:8px 0">` +
        `<div style="width:38%;min-width:90px;flex-shrink:0;font-size:12px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(r.label)}">${esc(r.label)}</div>` +
        `<div style="flex:1;min-width:50px;background:${TRACK};border-radius:6px;height:12px;overflow:hidden">` +
        `<div style="width:${pct}%;height:12px;background:${color};border-radius:6px"></div></div>` +
        `<div style="flex-shrink:0;font-size:11.5px;color:${SUBDUED};white-space:nowrap;font-variant-numeric:tabular-nums">${esc(r.valueText)}</div>` +
        `</div>`
      );
    })
    .join('');
}

// CỘT DỌC cho CHUỖI THỜI GIAN: 2 hàng flex đồng bộ (hàng cột + hàng nhãn) → thẳng trục;
// giá trị nhỏ trên đầu cột; trục đáy 2px. DOC → cột ngang dạng bảng.
function columnChart(
  rows: Array<{ label: string; value: number; valueText: string; color?: string }>,
): string {
  if (DOC) return barChart(rows);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const bars = rows
    .map((r) => {
      const h = Math.max(4, Math.round((r.value / max) * 96));
      const color = r.color ?? T.accent;
      return (
        `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px">` +
        `<div style="font-size:10px;color:${SUBDUED};white-space:nowrap;font-variant-numeric:tabular-nums">${esc(r.valueText)}</div>` +
        `<div style="width:68%;max-width:36px;height:${h}px;background:${color};border-radius:5px 5px 0 0"></div>` +
        `</div>`
      );
    })
    .join('');
  const labels = rows
    .map(
      (r) =>
        `<div style="flex:1;min-width:0;font-size:10px;color:${SUBDUED};text-align:center;line-height:1.3;overflow:hidden" title="${esc(r.label)}">${esc(r.label)}</div>`,
    )
    .join('');
  return (
    `<div style="display:flex;align-items:flex-end;gap:6px;height:126px;border-bottom:2px solid ${BORDER}">${bars}</div>` +
    `<div style="display:flex;gap:6px;margin-top:6px">${labels}</div>`
  );
}

// DONUT cho PHÂN BỔ: vòng màu + tâm hiện TỔNG, chú giải chấm màu + số & % thẳng hàng.
// DOC → cột ngang dạng bảng.
function donutChart(
  rows: Array<{ label: string; value: number; valueText: string; color: string }>,
): string {
  if (DOC) return barChart(rows);
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  let acc = 0;
  const segs = rows
    .map((r) => {
      const from = (acc / total) * 360;
      acc += r.value;
      return `${r.color} ${from}deg ${(acc / total) * 360}deg`;
    })
    .join(',');
  const legend = rows
    .map(
      (r) =>
        `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin:6px 0">` +
        `<span style="width:10px;height:10px;border-radius:3px;background:${r.color};flex-shrink:0"></span>` +
        `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.label)}">${esc(r.label)}</span>` +
        `<span style="margin-left:auto;color:${SUBDUED};white-space:nowrap;font-variant-numeric:tabular-nums">${esc(r.valueText)} · <b style="color:#202223">${Math.round((r.value / total) * 100)}%</b></span></div>`,
    )
    .join('');
  return (
    `<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">` +
    `<div style="width:116px;height:116px;border-radius:50%;background:conic-gradient(${segs});display:flex;align-items:center;justify-content:center;flex-shrink:0">` +
    `<div style="width:66px;height:66px;border-radius:50%;background:var(--p-color-bg-surface,#fff);display:flex;align-items:center;justify-content:center;font-size:14.5px;font-weight:700;font-variant-numeric:tabular-nums">${total.toLocaleString()}</div></div>` +
    `<div style="flex:1;min-width:180px">${legend}</div></div>`
  );
}

// Bảng màu cho donut nhiều lát (bắt đầu bằng màu theme để đồng bộ nhận diện).
function chartPalette(): string[] {
  return [T.accent, T.strength, '#b28400', T.weakness, '#7b61c4', '#0e8686', '#616a75'];
}

function chips(dist: Record<string, number>, mapLabel: (k: string) => string): string {
  const parts = Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([k, n]) =>
        `<span style="display:inline-block;border:1px solid ${T.accent};color:${T.accent};border-radius:16px;padding:3px 12px;margin:2px 4px 2px 0;font-size:12px">${esc(mapLabel(k))}: ${n}</span>`,
    );
  return parts.length ? `<div>${parts.join('')}</div>` : '';
}

function itemBlocks(
  items: Array<{ name: string; desc: string; effectiveness?: string; posts?: string }>,
  L: SocialReportLabels,
): string {
  return items
    .map(
      (it) =>
        `<div style="border:1px solid ${BORDER};border-radius:10px;padding:12px 14px;margin:10px 0;page-break-inside:avoid">` +
        `<div style="color:${T.accent};font-weight:700;margin-bottom:6px">${esc(it.name)}</div>` +
        `<div style="font-size:13px;line-height:1.55">${esc(it.desc)}</div>` +
        (it.effectiveness
          ? `<div style="font-size:13px;line-height:1.55;margin-top:6px"><b>${esc(L.effectiveness)}:</b> ${esc(it.effectiveness)}</div>`
          : '') +
        (it.posts
          ? `<div style="font-size:13px;margin-top:6px"><b>${esc(L.relatedPosts)}:</b> ${esc(it.posts)}</div>`
          : '') +
        `</div>`,
    )
    .join('');
}

// Dải chỉ số của 1 bài - THEO NỀN TẢNG: chỉ hiện số liệu nền tảng đó thực sự có.
// facebook: (views nếu video/reel) + reaction + bình luận + chia sẻ
// tiktok:   views + tim + bình luận + chia sẻ
// youtube:  views + like + bình luận (YouTube không có "chia sẻ")
function postCard(
  p: SocialPost,
  idx: number,
  L: SocialReportLabels,
  locale: string,
  kind: SocialChannelKind,
  postComments?: SocialComment[], // bình luận CỦA CHÍNH BÀI NÀY (báo cáo nhóm)
): string {
  // Tiêu đề thẻ: Facebook/nhóm/Instagram = "Bài N - LOẠI"; Threads = "Bài N" (thuần chữ);
  // TikTok/YouTube = "Video N" (kênh toàn video).
  const fbLike =
    kind === 'facebook' || kind === 'fbgroup' || kind === 'fbprofile' || kind === 'instagram';
  const cardTitle =
    kind === 'threads'
      ? `${L.post} ${idx}`
      : fbLike
        ? `${L.post} ${idx} - ${String(L[`type_${p.type}`] ?? p.type).toUpperCase()}`
        : `${L.videoItem} ${idx}`;
  const mets: Array<{ value: string; label: string }> = [];
  if ((!fbLike && kind !== 'threads') || p.type === 'reel' || p.type === 'video')
    mets.push({ value: fmt(p.views, locale), label: L.views });
  mets.push({
    value: fmt(p.reactions, locale),
    label:
      kind === 'tiktok'
        ? L.hearts
        : kind === 'youtube' || kind === 'threads' || kind === 'instagram'
          ? L.ytLikes
          : L.reactions,
  });
  mets.push({ value: fmt(p.comments, locale), label: L.commentsCount });
  if (kind !== 'youtube')
    mets.push({
      value: fmt(p.shares, locale),
      label: kind === 'threads' ? L.reposts : L.shares, // Threads: repost + quote
    });
  const rows: string[] = [];
  if (p.author) rows.push(`<b>${esc(L.author)}:</b> ${esc(p.author)}`); // người đăng (bài trong nhóm)
  if (p.time)
    rows.push(`<b>${esc(L.time)}:</b> ${esc(new Date(p.time).toLocaleDateString(locale))}`);
  // Link ra nền tảng ngoài → luôn mở tab mới (quy ước external link của hệ thống).
  if (p.url)
    rows.push(
      `<b>URL:</b> <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" style="color:${T.accent}">${esc(p.url)}</a>`,
    );
  rows.push(`<b>${esc(L.description)}:</b> ${p.text ? esc(p.text) : esc(L.none)}`);
  const transcript = p.transcript
    ? `<div style="border-left:3px solid ${T.accent};background:#f7f7f7;padding:10px 12px;margin-top:8px;font-style:italic;font-size:12.5px;line-height:1.55"><b>${esc(L.transcript)}:</b><br/>${esc(p.transcript)}</div>`
    : '';
  // "Bình luận đi theo bài viết": khối bình luận nằm NGAY TRONG thẻ bài để đọc bài + phản hồi cùng nhau.
  const commentsHtml = postComments?.length
    ? `<div style="margin-top:10px"><div style="font-weight:700;font-size:12.5px;margin-bottom:4px">${esc(L.postComments)} (${postComments.length})</div>` +
      postComments
        .map(
          (c) =>
            `<div style="border-left:3px solid ${BORDER};background:#fafafa;border-radius:0 8px 8px 0;padding:6px 10px;margin:6px 0;font-size:12.5px;line-height:1.5">` +
            (c.author ? `<b>${esc(c.author)}:</b> ` : '') +
            esc(c.text) +
            (c.likes ? `<span style="color:${SUBDUED}"> · ${fmt(c.likes, locale)} ${esc(L.likes)}</span>` : '') +
            `</div>`,
        )
        .join('') +
      `</div>`
    : '';
  return (
    `<div style="border:1px solid ${BORDER};border-radius:10px;margin:14px 0;overflow:hidden;page-break-inside:avoid">` +
    barHeader(T.accent, '#fff', esc(cardTitle)) +
    `<div style="padding:12px 14px">${statCards(mets)}<div style="font-size:13px;line-height:1.7">${rows.join('<br/>')}</div>${transcript}${commentsHtml}</div></div>`
  );
}

function adCard(a: SocialAd, idx: number, L: SocialReportLabels): string {
  const rows: string[] = [`<b>ID:</b> ${esc(a.id)}`];
  rows.push(`<b>${esc(L.adContent)}:</b> ${a.text ? esc(a.text) : esc(L.none)}`);
  if (a.cta) rows.push(`<b>Call to Action:</b> ${esc(a.cta)}`);
  return (
    `<div style="border:1px solid ${BORDER};border-radius:10px;margin:14px 0;overflow:hidden;page-break-inside:avoid">` +
    barHeader('#ebebeb', '#202223', `${esc(L.ad)} #${idx}${a.format ? ` - ${esc(a.format).toUpperCase()}` : ''}`) +
    `<div style="padding:12px 14px;font-size:13px;line-height:1.7">${rows.join('<br/>')}</div></div>`
  );
}

function textBox(body: string): string {
  return `<div style="border:1px solid ${BORDER};border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.6;page-break-inside:avoid">${esc(body)}</div>`;
}

function colorBox(bg: string, title: string, inner: string): string {
  return (
    `<div style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin:12px 0;page-break-inside:avoid">` +
    barHeader(bg, '#fff', esc(title)) +
    `<div style="padding:4px 14px 10px">${inner}</div></div>`
  );
}

interface Section {
  title: string;
  inner: string;
  kind?: SocialChannelKind; // mục thuộc 1 kênh → hiện icon nền tảng ở tiêu đề (chế độ thu gọn)
}

// Giá sản phẩm Shopee (actor trả số THẬT theo đơn vị tiền, không phải micro-units).
function shopeePrice(p: ShopeeProduct | undefined, locale: string): string {
  if (!p || p.priceMin === undefined) return 'n.a';
  const cur = p.currency ?? '';
  const min = p.priceMin.toLocaleString(locale);
  const range =
    p.priceMax !== undefined && p.priceMax !== p.priceMin
      ? `${min} - ${p.priceMax.toLocaleString(locale)}`
      : min;
  return cur ? `${range} ${cur}` : range;
}

// Thẻ 1 ĐÁNH GIÁ của khách (báo cáo sản phẩm Shopee).
function reviewCard(rv: ShopeeReview, idx: number, L: SocialReportLabels, locale: string): string {
  const header = `${L.review} ${idx}${rv.rating !== undefined ? ` - ${rv.rating}/5` : ''}`;
  const rows: string[] = [];
  if (rv.author || rv.time) {
    const parts = [
      rv.author ? esc(rv.author) : '',
      rv.time ? esc(new Date(rv.time).toLocaleDateString(locale)) : '',
    ].filter(Boolean);
    rows.push(parts.join(' · '));
  }
  // Báo cáo SHOP: đánh giá đi theo sản phẩm → ghi rõ đánh giá thuộc sản phẩm nào.
  if (rv.ofProduct) rows.push(`<b>${esc(L.ofProduct)}:</b> ${esc(rv.ofProduct)}`);
  if (rv.variant) rows.push(`<b>${esc(L.variantBought)}:</b> ${esc(rv.variant)}`);
  rows.push(rv.text ? esc(rv.text) : esc(L.none));
  const aspects = rv.aspects
    ? Object.entries(rv.aspects)
        .map(
          ([k, v]) =>
            `<span style="display:inline-block;border:1px solid ${BORDER};color:${SUBDUED};border-radius:16px;padding:2px 10px;margin:2px 4px 2px 0;font-size:11.5px">${esc(k)}: ${esc(v)}</span>`,
        )
        .join('')
    : '';
  const reply = rv.sellerReply
    ? `<div style="border-left:3px solid ${T.accent};background:#f7f7f7;padding:8px 10px;margin-top:6px;font-size:12.5px;line-height:1.5"><b>${esc(L.sellerReply)}:</b> ${esc(rv.sellerReply)}</div>`
    : '';
  return (
    `<div style="border:1px solid ${BORDER};border-radius:10px;margin:10px 0;overflow:hidden;page-break-inside:avoid">` +
    barHeader('#ebebeb', '#202223', esc(header)) +
    `<div style="padding:10px 14px;font-size:13px;line-height:1.6">${rows.join('<br/>')}${aspects ? `<div style="margin-top:6px">${aspects}</div>` : ''}${reply}</div></div>`
  );
}

// Các mục dữ liệu thô + chỉ số của báo cáo SHOP (Shopee/TikTok Shop/Lazada) - tổng thể
// e-commerce cũng tái dùng (prefix = tên sàn để phân biệt mục của từng sàn).
function shopSections(
  ch: SocialChannelData,
  L: SocialReportLabels,
  locale: string,
  prefix = '',
): Section[] {
  const out: Section[] = [];
  const si = ch.shopInfo;
  if (si) {
    const rows: string[] = [];
    rows.push(`<span style="font-weight:700;font-size:14px">${esc(si.name)}</span>${si.isOfficialShop ? ` <span style="color:${T.accent};font-size:12px;font-weight:700">Mall</span>` : ''}`);
    if (si.rating !== undefined) rows.push(`<b>${esc(L.ratingLabel)}:</b> ${si.rating}/5`);
    if (si.followers !== undefined) rows.push(`<b>${esc(L.followers)}:</b> ${fmt(si.followers, locale)}`);
    if (si.itemCount !== undefined) rows.push(`<b>${esc(L.itemCountLabel)}:</b> ${fmt(si.itemCount, locale)}`);
    if (si.responseRate !== undefined) rows.push(`<b>${esc(L.responseRate)}:</b> ${si.responseRate}%`);
    // Riêng shop TikTok Shop: tổng đã bán + GMV ước tính (chuỗi hiển thị từ nguồn analytics).
    if (si.totalSold) rows.push(`<b>${esc(L.shopTotalSold)}:</b> ${esc(si.totalSold)}`);
    if (si.gmv) rows.push(`<b>${esc(L.shopGmv)}:</b> ${esc(si.gmv)}`);
    if (si.location) rows.push(`<b>${esc(L.shopLocation)}:</b> ${esc(si.location)}`);
    if (si.url)
      rows.push(
        `<b>URL:</b> <a href="${esc(si.url)}" target="_blank" rel="noopener noreferrer" style="color:${T.accent}">${esc(si.url)}</a>`,
      );
    out.push({
      title: prefix + L.shopInfoTitle,
      kind: ch.kind,
      inner: `<div style="font-size:13px;line-height:1.8">${rows.join('<br/>')}</div>`,
    });
  }

  const products = ch.shopProducts ?? [];
  if (products.length)
    out.push({
      title: `${prefix}${L.productsTitle} (${products.length})`,
      kind: ch.kind,
      inner: products
        .map((p) =>
          metaRow(
            esc(p.name),
            [
              p.priceMin !== undefined ? shopeePrice(p, locale) : '',
              p.discount ? `-${esc(p.discount)}` : '',
              p.ratingStar !== undefined ? `${p.ratingStar}/5` : '',
              p.sold !== undefined ? `${esc(L.soldLabel)}: ${fmt(p.sold, locale)}` : '',
            ]
              .filter(Boolean)
              .join(' · ') || 'n.a',
          ),
        )
        .join(''),
    });

  const sm = ch.shopMetrics;
  if (sm && sm.productsCollected > 0) {
    let inner = statCards([
      {
        value:
          sm.priceMin !== undefined && sm.priceMax !== undefined
            ? `${sm.priceMin.toLocaleString(locale)} - ${sm.priceMax.toLocaleString(locale)} ${sm.currency ?? ''}`
            : 'n.a',
        label: L.priceRange,
      },
      {
        value: sm.priceAvg !== undefined ? `${sm.priceAvg.toLocaleString(locale)} ${sm.currency ?? ''}` : 'n.a',
        label: L.priceAvg,
      },
      { value: sm.ratingAvg !== undefined ? `${sm.ratingAvg}/5` : 'n.a', label: L.ratingCollected },
      { value: fmt(sm.withDiscount, locale), label: L.withDiscount },
    ]);
    if (sm.topRated?.length)
      inner +=
        subTitle(L.topRated) +
        sm.topRated.map((tp) => metaRow(esc(tp.name), `${tp.rating}/5`)).join('');
    out.push({ title: prefix + L.metricsTitleShop, kind: ch.kind, inner });
  }

  const reviews = ch.productReviews ?? [];
  if (reviews.length)
    out.push({
      title: `${prefix}${L.reviewsTitle} (${reviews.length})`,
      kind: ch.kind,
      inner: reviews.map((rv, i) => reviewCard(rv, i + 1, L, locale)).join(''),
    });
  return out;
}

// Các mục dữ liệu thô + chỉ số của báo cáo SẢN PHẨM Shopee.
function shopeeSections(ch: SocialChannelData, L: SocialReportLabels, locale: string): Section[] {
  const out: Section[] = [];
  const p = ch.product;
  if (p) {
    const rows: string[] = [];
    rows.push(`<span style="font-weight:700;font-size:14px">${esc(p.name)}</span>`);
    rows.push(`<b>${esc(L.priceLabel)}:</b> ${esc(shopeePrice(p, locale))}${p.discount ? ` (${esc(L.discountLabel)}: ${esc(p.discount)})` : ''}`);
    if (p.sold !== undefined) rows.push(`<b>${esc(L.soldLabel)}:</b> ${fmt(p.sold, locale)}`);
    if (p.stock !== undefined) rows.push(`<b>${esc(L.stockLabel)}:</b> ${fmt(p.stock, locale)}`);
    if (p.ratingStar !== undefined)
      rows.push(`<b>${esc(L.ratingLabel)}:</b> ${p.ratingStar}/5${p.ratingCount !== undefined ? ` (${fmt(p.ratingCount, locale)})` : ''}`);
    if (p.categories?.length) rows.push(`<b>${esc(L.category)}:</b> ${esc(p.categories.join(' › '))}`);
    if (p.shopName)
      rows.push(
        `<b>${esc(L.shopLabel)}:</b> ${esc(p.shopName)}${p.shopRating !== undefined ? ` · ${p.shopRating}/5` : ''}${p.shopLocation ? ` · ${esc(p.shopLocation)}` : ''}`,
      );
    if (p.url)
      rows.push(
        `<b>URL:</b> <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" style="color:${T.accent}">${esc(p.url)}</a>`,
      );
    if (p.attributes)
      rows.push(
        `<b>${esc(L.attributesLabel)}:</b> ${esc(
          Object.entries(p.attributes)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · '),
        )}`,
      );
    let inner = `<div style="font-size:13px;line-height:1.8">${rows.join('<br/>')}</div>`;
    if (p.variants?.length)
      inner +=
        subTitle(L.variantsLabel) +
        p.variants
          .map((vr) =>
            metaRow(
              esc(vr.name),
              [
                vr.price !== undefined ? `${vr.price.toLocaleString(locale)} ${p.currency ?? ''}` : '',
                vr.stock !== undefined ? `${esc(L.stockLabel)}: ${fmt(vr.stock, locale)}` : '',
              ]
                .filter(Boolean)
                .join(' · ') || 'n.a',
            ),
          )
          .join('');
    if (p.description)
      inner +=
        subTitle(L.description) +
        `<div style="border:1px solid ${BORDER};border-radius:10px;padding:12px 14px;font-size:12.5px;line-height:1.6;white-space:pre-wrap">${esc(p.description.slice(0, 2500))}</div>`;
    out.push({ title: L.productTitle, kind: ch.kind, inner });
  }

  const reviews = ch.productReviews ?? [];
  if (reviews.length)
    out.push({
      title: `${L.reviewsTitle} (${reviews.length})`,
      kind: ch.kind,
      inner: reviews.map((rv, i) => reviewCard(rv, i + 1, L, locale)).join(''),
    });

  const m = ch.productMetrics;
  if (m && m.reviewsCollected > 0) {
    let inner = statCards([
      { value: m.ratingAvg !== undefined ? `${m.ratingAvg}/5` : 'n.a', label: L.ratingCollected },
      { value: fmt(m.reviewsCollected, locale), label: L.reviewsCollected },
      { value: fmt(m.withMedia, locale), label: L.withMedia },
      { value: fmt(m.sellerReplies, locale), label: L.sellerReplies },
    ]);
    inner += subTitle(L.ratingDist) + chips(m.ratingDist, (k) => `${k}/5`);
    if (m.topVariants?.length)
      inner +=
        subTitle(L.topVariants) +
        m.topVariants.map((tv) => metaRow(esc(tv.name), `${fmt(tv.count, locale)} ${esc(L.review)}`)).join('');
    out.push({ title: L.metricsTitleProduct, kind: ch.kind, inner });
  }
  return out;
}

// Khối chỉ số của MỘT bộ metrics - BỐ CỤC THEO NỀN TẢNG để không có ô thiếu số liệu:
// facebook: like/theo dõi/tỷ lệ L-F/đánh giá + phân bổ định dạng + reaction-bình luận-chia sẻ TB + ads/CTA
// tiktok:   follower/tim/số video/tần suất + view-tim-bình luận-chia sẻ TB
// youtube:  subscriber/số video/tổng view/tần suất + view-like-bình luận TB
// overall:  follower gộp/số bài/tổng tương tác/tần suất + view-reaction-bình luận TB + phân bổ định dạng
function metricsInner(
  m: NonNullable<SocialReportRecord['metrics']>,
  L: SocialReportLabels,
  locale: string,
  kind: SocialChannelKind | 'overall',
): string {
  const freq = {
    value: m.postsPerDay !== undefined ? `${m.postsPerDay} ${L.perDay}` : 'n.a',
    label: L.postFrequency,
  };
  let inner = '';

  if (kind === 'facebook') {
    inner += statCards([
      { value: fmt(m.totalLikes, locale), label: L.totalLikes },
      { value: fmt(m.totalFollowers, locale), label: L.totalFollowers },
      { value: m.lfRatio !== undefined ? `${m.lfRatio}%` : 'n.a', label: L.lfRatio },
      { value: m.rating ?? 'n.a', label: L.rating },
    ]);
    inner += subTitle(L.formatDist) + chips(m.formatDist, (k) => L[`type_${k}`] ?? k);
    inner +=
      subTitle(L.avgEngagement) +
      statCards([
        { value: fmt(m.avgReactions, locale), label: L.avgReactions },
        { value: fmt(m.avgComments, locale), label: L.avgComments },
        { value: fmt(m.avgShares, locale), label: L.avgShares },
        freq,
      ]);
    if (Object.keys(m.adFormatDist).length)
      inner += subTitle(L.adFormatDist) + chips(m.adFormatDist, (k) => k);
    if (Object.keys(m.ctaDist).length) inner += subTitle(L.ctaDist) + chips(m.ctaDist, (k) => k);
    return inner;
  }

  if (kind === 'fbgroup') {
    // Nhóm: thành viên/số bài/bình luận đã thu/tần suất + phân bổ kiểu bài + tương tác TB
    // + thành viên đăng bài nổi bật (đặc thù cộng đồng nhiều người đăng).
    inner += statCards([
      { value: fmt(m.totalFollowers, locale), label: L.members },
      { value: fmt(m.postCount, locale), label: L.groupPosts },
      { value: fmt(m.commentCount, locale), label: L.commentsCount },
      freq,
    ]);
    inner += subTitle(L.formatDist) + chips(m.formatDist, (k) => L[`type_${k}`] ?? k);
    inner +=
      subTitle(L.avgEngagement) +
      statCards([
        { value: fmt(m.avgReactions, locale), label: L.avgReactions },
        { value: fmt(m.avgComments, locale), label: L.avgComments },
        { value: fmt(m.avgShares, locale), label: L.avgShares },
      ]);
    if (m.topContributors?.length) {
      inner +=
        subTitle(L.topContributors) +
        m.topContributors
          .map((c) =>
            metaRow(
              esc(c.name),
              `${fmt(c.posts, locale)} ${esc(L.contributorPosts)} · ${fmt(c.engagement, locale)} ${esc(L.contributorEngagement)}`,
            ),
          )
          .join('');
    }
    return inner;
  }

  if (kind === 'instagram') {
    // Instagram: follower/số bài/tần suất + phân bổ định dạng + like-bình luận-view TB.
    inner += statCards([
      { value: fmt(m.totalFollowers, locale), label: L.followers },
      { value: fmt(m.postCount, locale), label: L.organicPosts },
      { value: fmt(m.totalEngagement, locale), label: L.avgEngagement },
      freq,
    ]);
    inner += subTitle(L.formatDist) + chips(m.formatDist, (k) => L[`type_${k}`] ?? k);
    inner +=
      subTitle(L.avgEngagement) +
      statCards([
        { value: fmt(m.avgReactions, locale), label: L.avgYtLikes },
        { value: fmt(m.avgComments, locale), label: L.avgComments },
        { value: fmt(m.avgViews, locale), label: L.avgViews },
      ]);
    return inner;
  }

  if (kind === 'threads') {
    // Threads: follower/số bài/tần suất + like-trả lời-repost TB (thuần chữ, không view).
    inner += statCards([
      { value: fmt(m.totalFollowers, locale), label: L.followers },
      { value: fmt(m.postCount, locale), label: L.organicPosts },
      { value: fmt(m.totalEngagement, locale), label: L.avgEngagement },
      freq,
    ]);
    inner +=
      subTitle(L.avgEngagement) +
      statCards([
        { value: fmt(m.avgReactions, locale), label: L.avgYtLikes },
        { value: fmt(m.avgComments, locale), label: L.avgComments },
        { value: fmt(m.avgShares, locale), label: L.avgReposts },
      ]);
    return inner;
  }

  if (kind === 'tiktok') {
    inner += statCards([
      { value: fmt(m.totalFollowers, locale), label: L.followers },
      { value: fmt(m.totalLikes, locale), label: L.hearts },
      { value: fmt(m.postCount, locale), label: L.videos },
      freq,
    ]);
    inner +=
      subTitle(L.avgEngagement) +
      statCards([
        { value: fmt(m.avgViews, locale), label: L.avgViews },
        { value: fmt(m.avgReactions, locale), label: L.avgHearts },
        { value: fmt(m.avgComments, locale), label: L.avgComments },
        { value: fmt(m.avgShares, locale), label: L.avgShares },
      ]);
    return inner;
  }

  if (kind === 'youtube') {
    inner += statCards([
      { value: fmt(m.totalFollowers, locale), label: L.subscribers },
      { value: fmt(m.postCount, locale), label: L.videos },
      { value: fmt(m.totalViews, locale), label: L.totalViews },
      freq,
    ]);
    inner +=
      subTitle(L.avgEngagement) +
      statCards([
        { value: fmt(m.avgViews, locale), label: L.avgViews },
        { value: fmt(m.avgReactions, locale), label: L.avgYtLikes },
        { value: fmt(m.avgComments, locale), label: L.avgComments },
      ]);
    return inner;
  }

  // overall (gộp nhiều nền tảng)
  inner += statCards([
    { value: fmt(m.totalFollowers, locale), label: L.followers },
    { value: fmt(m.postCount, locale), label: L.organicPosts },
    { value: fmt(m.totalEngagement, locale), label: L.avgEngagement },
    freq,
  ]);
  inner += subTitle(L.formatDist) + chips(m.formatDist, (k) => L[`type_${k}`] ?? k);
  inner +=
    subTitle(L.avgEngagement) +
    statCards([
      { value: fmt(m.avgViews, locale), label: L.avgViews },
      { value: fmt(m.avgReactions, locale), label: L.avgReactions },
      { value: fmt(m.avgComments, locale), label: L.avgComments },
    ]);
  return inner;
}

// Tên hiển thị của kênh trong tiêu đề mục (đa kênh mới thêm tiền tố nền tảng).
function channelPrefix(ch: SocialChannelData, multi: boolean, L: SocialReportLabels): string {
  if (!multi) return '';
  const name = ch.page?.name ?? (ch.url ? '' : L.searchResults);
  return `${PLATFORM_META[ch.kind].label}${name ? ` · ${name}` : ''} - `;
}

// Nhịp bán 7 vs 30 ngày (TikTok Shop): so tốc độ bán/ngày → % TĂNG/GIẢM, thanh xanh/đỏ.
// Dùng chung cho báo cáo tổng thể e-commerce VÀ báo cáo shop TikTok Shop.
function ttsTrendRows(
  products: ShopeeProduct[],
  L: SocialReportLabels,
  locale: string,
): Array<{ label: string; value: number; valueText: string; color: string }> {
  return products
    .filter((p) => p.sold7d !== undefined && p.sold30d !== undefined && p.sold30d > 0)
    .sort((a, b) => (b.sold30d ?? 0) - (a.sold30d ?? 0))
    .slice(0, 6)
    .map((p) => {
      const growth = Math.round((p.sold7d! / 7 / (p.sold30d! / 30) - 1) * 100);
      const sign = growth >= 0 ? '+' : '';
      return {
        label: `${p.name.slice(0, 44)}${p.name.length > 44 ? '…' : ''}`,
        value: p.sold30d!,
        valueText: `${L.chart30d}: ${fmt(p.sold30d, locale)} ${L.unitSold} · ${sign}${growth}%`,
        color: growth >= 0 ? T.strength : T.weakness,
      };
    });
}

// Phân bổ số sao từ đánh giá đã thu ('5' → '1', màu xanh/nhấn/đỏ theo mức sao).
function ratingDistRows(
  dist: Record<string, number>,
  L: SocialReportLabels,
  locale: string,
): Array<{ label: string; value: number; valueText: string; color: string }> {
  return ['5', '4', '3', '2', '1']
    .filter((k) => (dist[k] ?? 0) > 0)
    .map((k) => ({
      label: `${k}/5`,
      value: dist[k],
      valueText: `${fmt(dist[k], locale)} ${L.unitReviews}`,
      color: Number(k) >= 4 ? T.strength : Number(k) === 3 ? T.accent : T.weakness,
    }));
}

// ── Biểu đồ của báo cáo KÊNH SOCIAL ĐƠN (fanpage/nhóm/IG/Threads/TikTok/YouTube):
// hiệu quả theo thời gian đăng (tăng/giảm), top bài, định dạng, thứ trong tuần. ──
function socialSingleChartSections(
  ch: SocialChannelData,
  L: SocialReportLabels,
  locale: string,
): Section[] {
  const cards: string[] = [];
  const posts = mergePosts(ch.posts, ch.reels);
  const isVideoKind = ch.kind === 'tiktok' || ch.kind === 'youtube';
  const unit = isVideoKind ? L.videoItem : L.post;
  // Video: chỉ số chính là VIEW; kênh khác: tổng tương tác (reaction + bình luận + chia sẻ).
  const metric = (p: SocialPost) =>
    isVideoKind
      ? (p.views ?? (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0))
      : (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
  const indexed = posts.map((p, i) => ({ p, i: i + 1, v: metric(p) }));

  const metricUnit = isVideoKind ? L.unitViews : L.unitEngagement;

  // Hiệu quả theo THỜI GIAN đăng (cũ → mới, tối đa 12 bài gần nhất): CỘT DỌC - nhìn nhịp
  // tăng/giảm như đồ thị; nhãn cột = ngày + số bài (trùng đánh số mục bài đăng).
  const timed = indexed
    .filter((x) => x.p.time)
    .sort((a, b) => new Date(a.p.time!).getTime() - new Date(b.p.time!).getTime())
    .slice(-12);
  if (timed.length >= 3)
    cards.push(
      chartCard(
        `${L.chartTimeline} (${metricUnit})`,
        columnChart(
          timed.map((x) => ({
            label: `${new Date(x.p.time!).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} · ${unit} ${x.i}`,
            value: x.v,
            valueText: fmt(x.v, locale),
          })),
        ),
        true,
      ),
    );

  // Top bài hiệu quả nhất (đánh số trùng với mục bài đăng bên dưới).
  const top = [...indexed].filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
  if (top.length >= 2)
    cards.push(
      chartCard(
        L.chartTopPosts,
        barChart(
          top.map((x) => ({
            label: `${unit} ${x.i}${x.p.time ? ` · ${new Date(x.p.time).toLocaleDateString(locale)}` : ''}`,
            value: x.v,
            valueText: `${fmt(x.v, locale)} ${metricUnit}`,
          })),
        ),
        true,
      ),
    );

  // Phân bổ định dạng: DONUT + chú giải (khi kênh có từ 2 loại bài trở lên).
  const fd = ch.metrics?.formatDist ?? {};
  const palette = chartPalette();
  const fdRows = Object.entries(fd)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n], i) => ({
      label: String(L[`type_${k}`] ?? k),
      value: n,
      valueText: `${fmt(n, locale)} ${L.unitPosts}`,
      color: palette[i % palette.length],
    }));
  if (fdRows.length >= 2) cards.push(chartCard(L.formatDist, donutChart(fdRows)));

  // Bài đăng theo THỨ trong tuần: CỘT DỌC 7 cột - tên thứ theo locale.
  const wd = ch.metrics?.weekdayDist ?? {};
  const wdRows = ['0', '1', '2', '3', '4', '5', '6']
    .filter((k) => (wd[k] ?? 0) > 0)
    .map((k) => ({
      // 01-01-2023 là Chủ nhật → cộng index ra đúng thứ, tên theo locale báo cáo.
      label: new Date(Date.UTC(2023, 0, 1 + Number(k))).toLocaleDateString(locale, {
        weekday: 'short',
        timeZone: 'UTC',
      }),
      value: wd[k],
      valueText: fmt(wd[k], locale),
    }));
  if (wdRows.length >= 2)
    cards.push(chartCard(`${L.chartWeekday} (${L.unitPosts})`, columnChart(wdRows)));

  // Nhóm Facebook: thành viên đăng nhiều nhất.
  if (ch.metrics?.topContributors?.length)
    cards.push(
      chartCard(
        L.topContributors,
        barChart(
          ch.metrics.topContributors.slice(0, 6).map((c) => ({
            label: c.name,
            value: c.posts,
            valueText: `${fmt(c.posts, locale)} ${L.unitPosts} · ${fmt(c.engagement, locale)} ${L.unitEngagement}`,
          })),
        ),
        true,
      ),
    );

  return cards.length
    ? [{ title: L.channelChartsTitle, kind: ch.kind, inner: chartGrid(cards) }]
    : [];
}

// ── Biểu đồ của báo cáo SẢN PHẨM e-commerce: phân bổ sao + phân loại được mua nhiều. ──
function productChartSections(
  ch: SocialChannelData,
  L: SocialReportLabels,
  locale: string,
): Section[] {
  const cards: string[] = [];
  const m = ch.productMetrics;
  const rd = ratingDistRows(m?.ratingDist ?? {}, L, locale);
  if (rd.length >= 2) cards.push(chartCard(L.ratingDist, donutChart(rd)));
  if (m?.topVariants?.length && m.topVariants.length >= 2)
    cards.push(
      chartCard(
        L.topVariants,
        barChart(
          m.topVariants.slice(0, 6).map((v) => ({
            label: v.name,
            value: v.count,
            valueText: `${fmt(v.count, locale)} ${L.unitReviews}`,
          })),
        ),
      ),
    );
  return cards.length
    ? [{ title: L.channelChartsTitle, kind: ch.kind, inner: chartGrid(cards) }]
    : [];
}

// ── Biểu đồ của báo cáo SHOP e-commerce: top bán chạy, phân bổ giá danh mục, phân bổ sao,
// nhịp bán 7/30 ngày (TikTok Shop). ──
function shopChartSections(
  ch: SocialChannelData,
  L: SocialReportLabels,
  locale: string,
): Section[] {
  const cards: string[] = [];
  const products = ch.shopProducts ?? [];

  // Top sản phẩm bán chạy theo ĐÃ BÁN (sàn nào có số liệu).
  const soldRows = products
    .filter((p) => p.sold !== undefined)
    .sort((a, b) => b.sold! - a.sold!)
    .slice(0, 8)
    .map((p) => ({
      label: `${p.name.slice(0, 44)}${p.name.length > 44 ? '…' : ''}`,
      value: p.sold!,
      valueText: `${fmt(p.sold, locale)} ${L.unitSold}`,
    }));
  if (soldRows.length >= 2) cards.push(chartCard(L.chartTopSold, barChart(soldRows), true));

  // Phân bổ GIÁ danh mục: chia dải giá thành 4 khoảng, đếm số sản phẩm mỗi khoảng.
  const prices = products.map((p) => p.priceMin).filter((n): n is number => n !== undefined);
  if (prices.length >= 4) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (max > min) {
      const stepSize = (max - min) / 4;
      const buckets = [0, 1, 2, 3].map((i) => ({
        from: min + stepSize * i,
        to: i === 3 ? max : min + stepSize * (i + 1),
        count: 0,
      }));
      for (const v of prices) {
        const bi = Math.min(3, Math.floor((v - min) / stepSize));
        buckets[Number.isFinite(bi) ? bi : 0].count += 1;
      }
      const cur = products.find((p) => p.currency)?.currency ?? '';
      const bRows = buckets
        .filter((b) => b.count > 0)
        .map((b) => ({
          label: `${Math.round(b.from).toLocaleString(locale)} - ${Math.round(b.to).toLocaleString(locale)} ${cur}`,
          value: b.count,
          valueText: `${fmt(b.count, locale)} ${L.unitProducts}`,
        }));
      if (bRows.length >= 2) cards.push(chartCard(L.chartPriceBuckets, barChart(bRows)));
    }
  }

  // Phân bổ số sao từ đánh giá đã thu: DONUT + chú giải.
  const rd = ratingDistRows(ch.productMetrics?.ratingDist ?? {}, L, locale);
  if (rd.length >= 2) cards.push(chartCard(L.ratingDist, donutChart(rd)));

  // Shop TikTok Shop: nhịp bán 7 vs 30 ngày (tăng/giảm).
  const trend = ttsTrendRows(products, L, locale);
  if (trend.length) cards.push(chartCard(L.chartTrend, barChart(trend), true));

  return cards.length
    ? [{ title: L.channelChartsTitle, kind: ch.kind, inner: chartGrid(cards) }]
    : [];
}

// ── Biểu đồ của báo cáo TỔNG THỂ E-COMMERCE: giá TB theo sàn, top đã bán, đánh giá TB,
// nhịp bán 7 vs 30 ngày của TikTok Shop (tăng/giảm - xanh/đỏ theo theme). ──
function ecomChartSections(r: SocialReportRecord, L: SocialReportLabels, locale: string): Section[] {
  const cards: string[] = [];
  const chans = r.channels;

  // Giá trung bình theo sàn (kèm dải giá).
  const priceRows = chans
    .filter((c) => c.shopMetrics?.priceAvg !== undefined)
    .map((c) => {
      const sm = c.shopMetrics!;
      const range =
        sm.priceMin !== undefined && sm.priceMax !== undefined
          ? ` (${sm.priceMin.toLocaleString(locale)} - ${sm.priceMax.toLocaleString(locale)})`
          : '';
      return {
        label: PLATFORM_META[c.kind].label,
        value: sm.priceAvg!,
        valueText: `${sm.priceAvg!.toLocaleString(locale)} ${sm.currency ?? ''}${range}`,
        color: PLATFORM_META[c.kind].color,
      };
    });
  if (priceRows.length) cards.push(chartCard(L.chartPriceAvg, barChart(priceRows)));

  // Top sản phẩm ĐÃ BÁN xuyên sàn (Shopee thường ẩn số đã bán → có thể vắng mặt).
  const soldRows = chans
    .flatMap((c) => (c.shopProducts ?? []).filter((p) => p.sold !== undefined).map((p) => ({ p, c })))
    .sort((a, b) => b.p.sold! - a.p.sold!)
    .slice(0, 8)
    .map(({ p, c }) => ({
      label: `${p.name.slice(0, 44)}${p.name.length > 44 ? '…' : ''} · ${PLATFORM_META[c.kind].label}`,
      value: p.sold!,
      valueText: `${fmt(p.sold, locale)} ${L.unitSold}`,
      color: PLATFORM_META[c.kind].color,
    }));
  if (soldRows.length) {
    const note = !chans.some(
      (c) => c.kind === 'shopee' && c.shopProducts?.some((p) => p.sold !== undefined),
    )
      ? `<div style="font-size:11px;color:${SUBDUED};margin-top:6px">${esc(L.chartSoldNote)}</div>`
      : '';
    cards.push(chartCard(L.chartTopSold, barChart(soldRows) + note, true));
  }

  // Đánh giá trung bình theo sàn.
  const ratingRows = chans
    .filter((c) => c.shopMetrics?.ratingAvg !== undefined)
    .map((c) => ({
      label: PLATFORM_META[c.kind].label,
      value: c.shopMetrics!.ratingAvg!,
      valueText: `${c.shopMetrics!.ratingAvg}/5`,
      color: PLATFORM_META[c.kind].color,
    }));
  if (ratingRows.length) cards.push(chartCard(L.chartRatingAvg, barChart(ratingRows)));

  // Nhịp bán 7 vs 30 ngày (TikTok Shop): so tốc độ bán/ngày → % TĂNG/GIẢM, màu theo chiều.
  const trendRows = ttsTrendRows(chans.flatMap((c) => c.shopProducts ?? []), L, locale);
  if (trendRows.length) cards.push(chartCard(L.chartTrend, barChart(trendRows), true));

  return cards.length ? [{ title: L.ecomChartsTitle, inner: chartGrid(cards) }] : [];
}

// ── Biểu đồ của báo cáo TỔNG THỂ SOCIAL: follower / tương tác TB / view TB theo kênh. ──
function socialChartSections(r: SocialReportRecord, L: SocialReportLabels, locale: string): Section[] {
  const cards: string[] = [];
  const chans = r.channels;
  const name = (c: SocialChannelData) =>
    c.page?.name ? `${PLATFORM_META[c.kind].label} · ${c.page.name}` : PLATFORM_META[c.kind].label;

  const followerRows = chans
    .filter((c) => c.page?.followers !== undefined)
    .map((c) => ({
      label: name(c),
      value: c.page!.followers!,
      valueText: `${fmt(c.page?.followers, locale)} ${L.unitFollowers}`,
      color: PLATFORM_META[c.kind].color,
    }));
  if (followerRows.length) cards.push(chartCard(L.chartFollowers, barChart(followerRows)));

  const engRows = chans
    .filter((c) => c.metrics?.avgReactions !== undefined)
    .map((c) => ({
      label: name(c),
      value: c.metrics!.avgReactions!,
      valueText: `${fmt(c.metrics?.avgReactions, locale)} ${L.unitEngagement}`,
      color: PLATFORM_META[c.kind].color,
    }));
  if (engRows.length) cards.push(chartCard(L.chartEngagement, barChart(engRows)));

  const viewRows = chans
    .filter((c) => c.metrics?.avgViews !== undefined)
    .map((c) => ({
      label: name(c),
      value: c.metrics!.avgViews!,
      valueText: `${fmt(c.metrics?.avgViews, locale)} ${L.unitViews}`,
      color: PLATFORM_META[c.kind].color,
    }));
  if (viewRows.length) cards.push(chartCard(L.chartViews, barChart(viewRows)));

  return cards.length ? [{ title: L.socialChartsTitle, inner: chartGrid(cards) }] : [];
}

// Danh sách MỤC của báo cáo (tiêu đề + nội dung) - nguồn chung cho cả 2 chế độ render.
function buildSections(r: SocialReportRecord, L: SocialReportLabels): Section[] {
  const locale = r.locale || 'vi';
  const a = r.analysis;
  const multi = r.channels.length > 1;
  const out: Section[] = [];

  // BIỂU ĐỒ đứng ĐẦU mọi báo cáo để nhìn nhanh bức tranh (user yêu cầu): tổng thể có bộ
  // so sánh riêng; báo cáo đơn kênh có bộ theo loại (social / sản phẩm / shop e-commerce).
  if (r.platform === 'ecom') out.push(...ecomChartSections(r, L, locale));
  else if (r.platform === 'overall') out.push(...socialChartSections(r, L, locale));
  else if (r.channels.length === 1) {
    const ch0 = r.channels[0];
    if (ch0.kind === 'shopee' || ch0.kind === 'tiktokshop' || ch0.kind === 'lazada')
      out.push(...productChartSections(ch0, L, locale));
    else if (ch0.kind === 'shopeeshop' || ch0.kind === 'tiktokshopshop' || ch0.kind === 'lazadashop')
      out.push(...shopChartSections(ch0, L, locale));
    else out.push(...socialSingleChartSections(ch0, L, locale));
  }

  // Mục theo TỪNG KÊNH: bài đăng, quảng cáo, chỉ số kênh - bố cục theo đúng nền tảng.
  for (const ch of r.channels) {
    // TỔNG THỂ E-COMMERCE: mỗi sàn 1 cụm mục danh mục sản phẩm (prefix = tên sàn).
    if (r.platform === 'ecom') {
      out.push(...shopSections(ch, L, locale, `${PLATFORM_META[ch.kind].label} - `));
      continue;
    }
    // Kênh SẢN PHẨM (Shopee/TikTok Shop/Lazada): mục riêng, không có bài đăng.
    if (ch.kind === 'shopee' || ch.kind === 'tiktokshop' || ch.kind === 'lazada') {
      out.push(...shopeeSections(ch, L, locale));
      continue;
    }
    // Kênh SHOP (Shopee/TikTok Shop/Lazada): info shop/danh mục/chỉ số/đánh giá theo sản phẩm.
    if (ch.kind === 'shopeeshop' || ch.kind === 'tiktokshopshop' || ch.kind === 'lazadashop') {
      out.push(...shopSections(ch, L, locale));
      continue;
    }
    const prefix = channelPrefix(ch, multi, L);
    const posts = mergePosts(ch.posts, ch.reels);
    // Báo cáo NHÓM: ghép bình luận về đúng bài của nó (khớp postUrl chuẩn hóa) để
    // hiện NGAY TRONG thẻ bài - "bình luận đi theo bài viết".
    const commentsByPost = new Map<string, SocialComment[]>();
    if (ch.kind === 'fbgroup')
      for (const c of ch.comments) {
        if (!c.postUrl) continue;
        const k = canonicalUrl(c.postUrl);
        commentsByPost.set(k, [...(commentsByPost.get(k) ?? []), c]);
      }
    if (posts.length)
      out.push({
        // Facebook/Instagram/Threads = "Bài đăng tự nhiên"; nhóm = "Bài viết trong nhóm";
        // TikTok/YouTube = "Video của kênh" (kênh toàn video).
        title:
          prefix +
          (ch.kind === 'facebook' || ch.kind === 'instagram' || ch.kind === 'threads'
            ? L.organicPosts
            : ch.kind === 'fbgroup'
              ? L.groupPostsTitle
              : L.videosTitle),
        kind: ch.kind,
        inner: posts
          .map((p, i) =>
            postCard(p, i + 1, L, locale, ch.kind, commentsByPost.get(canonicalUrl(p.url))?.slice(0, 10)),
          )
          .join(''),
      });
    if (ch.ads.length)
      out.push({
        title: prefix + L.adsTitle,
        kind: ch.kind,
        inner: ch.ads.map((ad, i) => adCard(ad, i + 1, L)).join(''),
      });
    if (ch.metrics)
      out.push({
        // Facebook = "Chỉ số fanpage"; nhóm = "Chỉ số nhóm"; TikTok/YouTube = "Chỉ số kênh".
        title:
          prefix +
          (ch.kind === 'facebook'
            ? L.metricsTitle
            : ch.kind === 'fbgroup'
              ? L.metricsTitleGroup
              : L.metricsTitleChannel),
        kind: ch.kind,
        inner: metricsInner(ch.metrics, L, locale, ch.kind),
      });
  }

  // Chỉ số TỔNG HỢP toàn báo cáo (chỉ khi nhiều kênh).
  if (multi && r.metrics)
    out.push({ title: L.totalMetricsTitle, inner: metricsInner(r.metrics, L, locale, 'overall') });

  // So sánh xuyên kênh (báo cáo tổng thể) - đặt NGAY trước phần phân tích thương hiệu.
  if (a.compare) {
    let inner = a.compare.overview ? textBox(a.compare.overview) : '';
    if (a.compare.channels.length)
      inner += subTitle(L.compareChannels) + itemBlocks(a.compare.channels, L);
    if (a.compare.bestFormats.length)
      inner += subTitle(L.bestFormats) + itemBlocks(a.compare.bestFormats, L);
    if (a.compare.allocation) inner += subTitle(L.allocation) + textBox(a.compare.allocation);
    out.push({ title: L.compareTitle, inner });
  }

  if (a.brand) {
    if (a.brand.positioning) out.push({ title: L.positioning, inner: textBox(a.brand.positioning) });
    if (a.brand.voice) out.push({ title: L.brandVoice, inner: textBox(a.brand.voice) });
    if (a.brand.targetAudience)
      out.push({ title: L.targetAudience, inner: textBox(a.brand.targetAudience) });
    if (a.brand.contentPillars.length)
      out.push({ title: L.contentPillars, inner: itemBlocks(a.brand.contentPillars, L) });
    if (a.brand.contentFormulas.length)
      out.push({ title: L.contentFormulas, inner: itemBlocks(a.brand.contentFormulas, L) });
  }

  if (a.tactics) {
    if (a.tactics.hooks.length) out.push({ title: L.hooks, inner: itemBlocks(a.tactics.hooks, L) });
    if (a.tactics.leading.length)
      out.push({ title: L.leading, inner: itemBlocks(a.tactics.leading, L) });
    if (a.tactics.ctas.length) out.push({ title: L.ctas, inner: itemBlocks(a.tactics.ctas, L) });

    const ad = a.tactics.adStrategy;
    if (ad.objective || ad.formulas.length || ad.angles.length) {
      let inner = ad.objective ? textBox(ad.objective) : '';
      if (ad.formulas.length) inner += subTitle(L.adFormulas) + itemBlocks(ad.formulas, L);
      if (ad.angles.length) inner += subTitle(L.adAngles) + itemBlocks(ad.angles, L);
      out.push({ title: L.adStrategy, inner });
    }

    const f = a.tactics.funnel;
    if (f.tofu || f.mofu || f.bofu) {
      const bar = (color: string, label: string, text: string) =>
        text
          ? `<div style="border-left:4px solid ${color};padding:8px 12px;margin:8px 0;font-size:13px;line-height:1.55;page-break-inside:avoid"><b>${esc(label)}:</b> ${esc(text)}</div>`
          : '';
      out.push({
        title: L.funnel,
        inner: bar(T.accent, L.tofu, f.tofu) + bar('#b28400', L.mofu, f.mofu) + bar(T.strength, L.bofu, f.bofu),
      });
    }
  }

  if (a.summary) {
    if (a.summary.summary) out.push({ title: L.strategySummary, inner: textBox(a.summary.summary) });
    if (a.summary.strengths.length || a.summary.weaknesses.length)
      out.push({
        title: L.swot,
        inner:
          (a.summary.strengths.length
            ? colorBox(T.strength, L.strengths, itemBlocks(a.summary.strengths, L))
            : '') +
          (a.summary.weaknesses.length
            ? colorBox(T.weakness, L.weaknesses, itemBlocks(a.summary.weaknesses, L))
            : ''),
      });
    if (a.summary.avoid.length || a.summary.learnFrom.length)
      out.push({
        title: L.suggestions,
        inner:
          (a.summary.avoid.length ? subTitle(L.avoid) + itemBlocks(a.summary.avoid, L) : '') +
          (a.summary.learnFrom.length
            ? subTitle(L.learnFrom) + itemBlocks(a.summary.learnFrom, L)
            : ''),
      });
    if (a.summary.contentIdeas.length)
      out.push({
        title: L.contentIdeas,
        inner: itemBlocks(
          a.summary.contentIdeas.map((i) => ({ name: i.title, desc: i.desc, effectiveness: i.reason })),
          { ...L, effectiveness: L.ideaReason },
        ),
      });
  }

  // ── Phân tích riêng của báo cáo NHÓM Facebook (góc nhìn cộng đồng) ──
  if (a.groupTopics) {
    const g = a.groupTopics;
    if (g.overview) out.push({ title: L.groupOverview, inner: textBox(g.overview) });
    if (g.hotTopics.length) out.push({ title: L.hotTopics, inner: itemBlocks(g.hotTopics, L) });
    if (g.formats.length) out.push({ title: L.groupFormats, inner: itemBlocks(g.formats, L) });
    if (g.engagementDrivers.length)
      out.push({ title: L.engagementDrivers, inner: itemBlocks(g.engagementDrivers, L) });
  }

  if (a.groupAudience) {
    const g = a.groupAudience;
    if (g.memberProfile) out.push({ title: L.memberProfile, inner: textBox(g.memberProfile) });
    if (g.needs.length || g.painPoints.length)
      out.push({
        title: L.memberNeedsPains,
        inner:
          (g.needs.length ? colorBox(T.strength, L.memberNeeds, itemBlocks(g.needs, L)) : '') +
          (g.painPoints.length ? colorBox(T.weakness, L.painPoints, itemBlocks(g.painPoints, L)) : ''),
      });
    if (g.questions.length)
      out.push({ title: L.memberQuestions, inner: itemBlocks(g.questions, L) });
    if (g.language) out.push({ title: L.memberLanguage, inner: textBox(g.language) });
  }

  if (a.groupSummary) {
    const g = a.groupSummary;
    if (g.summary) out.push({ title: L.groupSummaryTitle, inner: textBox(g.summary) });
    if (g.opportunities.length)
      out.push({ title: L.opportunities, inner: itemBlocks(g.opportunities, L) });
    if (g.engagementTips.length || g.avoid.length)
      out.push({
        title: L.engagementGuide,
        inner:
          (g.engagementTips.length
            ? subTitle(L.engagementTips) + itemBlocks(g.engagementTips, L)
            : '') +
          (g.avoid.length ? subTitle(L.avoid) + itemBlocks(g.avoid, L) : ''),
      });
    if (g.contentIdeas.length)
      out.push({
        title: L.contentIdeas,
        inner: itemBlocks(
          g.contentIdeas.map((i) => ({ name: i.title, desc: i.desc, effectiveness: i.reason })),
          { ...L, effectiveness: L.ideaReason },
        ),
      });
  }

  // ── Phân tích riêng của báo cáo FACEBOOK CÁ NHÂN (nội dung + tệp người theo dõi/tương tác) ──
  if (a.profileTopics) {
    const g = a.profileTopics;
    if (g.overview) out.push({ title: L.profileOverview, inner: textBox(g.overview) });
    if (g.hotTopics.length) out.push({ title: L.hotTopics, inner: itemBlocks(g.hotTopics, L) });
    if (g.formats.length) out.push({ title: L.groupFormats, inner: itemBlocks(g.formats, L) });
    if (g.engagementDrivers.length)
      out.push({ title: L.engagementDrivers, inner: itemBlocks(g.engagementDrivers, L) });
  }
  if (a.profileAudience) {
    const g = a.profileAudience;
    if (g.memberProfile) out.push({ title: L.followerProfile, inner: textBox(g.memberProfile) });
    if (g.needs.length || g.painPoints.length)
      out.push({
        title: L.memberNeedsPains,
        inner:
          (g.needs.length ? colorBox(T.strength, L.memberNeeds, itemBlocks(g.needs, L)) : '') +
          (g.painPoints.length ? colorBox(T.weakness, L.painPoints, itemBlocks(g.painPoints, L)) : ''),
      });
    if (g.questions.length) out.push({ title: L.memberQuestions, inner: itemBlocks(g.questions, L) });
    if (g.language) out.push({ title: L.followerLanguage, inner: textBox(g.language) });
  }
  if (a.profileSummary) {
    const g = a.profileSummary;
    if (g.summary) out.push({ title: L.profileSummaryTitle, inner: textBox(g.summary) });
    if (g.opportunities.length)
      out.push({ title: L.profileOpportunities, inner: itemBlocks(g.opportunities, L) });
    if (g.engagementTips.length || g.avoid.length)
      out.push({
        title: L.profileEngagementGuide,
        inner:
          (g.engagementTips.length
            ? subTitle(L.engagementTips) + itemBlocks(g.engagementTips, L)
            : '') +
          (g.avoid.length ? subTitle(L.avoid) + itemBlocks(g.avoid, L) : ''),
      });
    if (g.contentIdeas.length)
      out.push({
        title: L.contentIdeas,
        inner: itemBlocks(
          g.contentIdeas.map((i) => ({ name: i.title, desc: i.desc, effectiveness: i.reason })),
          { ...L, effectiveness: L.ideaReason },
        ),
      });
  }

  // ── Phân tích riêng của báo cáo SẢN PHẨM Shopee (góc nhìn e-commerce) ──
  if (a.shopeeProduct) {
    const g = a.shopeeProduct;
    if (g.overview) out.push({ title: L.productOverview, inner: textBox(g.overview) });
    if (g.listingStrengths.length || g.listingGaps.length)
      out.push({
        title: L.listingReview,
        inner:
          (g.listingStrengths.length
            ? colorBox(T.strength, L.listingStrengths, itemBlocks(g.listingStrengths, L))
            : '') +
          (g.listingGaps.length
            ? colorBox(T.weakness, L.listingGaps, itemBlocks(g.listingGaps, L))
            : ''),
      });
    if (g.pricingPosition) out.push({ title: L.pricingPosition, inner: textBox(g.pricingPosition) });
  }

  if (a.shopeeReviews) {
    const g = a.shopeeReviews;
    if (g.sentiment) out.push({ title: L.reviewSentiment, inner: textBox(g.sentiment) });
    if (g.praises.length || g.complaints.length)
      out.push({
        title: L.praisesComplaints,
        inner:
          (g.praises.length ? colorBox(T.strength, L.praises, itemBlocks(g.praises, L)) : '') +
          (g.complaints.length
            ? colorBox(T.weakness, L.complaints, itemBlocks(g.complaints, L))
            : ''),
      });
    if (g.customerNeeds.length)
      out.push({ title: L.customerNeeds, inner: itemBlocks(g.customerNeeds, L) });
    if (g.language) out.push({ title: L.buyerLanguage, inner: textBox(g.language) });
  }

  if (a.shopeeSummary) {
    const g = a.shopeeSummary;
    if (g.summary) out.push({ title: L.shopeeSummaryTitle, inner: textBox(g.summary) });
    if (g.improvements.length)
      out.push({ title: L.improvements, inner: itemBlocks(g.improvements, L) });
    if (g.contentIdeas.length)
      out.push({
        title: L.contentIdeas,
        inner: itemBlocks(
          g.contentIdeas.map((i) => ({ name: i.title, desc: i.desc, effectiveness: i.reason })),
          { ...L, effectiveness: L.ideaReason },
        ),
      });
    if (g.faq.length) out.push({ title: L.buyerFaq, inner: itemBlocks(g.faq, L) });
  }

  // ── Phân tích riêng của báo cáo SHOP Shopee ──
  if (a.shopCatalog) {
    const g = a.shopCatalog;
    if (g.overview) out.push({ title: L.shopOverview, inner: textBox(g.overview) });
    if (g.priceStrategy) out.push({ title: L.priceStrategy, inner: textBox(g.priceStrategy) });
    if (g.strongProducts.length || g.gaps.length)
      out.push({
        title: L.catalogReview,
        inner:
          (g.strongProducts.length
            ? colorBox(T.strength, L.strongProducts, itemBlocks(g.strongProducts, L))
            : '') +
          (g.gaps.length ? colorBox(T.weakness, L.catalogGaps, itemBlocks(g.gaps, L)) : ''),
      });
  }

  if (a.shopCustomers) {
    const g = a.shopCustomers;
    if (g.sentiment) out.push({ title: L.reviewSentiment, inner: textBox(g.sentiment) });
    if (g.praises.length || g.complaints.length)
      out.push({
        title: L.praisesComplaints,
        inner:
          (g.praises.length ? colorBox(T.strength, L.praises, itemBlocks(g.praises, L)) : '') +
          (g.complaints.length
            ? colorBox(T.weakness, L.complaints, itemBlocks(g.complaints, L))
            : ''),
      });
    if (g.customerNeeds.length)
      out.push({ title: L.customerNeeds, inner: itemBlocks(g.customerNeeds, L) });
    if (g.language) out.push({ title: L.buyerLanguage, inner: textBox(g.language) });
  }

  if (a.shopSummary) {
    const g = a.shopSummary;
    if (g.summary) out.push({ title: L.shopSummaryTitle, inner: textBox(g.summary) });
    if (g.opportunities.length)
      out.push({ title: L.opportunities, inner: itemBlocks(g.opportunities, L) });
    if (g.improvements.length)
      out.push({ title: L.improvements, inner: itemBlocks(g.improvements, L) });
    if (g.contentIdeas.length)
      out.push({
        title: L.contentIdeas,
        inner: itemBlocks(
          g.contentIdeas.map((i) => ({ name: i.title, desc: i.desc, effectiveness: i.reason })),
          { ...L, effectiveness: L.ideaReason },
        ),
      });
  }

  // ── Phân tích riêng của báo cáo TỔNG THỂ E-COMMERCE (nghiên cứu thị trường) ──
  if (a.ecomMarket) {
    const g = a.ecomMarket;
    if (g.overview) out.push({ title: L.ecomOverview, inner: textBox(g.overview) });
    if (g.platforms.length) out.push({ title: L.ecomPlatforms, inner: itemBlocks(g.platforms, L) });
    if (g.pricing) out.push({ title: L.ecomPricing, inner: textBox(g.pricing) });
    if (g.demand.length) out.push({ title: L.ecomDemand, inner: itemBlocks(g.demand, L) });
  }

  if (a.ecomCompetitors) {
    const g = a.ecomCompetitors;
    if (g.overview) out.push({ title: L.ecomCompetitionOverview, inner: textBox(g.overview) });
    if (g.competitors.length)
      out.push({ title: L.ecomCompetitors, inner: itemBlocks(g.competitors, L) });
    if (g.strategies.length)
      out.push({ title: L.ecomStrategies, inner: itemBlocks(g.strategies, L) });
  }

  if (a.ecomSummary) {
    const g = a.ecomSummary;
    if (g.summary) out.push({ title: L.ecomSummaryTitle, inner: textBox(g.summary) });
    if (g.opportunities.length || g.risks.length)
      out.push({
        title: L.ecomOppRisks,
        inner:
          (g.opportunities.length
            ? colorBox(T.strength, L.opportunities, itemBlocks(g.opportunities, L))
            : '') +
          (g.risks.length ? colorBox(T.weakness, L.ecomRisks, itemBlocks(g.risks, L)) : ''),
      });
    if (g.entryPlan) out.push({ title: L.ecomEntryPlan, inner: textBox(g.entryPlan) });
    if (g.contentIdeas.length)
      out.push({
        title: L.contentIdeas,
        inner: itemBlocks(
          g.contentIdeas.map((i) => ({ name: i.title, desc: i.desc, effectiveness: i.reason })),
          { ...L, effectiveness: L.ideaReason },
        ),
      });
  }

  return out;
}

// Khối đầu báo cáo: HERO gradient màu nhấn (tiêu đề + chip nền tảng + ngày) + thẻ chỉ số
// + giới thiệu. Luôn hiển thị, không thu gọn.
function buildHeader(r: SocialReportRecord, L: SocialReportLabels): string {
  const locale = r.locale || 'vi';
  const single = r.channels.length === 1 ? r.channels[0] : undefined;
  const chipsHtml = r.channels
    .map((c) => platformChip(c.kind, r.channels.length > 1 ? c.page?.name : undefined, true))
    .join('');
  const heroInner =
    (r.keyword
      ? `<div style="font-size:12px;color:#e8eefc;margin-bottom:2px">${esc(L.keywordLabel)}</div>`
      : '') +
    `<div style="font-size:25px;font-weight:800;line-height:1.25;color:#ffffff">${esc(r.title)}</div>` +
    `<div style="margin:10px 0 4px">${chipsHtml}</div>` +
    `<div style="font-size:12px;color:#e8eefc">${esc(L.reportSubtitle)} · ${esc(L.generatedAt)}: ${esc(new Date(r.createdAt).toLocaleDateString(locale))}</div>`;
  // Word/Google Docs không hỗ trợ gradient (nền mất → chữ trắng tàng hình) → DOC dùng
  // bảng 1 ô nền đặc màu nhấn; trang xem/in giữ gradient.
  const hero = DOC
    ? `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:14px">` +
      `<tr><td style="background-color:${T.accent};background:${T.accent};color:#ffffff;padding:22px 22px 18px">${heroInner}</td></tr></table>`
    : `<div style="background:linear-gradient(135deg,${T.accent},${shade(T.accent)});border-radius:14px;padding:22px 22px 18px;color:#fff;margin-bottom:14px">${heroInner}</div>`;

  // Thẻ chỉ số đầu trang - THEO LOẠI BÁO CÁO để không có ô "n.a" vô nghĩa:
  // facebook: theo dõi/like/danh mục/đánh giá · tiktok: follower/tim/số video/view TB
  // youtube: subscriber/số video/tổng view/view TB · tổng thể: hàng chỉ số RIÊNG từng kênh.
  const page = single?.page;
  const cm = single?.metrics;
  let stats = '';
  if (single?.kind === 'facebook') {
    stats = statCards([
      { value: fmt(page?.followers, locale), label: L.followers },
      { value: fmt(page?.likes, locale), label: L.likes },
      { value: page?.categories?.join(', ') || 'n.a', label: L.category },
      { value: page?.rating ?? 'n.a', label: L.rating },
    ]);
  } else if (single?.kind === 'fbgroup') {
    // Nhóm: thành viên/số bài/reaction TB/bình luận TB (quyền riêng tư nằm ở categories).
    stats = statCards([
      { value: fmt(page?.followers, locale), label: L.members },
      { value: fmt(cm?.postCount, locale), label: L.groupPosts },
      { value: fmt(cm?.avgReactions, locale), label: L.avgReactions },
      { value: fmt(cm?.avgComments, locale), label: L.avgComments },
    ]);
  } else if (single?.kind === 'instagram') {
    stats = statCards([
      { value: fmt(page?.followers, locale), label: L.followers },
      { value: fmt(cm?.postCount, locale), label: L.organicPosts },
      { value: fmt(cm?.avgReactions, locale), label: L.avgYtLikes },
      { value: fmt(cm?.avgComments, locale), label: L.avgComments },
    ]);
  } else if (single?.kind === 'threads') {
    stats = statCards([
      { value: fmt(page?.followers, locale), label: L.followers },
      { value: fmt(cm?.postCount, locale), label: L.organicPosts },
      { value: fmt(cm?.avgReactions, locale), label: L.avgYtLikes },
      { value: fmt(cm?.avgShares, locale), label: L.avgReposts },
    ]);
  } else if (single?.kind === 'shopee' || single?.kind === 'tiktokshop' || single?.kind === 'lazada') {
    // Sản phẩm Shopee/TikTok Shop: Shopee CHẶN một số field theo sản phẩm (tổng lượt đánh
    // giá/đã bán thường null từ mọi nguồn - đã xác minh 07-2026; TikTok Shop có đủ) → dựng
    // ô THÔNG MINH: ưu tiên sao/tổng đánh giá/đã bán/giá, ô nào thiếu thì thế bằng dữ liệu
    // có thật (đánh giá đã thu, giảm giá, kho, sao của shop) - không hiện ô "n.a" vô nghĩa.
    const p = single.product;
    const pm = single.productMetrics;
    const candidates: Array<{ value: string; label: string } | null> = [
      p?.ratingStar !== undefined ? { value: `${p.ratingStar}/5`, label: L.ratingLabel } : null,
      p?.ratingCount !== undefined
        ? { value: fmt(p.ratingCount, locale), label: L.reviewsTotal }
        : pm?.reviewsCollected
          ? { value: fmt(pm.reviewsCollected, locale), label: L.reviewsCollected }
          : null,
      p?.sold !== undefined ? { value: fmt(p.sold, locale), label: L.soldLabel } : null,
      p?.priceMin !== undefined ? { value: shopeePrice(p, locale), label: L.priceLabel } : null,
      p?.discount ? { value: p.discount, label: L.discountLabel } : null,
      p?.stock !== undefined ? { value: fmt(p.stock, locale), label: L.stockLabel } : null,
      p?.shopRating !== undefined ? { value: `${p.shopRating}/5`, label: L.shopLabel } : null,
    ];
    const cells = candidates.filter((c): c is { value: string; label: string } => c !== null).slice(0, 4);
    stats = cells.length ? statCards(cells) : '';
  } else if (single?.kind === 'shopeeshop' || single?.kind === 'tiktokshopshop' || single?.kind === 'lazadashop') {
    // Shop Shopee/TikTok Shop: ô thông minh - Shopee có follower/tổng sản phẩm/tỷ lệ phản
    // hồi; TikTok Shop thay bằng tổng đã bán/GMV (nguồn analytics, chuỗi hiển thị).
    const si = single.shopInfo;
    const sm = single.shopMetrics;
    const candidates: Array<{ value: string; label: string } | null> = [
      si?.rating !== undefined ? { value: `${si.rating}/5`, label: L.ratingLabel } : null,
      si?.followers !== undefined ? { value: fmt(si.followers, locale), label: L.followers } : null,
      si?.totalSold ? { value: si.totalSold, label: L.shopTotalSold } : null,
      si?.gmv ? { value: si.gmv, label: L.shopGmv } : null,
      si?.itemCount !== undefined
        ? { value: fmt(si.itemCount, locale), label: L.itemCountLabel }
        : sm?.productsCollected
          ? { value: fmt(sm.productsCollected, locale), label: L.productsCollected }
          : null,
      si?.responseRate !== undefined
        ? { value: `${si.responseRate}%`, label: L.responseRate }
        : sm?.ratingAvg !== undefined
          ? { value: `${sm.ratingAvg}/5`, label: L.ratingCollected }
          : null,
    ];
    const cells = candidates.filter((c): c is { value: string; label: string } => c !== null).slice(0, 4);
    stats = cells.length ? statCards(cells) : '';
  } else if (single?.kind === 'tiktok') {
    stats = statCards([
      { value: fmt(page?.followers, locale), label: L.followers },
      { value: fmt(page?.likes, locale), label: L.hearts },
      { value: fmt(cm?.postCount, locale), label: L.videos },
      { value: fmt(cm?.avgViews, locale), label: L.avgViews },
    ]);
  } else if (single?.kind === 'youtube') {
    stats = statCards([
      { value: fmt(page?.followers, locale), label: L.subscribers },
      { value: fmt(cm?.postCount, locale), label: L.videos },
      { value: fmt(cm?.totalViews, locale), label: L.totalViews },
      { value: fmt(cm?.avgViews, locale), label: L.avgViews },
    ]);
  } else if (r.platform === 'ecom') {
    // Tổng thể E-COMMERCE: mỗi sàn 1 hàng - số sản phẩm thu + dải giá + đánh giá TB.
    stats = r.channels
      .map((c) => {
        const sm = c.shopMetrics;
        const cells = [
          `${fmt(sm?.productsCollected, locale)} ${esc(L.productsCollected)}`,
          sm?.priceMin !== undefined && sm?.priceMax !== undefined
            ? `${sm.priceMin.toLocaleString(locale)} - ${sm.priceMax.toLocaleString(locale)} ${esc(sm.currency ?? '')}`
            : '',
          sm?.ratingAvg !== undefined ? `${sm.ratingAvg}/5 ${esc(L.ratingCollected)}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return metaRow(
          `${platformIcon(c.kind, 12)}<span style="font-size:13px"> ${esc(PLATFORM_META[c.kind].label)}</span>`,
          cells || 'n.a',
        );
      })
      .join('');
  } else {
    // Tổng thể: mỗi kênh 1 HÀNG chỉ số riêng (icon + tên + số liệu chính của nền tảng đó).
    stats = r.channels
      .map((c) => {
        const p = c.page;
        const m = c.metrics;
        const name = p?.name ?? `${PLATFORM_META[c.kind].label} · ${L.searchResults}`;
        const cells =
          c.kind === 'youtube'
            ? `${fmt(p?.followers, locale)} ${esc(L.subscribers)} · ${fmt(m?.postCount, locale)} ${esc(L.videos)} · ${fmt(m?.avgViews, locale)} ${esc(L.avgViews)}`
            : c.kind === 'tiktok'
              ? `${fmt(p?.followers, locale)} ${esc(L.followers)} · ${fmt(m?.postCount, locale)} ${esc(L.videos)} · ${fmt(m?.avgViews, locale)} ${esc(L.avgViews)}`
              : `${fmt(p?.followers, locale)} ${esc(L.followers)} · ${fmt(m?.postCount, locale)} ${esc(L.organicPosts)} · ${fmt(m?.avgReactions, locale)} ${esc(L.avgReactions)}`;
        return metaRow(`${platformIcon(c.kind, 12)}<span style="font-size:13px"> ${esc(name)}</span>`, cells);
      })
      .join('');
  }
  return (
    hero +
    stats +
    (page?.intro
      ? `<div style="background:#f7f7f7;border-radius:10px;padding:12px 14px;font-size:13px"><b>${esc(L.intro)}:</b> ${esc(page.intro)}</div>`
      : '')
  );
}

// CSS cho chế độ thu gọn - dùng token Polaris (có fallback) để đồng bộ UI trong app.
const COLLAPSIBLE_CSS =
  '<style>' +
  `.sr-report details.sr-sec{border:1px solid var(--p-color-border,${BORDER});border-radius:12px;margin:10px 0;background:var(--p-color-bg-surface,#fff)}` +
  `.sr-report .sr-sec>summary{display:flex;align-items:center;gap:8px;padding:12px 14px;font-weight:650;font-size:14px;cursor:pointer;list-style:none;color:var(--p-color-text,#202223);border-radius:12px}` +
  `.sr-report .sr-sec>summary:hover{background:var(--p-color-bg-surface-hover,#f7f7f7)}` +
  `.sr-report .sr-sec>summary::-webkit-details-marker{display:none}` +
  `.sr-report .sr-chev{flex-shrink:0;display:inline-flex;transition:transform .15s ease}` +
  `.sr-report details[open]>summary .sr-chev{transform:rotate(90deg)}` +
  `.sr-report .sr-sec__body{padding:0 14px 12px}` +
  '</style>';

// Chevron SVG (không dùng emoji/ký tự - theo UI guidelines).
const CHEVRON =
  `<span class="sr-chev" aria-hidden="true"><svg viewBox="0 0 20 20" width="16" height="16" fill="${SUBDUED}"><path d="M7.5 4.5l6 5.5-6 5.5v-11z"/></svg></span>`;

// Phần THÂN báo cáo. collapsible=true → mỗi mục là <details> thu gọn mặc định (trang xem
// trong app); mặc định (bản xuất) → mở hết với tiêu đề h2. theme = bộ màu tùy chỉnh.
// doc=true → bố cục tương thích Word/Google Docs (bảng thay flex, không SVG/gradient).
export function buildSocialReportBody(
  r: SocialReportRecord,
  L: SocialReportLabels,
  opts?: { collapsible?: boolean; theme?: SocialReportTheme; doc?: boolean },
): string {
  applyTheme(opts?.theme);
  DOC = !!opts?.doc;
  const header = buildHeader(r, L);
  const sections = buildSections(r, L);
  if (!opts?.collapsible)
    return header + sections.map((s) => sectionTitle(s.title) + s.inner).join('');
  const items = sections
    .map(
      (s) =>
        `<details class="sr-sec"><summary>${CHEVRON}${s.kind ? platformIcon(s.kind, 12) : ''}<span>${esc(s.title)}</span></summary><div class="sr-sec__body">${s.inner}</div></details>`,
    )
    .join('');
  return `<div class="sr-report">${COLLAPSIBLE_CSS}${header}<div style="height:12px"></div>${items}</div>`;
}

// Document HTML hoàn chỉnh cho bản xuất: mở hết mục, kèm logo + dòng nguồn từ Thông tin
// hệ thống. print=true (đường in → PDF): @page margin 0 để TẮT header/footer mặc định của
// trình duyệt (ngày giờ, tiêu đề, about:blank, số trang) + logo/nguồn LẶP LẠI TRÊN MỌI
// TRANG (thanh position:fixed + bảng thead/tfoot giữ chỗ). print=false (.doc/Drive):
// layout tĩnh đơn giản - Word không hỗ trợ fixed, và @page margin 0 sẽ phá lề Word.
export function buildSocialReportHtml(
  r: SocialReportRecord,
  L: SocialReportLabels,
  opts?: { brand?: SocialReportBrand; theme?: SocialReportTheme; print?: boolean },
): string {
  applyTheme(opts?.theme);
  const brand = opts?.brand;
  const hasBrand = !!(brand?.logo || brand?.sourceText);
  // Bản .doc/Drive (không print) mở bằng Word/Google Docs → bố cục DOC; bản in chạy
  // trong trình duyệt → giữ bố cục đầy đủ.
  const body = buildSocialReportBody(r, L, { theme: opts?.theme, doc: !opts?.print });
  const docHead =
    `<!doctype html><html lang="${esc(r.locale || 'vi')}"><head><meta charset="utf-8">` +
    `<title>${esc(r.title || 'Social Report')}</title>`;

  const logoImg = brand?.logo ? `<img src="${esc(brand.logo)}" alt="" style="height:34px;width:auto"/>` : '<span></span>';
  const sourceSpan = brand?.sourceText
    ? `<span style="color:${SUBDUED};font-size:12px">${esc(brand.sourceText)}</span>`
    : '<span></span>';
  const sourceLink = brand?.sourceUrl
    ? `<a href="${esc(brand.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color:${T.accent}">${esc(brand.sourceUrl)}</a>`
    : '<span></span>';

  if (!opts?.print) {
    // .doc / Drive: header + footer thương hiệu xuất hiện 1 lần (Word tự phân trang).
    // Dựng bằng bảng 2 ô (Word/Google Docs không hỗ trợ flex).
    const brandHeader = hasBrand
      ? `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:18px"><tr>` +
        `<td style="border-bottom:1px solid ${BORDER};padding-bottom:12px">${logoImg}</td>` +
        `<td style="border-bottom:1px solid ${BORDER};padding-bottom:12px;text-align:right">${sourceSpan}</td>` +
        `</tr></table>`
      : '';
    const brandFooter = brand?.sourceText
      ? `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:28px"><tr>` +
        `<td style="border-top:1px solid ${BORDER};padding-top:10px;color:${SUBDUED};font-size:12px">${esc(brand.sourceText)}</td>` +
        `<td style="border-top:1px solid ${BORDER};padding-top:10px;text-align:right;font-size:12px">${sourceLink}</td>` +
        `</tr></table>`
      : '';
    return (
      docHead +
      `<style>body{font-family:Inter,Arial,Helvetica,sans-serif;color:#202124;max-width:820px;margin:24px auto;padding:0 16px;word-break:break-word}</style>` +
      `</head><body>${brandHeader}${body}${brandFooter}</body></html>`
    );
  }

  // ── Chế độ IN (→ PDF) ──
  const HEAD_H = hasBrand ? 58 : 0;
  const FOOT_H = hasBrand ? 40 : 0;
  const css =
    '<style>' +
    `body{font-family:Inter,Arial,Helvetica,sans-serif;color:#202124;margin:0;word-break:break-word}` +
    // margin 0 → trình duyệt không còn chỗ vẽ header/footer mặc định (ngày, title, số trang).
    `@page{margin:0}` +
    `.pr-tbl{width:100%;border-collapse:collapse}` +
    `.pr-main{padding:6mm 14mm 0}` +
    `.pr-hspace{height:${HEAD_H ? HEAD_H + 6 : 16}px}` +
    `.pr-fspace{height:${FOOT_H ? FOOT_H + 6 : 16}px}` +
    (hasBrand
      ? `.pr-head{position:fixed;top:0;left:0;right:0;height:${HEAD_H}px;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 14mm;border-bottom:1px solid ${BORDER};background:#fff}` +
        `.pr-foot{position:fixed;bottom:0;left:0;right:0;height:${FOOT_H}px;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:6px 14mm;border-top:1px solid ${BORDER};background:#fff;color:${SUBDUED};font-size:11px}`
      : '') +
    `a{color:${T.accent}}` +
    '</style>';
  const fixedBars = hasBrand
    ? `<div class="pr-head">${logoImg}${sourceSpan}</div>` +
      `<div class="pr-foot"><span>${esc(brand?.sourceText ?? '')}</span>${sourceLink}</div>`
    : '';
  return (
    docHead +
    css +
    `</head><body>${fixedBars}` +
    `<table class="pr-tbl"><thead><tr><td><div class="pr-hspace"></div></td></tr></thead>` +
    `<tbody><tr><td class="pr-main">${body}</td></tr></tbody>` +
    `<tfoot><tr><td><div class="pr-fspace"></div></td></tr></tfoot></table>` +
    `</body></html>`
  );
}

// Tên file xuất: social-report-<slug tên báo cáo>.<ext>
export function socialReportFileName(r: SocialReportRecord, ext: 'html' | 'doc' | 'pdf'): string {
  const base =
    (r.title || r.id)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'social-report';
  return `social-report-${base}.${ext}`;
}

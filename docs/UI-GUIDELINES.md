# UI Guidelines — SEO-GEO Platform

Chuẩn giao diện cho toàn app. Đọc cùng [CLAUDE.md](../CLAUDE.md) mục 2. Mockup tham
chiếu: [mockups/index.html](../mockups/index.html).

## 1. Nền tảng
- **Design system:** Shopify **Polaris** (`@shopify/polaris`). Ưu tiên component có sẵn.
- **Font:** **Inter** (qua `next/font/google`). Không dùng font khác.
- **Tông màu:** trung tính kiểu Shopify admin — nền xám `#f1f1f1`, surface trắng, chữ
  `#303030`/`#1a1a1a`, nút chính **gần-đen** `#1a1a1a`, accent xanh `#005bd3` cho focus/
  liên kết. Trạng thái: success `#29845a`, warning `#b98900`, critical `#c93b3b`.
- Bo góc card `12px`, control `8px`. Bóng nhẹ (1px border + shadow mảnh).

## 2. Iconography — BẮT BUỘC dùng SVG
> Quy ước cứng: **mọi icon là vector SVG**, không bao giờ dùng ký tự/emoji/ký hiệu
> Unicode (✓ ✕ ★ → + ▲ ℹ ⚠ ●…) hay glyph font để làm icon.

- Dùng một **bộ icon nhất quán** (khuyến nghị **Polaris Icons** `@shopify/polaris-icons`,
  hoặc Lucide nếu thiếu). Không trộn nhiều bộ.
- Icon là **file `.svg`** (hoặc React component sinh từ `.svg`), đặt ở
  `src/components/icons/` (hoặc import trực tiếp từ bộ icon). Trong mockup tĩnh: dùng
  **SVG sprite** (`<symbol>` + `<use href="#i-...">`).
- SVG **stroke-based**, `viewBox="0 0 24 24"`, `stroke="currentColor"`, `fill="none"`
  → icon tự đổi màu theo text. Cỡ chuẩn 18px (nhỏ 13px, rất nhỏ 11px) qua class, không
  set cứng trong path.
- **Accessibility:** icon trang trí đặt `aria-hidden="true"`; icon mang nghĩa (nút chỉ
  có icon) phải có `aria-label`/`title`.
- **Không** dùng emoji làm icon hành động. *Ngoại lệ duy nhất:* **cờ ngôn ngữ** có thể
  tạm hiển thị bằng emoji trong mockup, nhưng **production dùng asset cờ SVG** (vd
  `flag-icons`) để hiển thị nhất quán trên mọi OS.

Ví dụ (sprite tĩnh trong mockup):
```html
<svg class="i" aria-hidden="true"><use href="#i-search"/></svg>   <!-- KHÔNG dùng ký tự glyph làm icon -->
```
Ví dụ (React + Polaris Icons):
```tsx
import { SearchIcon } from '@shopify/polaris-icons'
<Icon source={SearchIcon} tone="subdued" />
```

## 3. Layout
- **Top bar** (đen) cố định: logo, ô tìm kiếm trung tâm, chuyển ngôn ngữ, trợ giúp,
  avatar.
- **Sidebar** trái (xám) nhóm theo: Tổng quan · Nội dung · Xuất bản · Phân tích · Hệ
  thống. Item active nền đậm hơn + chữ đậm.
- **Main** tối đa ~1080px, canh giữa. Mỗi trang có `page-head` (breadcrumb + h1 + sub +
  actions bên phải).

## 4. Component & trạng thái
- **Card**: header (title + action phải) + body. Bảng đặt trong card body `tight`.
- **Badge** trạng thái có chấm tròn màu: xanh=đã đăng/đạt, xanh dương=nháp/đang xử lý,
  vàng=cảnh báo/lệch, đỏ=lỗi/thiếu, xám=trung tính.
- **Score ring** cho điểm SEO/GEO; **checklist** với tick tròn (check/x/cảnh báo bằng
  **icon SVG trắng**, không phải ký tự).
- **Diff** đỏ/xanh khi sửa bài cũ. **Note** banner: info (xanh dương) / warning (vàng),
  luôn kèm icon SVG.
- Tác vụ thay đổi site thật → nút chính + bước xác nhận rõ ràng.

## 5. Đa ngôn ngữ trong UI
- Mọi chuỗi qua i18n (`next-intl`), không hardcode. Bố cục co giãn theo độ dài chữ
  (tiếng Đức dài, CJK ngắn). Hỗ trợ RTL khi thêm ngôn ngữ RTL: `dir="rtl"` + logical
  CSS properties. Số/ngày/tiền format theo locale bằng `Intl`.

## 6. Checklist review giao diện (trước khi merge)
- [ ] Không còn ký tự/emoji dùng làm icon — tất cả là SVG.
- [ ] Dùng Polaris component thay vì tự chế khi có thể.
- [ ] Font Inter, không hardcode chuỗi (đã i18n hóa).
- [ ] Icon có `aria-label`/`aria-hidden` đúng.
- [ ] Tương phản màu đạt WCAG AA; focus state rõ ràng.

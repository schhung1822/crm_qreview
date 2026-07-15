import { describe, expect, it } from 'vitest';
import { auditLanding } from '@/lib/landing/audit';

const state = (r: ReturnType<typeof auditLanding>, id: string) => r.checks.find((c) => c.id === id)?.state;

// Landing "tốt": đủ head + schema (Organization/Product/Breadcrumb/WebPage), landmark ngữ nghĩa,
// H2, danh sách, ảnh tối ưu, link nguồn ngoài, tác giả + ngày, nội dung đủ dài.
const GOOD = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="index, follow" />
  <title>Phần mềm quản lý bán hàng cho SME</title>
  <meta name="description" content="Phần mềm quản lý bán hàng giúp doanh nghiệp nhỏ tăng 30% doanh thu, tiết kiệm 10 giờ mỗi tuần và quản lý kho theo thời gian thực, dễ dùng." />
  <link rel="canonical" href="https://example.com/landing" />
  <link rel="icon" href="/favicon.ico" />
  <meta property="og:title" content="Phần mềm quản lý bán hàng cho SME" />
  <meta property="og:description" content="Tăng 30% doanh thu" />
  <meta property="og:image" content="https://example.com/og.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Organization","name":"Acme","url":"https://example.com","sameAs":["https://facebook.com/acme"]}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Product","name":"Acme POS","offers":{"@type":"Offer","price":"199","priceCurrency":"USD"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"128"}}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://example.com"}]}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"WebPage","author":{"@type":"Person","name":"Nguyen Van A"},"datePublished":"2024-01-01","dateModified":"2024-06-01"}
  </script>
</head>
<body>
  <header><nav>Menu</nav></header>
  <main>
    <h1>Tăng 30% doanh thu với phần mềm quản lý bán hàng</h1>
    <p>Giải pháp cho hơn 5000 cửa hàng trên toàn quốc. Phần mềm giúp bạn quản lý kho, đơn hàng, khách hàng
    và báo cáo doanh thu theo thời gian thực. Tiết kiệm 10 giờ mỗi tuần và giảm 25% sai sót kho nhờ tự động hóa
    quy trình nhập xuất. Giao diện đơn giản, nhân viên mới chỉ mất 1 ngày để làm quen. Hỗ trợ nhiều chi nhánh,
    đồng bộ dữ liệu tức thì, và tích hợp với các sàn thương mại điện tử phổ biến. Dùng thử miễn phí 14 ngày,
    không cần thẻ tín dụng, hủy bất cứ lúc nào. Đội ngũ hỗ trợ 24/7 luôn sẵn sàng đồng hành cùng doanh nghiệp bạn
    trên hành trình chuyển đổi số và tăng trưởng bền vững mỗi ngày.</p>
    <h2>Tính năng chính</h2>
    <ul><li>Quản lý kho</li><li>Báo cáo doanh thu</li><li>Đa chi nhánh</li></ul>
    <h2>Bảng giá</h2>
    <p>Chỉ từ 199.000đ mỗi tháng.</p>
    <img src="/hero.webp" alt="Giao diện phần mềm quản lý bán hàng" width="1200" height="600" loading="lazy" />
    <a href="/dang-ky" class="btn-cta">Đăng ký dùng thử</a>
    <a href="https://vi.wikipedia.org/wiki/SME">Nguồn tham khảo</a>
    <a href="mailto:sales@example.com">Liên hệ</a>
    <p>Tác giả: Nguyễn Văn A</p>
  </main>
  <footer>© 2024 Acme</footer>
</body>
</html>`;

// Landing "kém": SPA rỗng, thiếu head, không CTA/OG/JSON-LD, nạp http:// (mixed content).
const BAD = `<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="http://cdn.example.com/style.css" />
</head>
<body>
  <div id="root"></div>
  <script src="http://cdn.example.com/app.js"></script>
</body>
</html>`;

describe('auditLanding — landing tốt', () => {
  const r = auditLanding({ html: GOOD, fileName: 'good.html' });
  it('các mục nền tảng + mở rộng đều pass', () => {
    for (const id of [
      'lp_title', 'lp_meta', 'lp_h1', 'lp_heading_order', 'lp_viewport', 'lp_lang', 'lp_canonical',
      'lp_charset', 'lp_favicon', 'lp_img_alt', 'lp_img_opt', 'lp_semantic', 'lp_noindex', 'lp_mixed',
      'lp_og', 'lp_cta', 'lp_contact', 'lp_breadcrumb', 'lp_schema_rich', 'lp_review', 'lp_lists',
      'lp_jsonld', 'lp_jsonld_valid', 'lp_entity', 'lp_author', 'lp_freshness', 'lp_citations', 'lp_facts',
    ]) {
      expect(state(r, id), id).toBe('pass');
    }
  });
  it('không có video → lp_video là info (không tính điểm)', () => {
    expect(state(r, 'lp_video')).toBe('info');
  });
  it('điểm cao cả 3 trụ', () => {
    expect(r.scores.seo).toBeGreaterThanOrEqual(90);
    expect(r.scores.aeo).toBeGreaterThanOrEqual(90);
    expect(r.scores.geo).toBeGreaterThanOrEqual(90);
  });
});

describe('auditLanding — landing kém', () => {
  const r = auditLanding({ html: BAD });
  it('bắt đúng các lỗi chính', () => {
    expect(state(r, 'lp_title')).toBe('fail');
    expect(state(r, 'lp_meta')).toBe('fail');
    expect(state(r, 'lp_h1')).toBe('fail');
    expect(state(r, 'lp_viewport')).toBe('fail');
    expect(state(r, 'lp_charset')).toBe('fail');
    expect(state(r, 'lp_semantic')).toBe('fail');
    expect(state(r, 'lp_jsonld')).toBe('fail');
    expect(state(r, 'lp_norender')).toBe('fail'); // SPA rỗng, phụ thuộc JS
    expect(state(r, 'lp_mixed')).toBe('fail'); // nạp http://
    expect(state(r, 'lp_cta')).toBe('warn');
  });
  it('có sinh snippet vá cho lỗi', () => {
    expect(r.fixes.some((f) => f.id === 'head_basic')).toBe(true);
    expect(r.fixes.some((f) => f.id === 'jsonld_org')).toBe(true);
  });
  it('điểm thấp', () => {
    expect(r.scores.seo).toBeLessThan(50);
  });
});

describe('auditLanding — noindex bị bắt', () => {
  it('meta robots noindex → lp_noindex = fail + snippet robots_index', () => {
    const r = auditLanding({
      html: '<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Trang bí mật đây</title></head><body><h1>Hi</h1></body></html>',
    });
    expect(state(r, 'lp_noindex')).toBe('fail');
    expect(r.fixes.some((f) => f.id === 'robots_index')).toBe(true);
  });
});

describe('auditLanding — mixed-content chỉ tính subresource, không tính <a href>', () => {
  it('link điều hướng <a href="http://"> KHÔNG bị coi là mixed content', () => {
    const r = auditLanding({
      html: '<html lang="en"><head><meta charset="utf-8"><title>Trang có link ngoài http</title></head><body><h1>Hi</h1><a href="http://external-partner.com">Đối tác</a></body></html>',
    });
    expect(state(r, 'lp_mixed')).toBe('pass');
  });
  it('tài nguyên <script src="http://"> VẪN bị bắt là mixed content', () => {
    const r = auditLanding({
      html: '<html lang="en"><head><meta charset="utf-8"><title>Trang nạp script http</title></head><body><h1>Hi</h1><script src="http://cdn.example.com/a.js"></script></body></html>',
    });
    expect(state(r, 'lp_mixed')).toBe('fail');
  });
});

describe('auditLanding — khối JSON-LD RỖNG không bị coi là lỗi', () => {
  it('khối ld+json trống + 1 khối hợp lệ → lp_jsonld_valid = pass', () => {
    const r = auditLanding({
      html: '<html lang="en"><head><meta charset="utf-8"><title>Trang có khối schema trống</title><script type="application/ld+json"></script><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script></head><body><h1>Hi</h1></body></html>',
    });
    expect(state(r, 'lp_jsonld_valid')).toBe('pass');
  });
});

describe('auditLanding — JSON-LD lỗi cú pháp', () => {
  it('khối ld+json hỏng → lp_jsonld_valid = fail', () => {
    const r = auditLanding({
      html: '<html lang="en"><head><meta charset="utf-8"><title>Trang có schema lỗi</title><script type="application/ld+json">{ "@type": "Product", bad json }</script></head><body><h1>Hi</h1></body></html>',
    });
    expect(state(r, 'lp_jsonld_valid')).toBe('fail');
  });
});

describe('auditLanding — ảnh không có → info (không trừ điểm)', () => {
  it('lp_img_alt = info khi không có ảnh', () => {
    const r = auditLanding({ html: '<html lang="en"><head><meta charset="utf-8"><title>Test page title here</title></head><body><h1>Hi</h1></body></html>' });
    expect(state(r, 'lp_img_alt')).toBe('info');
  });
});

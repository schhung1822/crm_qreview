// Trang CÔNG KHAI hiển thị Báo cáo Social qua link chia sẻ — như một bài blog CHỈ-XEM.
// Nằm NGOÀI [locale] nên không bị redirect login, không bọc AppFrame. Resolve token → biz/report,
// rồi áp GATING theo GÓI của CHỦ báo cáo (chia sẻ KHÔNG lách paywall). noindex để không lộ token.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { entitlementsForBiz } from '@/lib/billing/entitlement';
import { runWithBiz } from '@/lib/biz/context';
import { locales } from '@/i18n/config';
import { redactFanpageAnalysis, socialGate } from '@/lib/social/gating';
import {
  buildSocialReportBody,
  type SocialReportLabels,
  type SocialReportTheme,
} from '@/lib/social/report-html';
import type { SocialPlatform, SocialReportRecord } from '@/lib/social/types';
import { getBranding } from '@/lib/store/branding';
import { getSocialReport } from '@/lib/store/social-reports';
import { checkShareAccess, resolveShare, shareAccessCookieName } from '@/lib/store/social-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN_RE = /^[a-f0-9]{64}$/;

// Nhãn nền tảng cho tiêu đề "Báo cáo ... trên <nền tảng>".
const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  fbgroup: 'Facebook Group',
  fbprofile: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
  shopee: 'Shopee',
  shopeeshop: 'Shopee',
  tiktokshop: 'TikTok Shop',
  tiktokshopshop: 'TikTok Shop',
  lazada: 'Lazada',
  lazadashop: 'Lazada',
  overall: 'mạng xã hội',
  ecom: 'sàn thương mại điện tử',
};

// Chuỗi tự chứa (trang ngoài [locale], không có next-intl provider). Theo report.locale.
const UI: Record<string, { viewOnly: string; lock: string }> = {
  vi: { viewOnly: 'Chỉ xem', lock: 'Một số nội dung phân tích sâu được ẩn.' },
  en: { viewOnly: 'View only', lock: 'Some in-depth analysis is hidden.' },
  zh: { viewOnly: '仅查看', lock: '部分深入分析内容已隐藏。' },
  ja: { viewOnly: '閲覧のみ', lock: '一部の詳細分析は非表示です。' },
  ko: { viewOnly: '보기 전용', lock: '일부 심층 분석 내용은 숨겨졌습니다.' },
  fr: { viewOnly: 'Lecture seule', lock: 'Certaines analyses approfondies sont masquées.' },
  de: { viewOnly: 'Nur ansehen', lock: 'Einige tiefergehende Analysen sind ausgeblendet.' },
  id: { viewOnly: 'Hanya lihat', lock: 'Sebagian analisis mendalam disembunyikan.' },
  hi: { viewOnly: 'केवल देखें', lock: 'कुछ गहन विश्लेषण छिपाया गया है।' },
  th: { viewOnly: 'ดูอย่างเดียว', lock: 'เนื้อหาการวิเคราะห์เชิงลึกบางส่วนถูกซ่อนไว้' },
};

async function loadReport(
  token: string,
): Promise<{ report: SocialReportRecord; viewLocked: boolean; locked: boolean } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const s = await resolveShare(token);
  if (!s) return null;
  // Đọc báo cáo trong ngữ cảnh biz của CHỦ (không có cookie sg_biz ở trang công khai).
  const report = await runWithBiz({ userId: s.ownerId, bizId: s.bizId }, () => getSocialReport(s.reportId));
  if (!report) return null;
  // Chỉ hiển thị khi đã có nội dung; không lộ trạng thái running/error ra công khai.
  if (report.status !== 'done' && report.status !== 'collected') return null;
  // GATING theo gói của CHỦ: FREE + fanpage → cắt phần phân tích sâu TRƯỚC khi render.
  const { planId } = await entitlementsForBiz(s.bizId);
  const gate = socialGate(planId, report);
  const out = gate.viewLocked ? redactFanpageAnalysis(report) : report;
  return { report: out, viewLocked: gate.viewLocked, locked: s.locked };
}

// Mô tả cho preview link: ưu tiên câu tóm tắt AI của báo cáo; nếu chưa có thì mô tả chung.
function reportDescription(r: SocialReportRecord): string {
  const a = r.analysis ?? {};
  const raw =
    a.summary?.summary ||
    a.groupSummary?.summary ||
    a.profileSummary?.summary ||
    a.shopeeSummary?.summary ||
    a.shopSummary?.summary ||
    a.ecomSummary?.summary ||
    '';
  const text = raw.trim();
  if (text) return text.length > 180 ? `${text.slice(0, 177)}…` : text;
  return `Báo cáo phân tích ${PLATFORM_LABEL[r.platform] ?? 'nền tảng'}: nội dung, chiến thuật, điểm mạnh/yếu và gợi ý.`;
}

// Ảnh đại diện link: ưu tiên avatar kênh/ảnh sản phẩm; fallback logo thương hiệu. Phải là URL tuyệt đối.
function reportImage(r: SocialReportRecord, fallback: string): string {
  const ch = r.channels?.[0];
  const img =
    ch?.page?.profilePicture ||
    ch?.product?.images?.[0] ||
    ch?.shopProducts?.[0]?.images?.[0];
  return img || fallback;
}

// Metadata động → khi dán link chia sẻ vào Facebook/Zalo/Slack sẽ hiện Tiêu đề + Mô tả + Ảnh.
// GIỮ noindex (token bí mật, không cho search engine index) — trình đọc OG của MXH vẫn đọc được thẻ.
export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const noindex = { index: false, follow: false } as const;
  const data = await loadReport(params.token);
  if (!data) return { title: 'Báo cáo', robots: noindex };
  const { report, locked } = data;
  const b = await getBranding();
  const platform = PLATFORM_LABEL[report.platform] ?? 'nền tảng';
  const title = `Báo cáo ${report.title} trên ${platform}`;
  // Khóa → KHÔNG lộ nội dung tóm tắt ra thẻ mô tả; chỉ báo là cần mật khẩu.
  const description = locked
    ? 'Báo cáo được bảo vệ bằng mật khẩu — cần mật khẩu để xem.'
    : reportDescription(report);
  // Ưu tiên: ảnh bìa AI người dùng tạo cho báo cáo → avatar kênh/ảnh sản phẩm → ảnh bìa nền tảng → logo.
  const image = report.shareCover || reportImage(report, b.ogImage || b.logoDuongBan);
  const images = image ? [image] : undefined;
  return {
    title,
    description,
    robots: noindex,
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: b.sourceText || undefined,
      images,
    },
    twitter: { card: 'summary_large_image', title, description, images },
  };
}

// Nhãn i18n cho report-html: lấy từ namespace socialReport.view của đúng ngôn ngữ báo cáo.
async function loadLabels(locale: string): Promise<SocialReportLabels> {
  const safe = (locales as readonly string[]).includes(locale) ? locale : 'vi';
  try {
    const m = (await import(`@/messages/${safe}.json`)) as { default?: unknown };
    const root = (m.default ?? m) as { socialReport?: { view?: Record<string, string> } };
    return (root.socialReport?.view ?? {}) as SocialReportLabels;
  } catch {
    return {} as SocialReportLabels;
  }
}

const SHARE_CSS = `
.sh{font-family:var(--font-inter),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f6f9;min-height:100vh;padding:24px 16px 64px;color:#1a1f2b;-webkit-font-smoothing:antialiased;}
.sh-wrap{max-width:880px;margin:0 auto;background:#fff;border:1px solid #e3e7ee;border-radius:14px;padding:28px 32px 40px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
.sh-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;}
.sh-logo{height:26px;width:auto;}
.sh-badge{font-size:12px;font-weight:600;color:#0061ff;background:#e7effe;padding:4px 10px;border-radius:20px;white-space:nowrap;}
.sh-title{font-size:26px;line-height:1.25;margin:0 0 10px;font-weight:700;letter-spacing:-.01em;text-wrap:balance;}
.sh-lock{font-size:13px;color:#8a6d00;background:#fff7e0;border:1px solid #f0e0a8;padding:8px 12px;border-radius:8px;margin:0 0 16px;}
.sh-body{margin-top:8px;}
.sh-body img{max-width:100%;height:auto;}
.sh-foot{margin-top:32px;padding-top:16px;border-top:1px solid #eef1f5;font-size:13px;}
.sh-foot a{color:#5b6675;text-decoration:none;}
.sh-foot a:hover{text-decoration:underline;}
.sh-gate-desc{color:#5b6675;font-size:14px;margin:0 0 18px;}
.sh-gate-err{color:#b42318;background:#fef3f2;border:1px solid #fecdca;padding:8px 12px;border-radius:8px;font-size:13px;margin:0 0 14px;}
.sh-gate-form{display:flex;gap:10px;flex-wrap:wrap;}
.sh-gate-input{flex:1 1 200px;min-width:0;padding:11px 14px;border:1px solid #d0d5dd;border-radius:8px;font-size:15px;}
.sh-gate-input:focus{outline:none;border-color:#0061ff;box-shadow:0 0 0 3px rgba(0,97,255,.12);}
.sh-gate-btn{padding:11px 20px;background:#0061ff;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;white-space:nowrap;}
.sh-gate-btn:hover{background:#0052d6;}
/* Trang nhập mật khẩu: căn GIỮA màn hình (cả dọc + ngang) cho cân đối; hộp nhỏ gọn hơn. */
.sh-center{display:flex;align-items:center;justify-content:center;padding:24px 16px;}
.sh-center .sh-wrap{max-width:440px;width:100%;margin:0;}
@media (max-width:640px){.sh-wrap{padding:20px 16px 32px;}.sh-title{font-size:22px;}}
`;

export default async function SharePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { e?: string };
}) {
  const token = params.token;
  const data = await loadReport(token);
  if (!data) notFound();
  const { report, viewLocked, locked } = data;
  const b = await getBranding();

  // ── KHÓA bằng mật khẩu: chưa mở khóa (cookie hợp lệ) → hiện form nhập, KHÔNG dựng nội dung ──
  if (locked && !checkShareAccess(token, cookies().get(shareAccessCookieName(token))?.value)) {
    const err = searchParams?.e === '1';
    const rate = searchParams?.e === 'rate';
    return (
      <main className="sh sh-center">
        <style dangerouslySetInnerHTML={{ __html: SHARE_CSS }} />
        <div className="sh-wrap">
          <header className="sh-head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sh-logo" src={b.logoDuongBan} alt={b.sourceText} />
            <span className="sh-badge">Bảo mật</span>
          </header>
          <h1 className="sh-title">Báo cáo được bảo vệ</h1>
          <p className="sh-gate-desc">Nhập mật khẩu được cung cấp để xem báo cáo này.</p>
          {err ? <p className="sh-gate-err">Mật khẩu không đúng. Vui lòng thử lại.</p> : null}
          {rate ? <p className="sh-gate-err">Thử quá nhiều lần. Đợi một phút rồi thử lại.</p> : null}
          <form method="POST" action={`/api/share/${token}/unlock`} className="sh-gate-form">
            <input
              type="password"
              name="password"
              placeholder="Mật khẩu"
              autoComplete="off"
              className="sh-gate-input"
              required
            />
            <button type="submit" className="sh-gate-btn">
              Xem báo cáo
            </button>
          </form>
          <footer className="sh-foot">
            <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer">
              {b.sourceText}
            </a>
          </footer>
        </div>
      </main>
    );
  }

  const labels = await loadLabels(report.locale);
  const theme: SocialReportTheme = {
    accent: b.colorSocialAccent || undefined,
    strength: b.colorSocialStrength || undefined,
    weakness: b.colorSocialWeakness || undefined,
  };
  // collapsible=true → mỗi mục là khối THU GỌN (bấm để mở). Tránh báo cáo trải dài khó đọc;
  // người xem tự chọn mục muốn xem. Dùng <details> HTML gốc → hoạt động không cần JS.
  const body = buildSocialReportBody(report, labels, { collapsible: true, theme });
  const ui = UI[(locales as readonly string[]).includes(report.locale) ? report.locale : 'vi'] ?? UI.vi;

  return (
    <main className="sh">
      <style dangerouslySetInnerHTML={{ __html: SHARE_CSS }} />
      <div className="sh-wrap">
        <header className="sh-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sh-logo" src={b.logoDuongBan} alt={b.sourceText} />
          <span className="sh-badge">{ui.viewOnly}</span>
        </header>
        <h1 className="sh-title">{report.title}</h1>
        {viewLocked ? <p className="sh-lock">{ui.lock}</p> : null}
        <article className="sh-body" dangerouslySetInnerHTML={{ __html: body }} />
        <footer className="sh-foot">
          <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer">{b.sourceText}</a>
        </footer>
      </div>
    </main>
  );
}

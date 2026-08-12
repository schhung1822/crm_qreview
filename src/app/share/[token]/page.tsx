// Trang CÔNG KHAI hiển thị Báo cáo Social qua link chia sẻ — như một bài blog CHỈ-XEM.
// Nằm NGOÀI [locale] nên không bị redirect login, không bọc AppFrame. Resolve token → biz/report,
// rồi áp GATING theo GÓI của CHỦ báo cáo (chia sẻ KHÔNG lách paywall). noindex để không lộ token.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { runWithBiz } from '@/lib/biz/context';
import { locales } from '@/i18n/config';
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
  taobao: 'Taobao',
  taobaoshop: 'Taobao',
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

// Chuỗi màn NHẬP MẬT KHẨU (self-contained) — cũng theo report.locale như phần nội dung.
interface GateStr {
  badge: string; // nhãn tag
  protTitle: string; // tiêu đề bảng thương hiệu
  protNote: string; // dòng trấn an
  action: string; // tiêu đề biểu mẫu + chữ trên nút
  prompt: string; // hướng dẫn nhập
  pwLabel: string; // nhãn ô mật khẩu
  pwPlaceholder: string; // placeholder ô mật khẩu
  errWrong: string; // sai mật khẩu
  errRate: string; // thử quá nhiều lần
  metaLocked: string; // mô tả OG khi khóa
}
const GATE: Record<string, GateStr> = {
  vi: {
    badge: 'Bảo mật',
    protTitle: 'Nội dung được bảo vệ',
    protNote: 'Báo cáo này chỉ dành cho người được cấp mật khẩu truy cập.',
    action: 'Xem báo cáo',
    prompt: 'Nhập mật khẩu được cung cấp để tiếp tục.',
    pwLabel: 'Mật khẩu',
    pwPlaceholder: 'Nhập mật khẩu',
    errWrong: 'Mật khẩu không đúng. Vui lòng thử lại.',
    errRate: 'Thử quá nhiều lần. Đợi một phút rồi thử lại.',
    metaLocked: 'Báo cáo được bảo vệ bằng mật khẩu — cần mật khẩu để xem.',
  },
  en: {
    badge: 'Protected',
    protTitle: 'Content is protected',
    protNote: 'This report is only available to people with the access password.',
    action: 'View report',
    prompt: 'Enter the password you were given to continue.',
    pwLabel: 'Password',
    pwPlaceholder: 'Enter password',
    errWrong: 'Incorrect password. Please try again.',
    errRate: 'Too many attempts. Wait a minute and try again.',
    metaLocked: 'This report is password-protected — a password is required to view it.',
  },
  zh: {
    badge: '受保护',
    protTitle: '内容受保护',
    protNote: '此报告仅向持有访问密码的人开放。',
    action: '查看报告',
    prompt: '请输入您获得的密码以继续。',
    pwLabel: '密码',
    pwPlaceholder: '输入密码',
    errWrong: '密码不正确，请重试。',
    errRate: '尝试次数过多，请稍等一分钟后重试。',
    metaLocked: '此报告受密码保护 — 需要密码才能查看。',
  },
  ja: {
    badge: '保護中',
    protTitle: 'コンテンツは保護されています',
    protNote: 'このレポートはアクセスパスワードをお持ちの方のみ閲覧できます。',
    action: 'レポートを見る',
    prompt: '続行するには、提供されたパスワードを入力してください。',
    pwLabel: 'パスワード',
    pwPlaceholder: 'パスワードを入力',
    errWrong: 'パスワードが正しくありません。もう一度お試しください。',
    errRate: '試行回数が多すぎます。1分ほど待ってから再度お試しください。',
    metaLocked: 'このレポートはパスワードで保護されています — 閲覧にはパスワードが必要です。',
  },
  ko: {
    badge: '보호됨',
    protTitle: '콘텐츠가 보호되어 있습니다',
    protNote: '이 보고서는 접근 비밀번호를 가진 사람만 볼 수 있습니다.',
    action: '보고서 보기',
    prompt: '계속하려면 제공받은 비밀번호를 입력하세요.',
    pwLabel: '비밀번호',
    pwPlaceholder: '비밀번호 입력',
    errWrong: '비밀번호가 올바르지 않습니다. 다시 시도하세요.',
    errRate: '시도 횟수가 너무 많습니다. 잠시 후 다시 시도하세요.',
    metaLocked: '이 보고서는 비밀번호로 보호되어 있습니다 — 보려면 비밀번호가 필요합니다.',
  },
  fr: {
    badge: 'Protégé',
    protTitle: 'Contenu protégé',
    protNote: "Ce rapport n'est accessible qu'aux personnes disposant du mot de passe.",
    action: 'Voir le rapport',
    prompt: 'Saisissez le mot de passe qui vous a été fourni pour continuer.',
    pwLabel: 'Mot de passe',
    pwPlaceholder: 'Saisir le mot de passe',
    errWrong: 'Mot de passe incorrect. Veuillez réessayer.',
    errRate: 'Trop de tentatives. Attendez une minute puis réessayez.',
    metaLocked:
      'Ce rapport est protégé par mot de passe — un mot de passe est requis pour le consulter.',
  },
  de: {
    badge: 'Geschützt',
    protTitle: 'Inhalt ist geschützt',
    protNote: 'Dieser Bericht ist nur für Personen mit dem Zugangspasswort verfügbar.',
    action: 'Bericht ansehen',
    prompt: 'Geben Sie das erhaltene Passwort ein, um fortzufahren.',
    pwLabel: 'Passwort',
    pwPlaceholder: 'Passwort eingeben',
    errWrong: 'Falsches Passwort. Bitte erneut versuchen.',
    errRate: 'Zu viele Versuche. Warten Sie eine Minute und versuchen Sie es erneut.',
    metaLocked:
      'Dieser Bericht ist passwortgeschützt — zum Ansehen ist ein Passwort erforderlich.',
  },
  id: {
    badge: 'Terlindungi',
    protTitle: 'Konten dilindungi',
    protNote: 'Laporan ini hanya tersedia bagi orang yang memiliki kata sandi akses.',
    action: 'Lihat laporan',
    prompt: 'Masukkan kata sandi yang diberikan untuk melanjutkan.',
    pwLabel: 'Kata sandi',
    pwPlaceholder: 'Masukkan kata sandi',
    errWrong: 'Kata sandi salah. Silakan coba lagi.',
    errRate: 'Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi.',
    metaLocked: 'Laporan ini dilindungi kata sandi — kata sandi diperlukan untuk melihatnya.',
  },
  hi: {
    badge: 'सुरक्षित',
    protTitle: 'सामग्री सुरक्षित है',
    protNote: 'यह रिपोर्ट केवल उन लोगों के लिए उपलब्ध है जिनके पास एक्सेस पासवर्ड है।',
    action: 'रिपोर्ट देखें',
    prompt: 'जारी रखने के लिए आपको दिया गया पासवर्ड दर्ज करें।',
    pwLabel: 'पासवर्ड',
    pwPlaceholder: 'पासवर्ड दर्ज करें',
    errWrong: 'गलत पासवर्ड। कृपया पुनः प्रयास करें।',
    errRate: 'बहुत अधिक प्रयास। एक मिनट रुकें और फिर से प्रयास करें।',
    metaLocked: 'यह रिपोर्ट पासवर्ड से सुरक्षित है — इसे देखने के लिए पासवर्ड आवश्यक है।',
  },
  th: {
    badge: 'ได้รับการป้องกัน',
    protTitle: 'เนื้อหาได้รับการป้องกัน',
    protNote: 'รายงานนี้เปิดให้เฉพาะผู้ที่มีรหัสผ่านเข้าถึงเท่านั้น',
    action: 'ดูรายงาน',
    prompt: 'กรอกรหัสผ่านที่ได้รับเพื่อดำเนินการต่อ',
    pwLabel: 'รหัสผ่าน',
    pwPlaceholder: 'กรอกรหัสผ่าน',
    errWrong: 'รหัสผ่านไม่ถูกต้อง โปรดลองอีกครั้ง',
    errRate: 'พยายามมากเกินไป โปรดรอสักครู่แล้วลองใหม่',
    metaLocked: 'รายงานนี้ได้รับการป้องกันด้วยรหัสผ่าน — ต้องใช้รหัสผ่านเพื่อดู',
  },
};

// Chọn locale an toàn (fallback 'vi') cho các map tự chứa ở trên.
function pickLocale(loc: string): string {
  return (locales as readonly string[]).includes(loc) ? loc : 'vi';
}

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
  return { report, viewLocked: false, locked: s.locked };
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
export async function generateMetadata(
  props: {
    params: Promise<{ token: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const noindex = { index: false, follow: false } as const;
  const data = await loadReport(params.token);
  if (!data) return { title: 'Báo cáo', robots: noindex };
  const { report, locked } = data;
  const b = await getBranding();
  const platform = PLATFORM_LABEL[report.platform] ?? 'nền tảng';
  const title = `Báo cáo ${report.title} trên ${platform}`;
  // Khóa → KHÔNG lộ nội dung tóm tắt ra thẻ mô tả; chỉ báo là cần mật khẩu (theo ngôn ngữ báo cáo).
  const description = locked
    ? GATE[pickLocale(report.locale)].metaLocked
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

// Trộn màu HEX về đen theo tỉ lệ (trạng thái :hover của nút). Trả nguyên nếu HEX không hợp lệ.
function shade(hex: string, ratio = 0.85): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const p = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * ratio));
  return '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// rgba nhạt từ HEX — nền của nhãn badge (giữ chữ đậm màu, nền tint nhẹ).
function tint(hex: string, alpha = 0.12): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(0,97,255,${alpha})`;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

// CSS trang chia sẻ. Màu nút & nhãn lấy từ Thông tin hệ thống (rỗng = xanh #0061ff mặc định).
// Khối .sh-* : trang BÁO CÁO (chỉ xem). Khối .sg-* : màn NHẬP MẬT KHẨU (thẻ auth căn giữa).
function shareCss(btn: string, badge: string): string {
  return `
.sh{font-family:var(--font-inter),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f6f9;min-height:100vh;padding:24px 16px 64px;color:#1a1f2b;-webkit-font-smoothing:antialiased;}
.sh-wrap{max-width:880px;margin:0 auto;background:#fff;border:1px solid #e3e7ee;border-radius:14px;padding:28px 32px 40px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
.sh-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;}
.sh-logo{height:26px;width:auto;}
.sh-badge{font-size:12px;font-weight:600;color:${badge};background:${tint(badge)};padding:4px 10px;border-radius:20px;white-space:nowrap;}
.sh-title{font-size:26px;line-height:1.25;margin:0 0 10px;font-weight:700;letter-spacing:-.01em;text-wrap:balance;}
.sh-lock{font-size:13px;color:#8a6d00;background:#fff7e0;border:1px solid #f0e0a8;padding:8px 12px;border-radius:8px;margin:0 0 16px;}
.sh-body{margin-top:8px;}
.sh-body img{max-width:100%;height:auto;}
.sh-foot{margin-top:32px;padding-top:16px;border-top:1px solid #eef1f5;font-size:13px;}
.sh-foot a{color:#5b6675;text-decoration:none;}
.sh-foot a:hover{text-decoration:underline;}

/* ── Màn NHẬP MẬT KHẨU: split panel (bảng thương hiệu trái + biểu mẫu phải) ── */
.sg{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;
  background:linear-gradient(180deg,#eef1f6 0%,#e7ebf3 100%);}
.sg-wrap{width:100%;max-width:860px;display:grid;grid-template-columns:1.05fr .95fr;background:#fff;
  border-radius:20px;overflow:hidden;box-shadow:0 24px 64px rgba(18,33,64,.18),0 2px 8px rgba(18,33,64,.06);}
/* Bảng thương hiệu — nền tối suy ra từ màu nút */
.sg-side{position:relative;padding:40px 36px;color:#fff;display:flex;flex-direction:column;justify-content:space-between;min-height:460px;
  background:radial-gradient(130% 100% at 100% 0%,rgba(255,255,255,.16),transparent 55%),linear-gradient(160deg,${shade(btn, 0.42)} 0%,${btn} 100%);}
.sg-side::after{content:"";position:absolute;inset:0;background:radial-gradient(55% 42% at 18% 92%,rgba(255,255,255,.14),transparent 70%);pointer-events:none;}
.sg-side-logo{height:28px;width:auto;align-self:flex-start;max-width:70%;object-fit:contain;position:relative;z-index:1;}
.sg-hero{position:relative;z-index:1;}
.sg-side-lock{width:54px;height:54px;border-radius:14px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;margin-bottom:22px;}
.sg-side-lock svg{width:26px;height:26px;color:#fff;}
.sg-hero-h{font-size:27px;line-height:1.25;font-weight:700;letter-spacing:-.015em;margin:0 0 12px;text-wrap:balance;}
.sg-hero-p{font-size:14.5px;line-height:1.6;color:rgba(255,255,255,.82);margin:0;max-width:300px;}
.sg-side-foot{position:relative;z-index:1;font-size:12.5px;}
.sg-side-foot a{color:rgba(255,255,255,.72);text-decoration:none;}
.sg-side-foot a:hover{color:#fff;text-decoration:underline;}
/* Biểu mẫu bên phải */
.sg-form-side{padding:44px 40px;display:flex;flex-direction:column;justify-content:center;}
.sg-eyebrow{display:inline-block;align-self:flex-start;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:${badge};background:${tint(badge)};border:1px solid ${tint(badge, 0.28)};padding:5px 12px;border-radius:20px;margin:0 0 16px;}
.sg-title{font-size:21px;font-weight:700;letter-spacing:-.01em;margin:0 0 6px;color:#141a24;}
.sg-note{font-size:14px;color:#616b7a;line-height:1.5;margin:0 0 22px;}
.sg-err{color:#b42318;background:#fef3f2;border:1px solid #fecdca;padding:10px 14px;border-radius:10px;font-size:13.5px;margin:0 0 16px;}
.sg-field{display:block;font-size:12px;font-weight:600;color:#4a5364;margin:0 0 7px;}
.sg-form{display:flex;flex-direction:column;}
.sg-input{width:100%;padding:13px 15px;border:1px solid #d7dce4;border-radius:10px;font-size:15px;
  background:#fbfcfe;color:#141a24;transition:border-color .15s,box-shadow .15s,background .15s;}
.sg-input::placeholder{color:#9aa3b1;}
.sg-input:focus{outline:none;border-color:${btn};background:#fff;box-shadow:0 0 0 4px ${tint(btn, 0.15)};}
.sg-btn{margin-top:16px;width:100%;padding:13px 20px;background:${btn};color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:650;
  cursor:pointer;box-shadow:0 6px 16px ${tint(btn, 0.3)};transition:background .15s,transform .05s,box-shadow .15s;}
.sg-btn:hover{background:${shade(btn)};box-shadow:0 8px 20px ${tint(btn, 0.38)};}
.sg-btn:active{transform:translateY(1px);}

@media (max-width:640px){.sh-wrap{padding:20px 16px 32px;}.sh-title{font-size:22px;}}
@media (max-width:680px){
  .sg{padding:0;align-items:stretch;background:#fff;}
  .sg-wrap{max-width:none;min-height:100vh;grid-template-columns:1fr;border-radius:0;box-shadow:none;}
  .sg-side{min-height:auto;padding:28px 26px;gap:24px;}
  .sg-hero-h{font-size:22px;}
  .sg-side-lock{width:46px;height:46px;margin-bottom:16px;}
  .sg-form-side{padding:30px 26px 40px;}
}
`;
}

export default async function SharePage(
  props: {
    params: Promise<{ token: string }>;
    searchParams?: Promise<{ e?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const token = params.token;
  const data = await loadReport(token);
  if (!data) notFound();
  const { report, viewLocked, locked } = data;
  const b = await getBranding();

  // ── KHÓA bằng mật khẩu: chưa mở khóa (cookie hợp lệ) → hiện form nhập, KHÔNG dựng nội dung ──
  if (locked && !checkShareAccess(token, (await cookies()).get(shareAccessCookieName(token))?.value)) {
    const err = searchParams?.e === '1';
    const rate = searchParams?.e === 'rate';
    const g = GATE[pickLocale(report.locale)];
    return (
      <main className="sh sg">
        <style
          dangerouslySetInnerHTML={{
            __html: shareCss(b.colorShareButton || '#0061ff', b.colorShareBadge || '#0061ff'),
          }}
        />
        <div className="sg-wrap">
          {/* Bảng thương hiệu (nền tối) — dùng logo ÂM BẢN cho chữ sáng */}
          <aside className="sg-side">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sg-side-logo" src={b.logoAmBan} alt={b.sourceText} />
            <div className="sg-hero">
              <div className="sg-side-lock" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="11" width="16" height="10" rx="2.2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  <circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <h1 className="sg-hero-h">{g.protTitle}</h1>
              <p className="sg-hero-p">{g.protNote}</p>
            </div>
            <div className="sg-side-foot">
              <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer">
                {b.sourceText}
              </a>
            </div>
          </aside>

          {/* Biểu mẫu nhập mật khẩu */}
          <div className="sg-form-side">
            <p className="sg-eyebrow">{g.badge}</p>
            <h2 className="sg-title">{g.action}</h2>
            <p className="sg-note">{g.prompt}</p>
            {err ? <p className="sg-err">{g.errWrong}</p> : null}
            {rate ? <p className="sg-err">{g.errRate}</p> : null}
            <form method="POST" action={`/api/share/${token}/unlock`} className="sg-form">
              <label className="sg-field" htmlFor="sg-pw">
                {g.pwLabel}
              </label>
              <input
                id="sg-pw"
                type="password"
                name="password"
                placeholder={g.pwPlaceholder}
                autoComplete="off"
                className="sg-input"
                autoFocus
                required
              />
              <button type="submit" className="sg-btn">
                {g.action}
              </button>
            </form>
          </div>
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
      <style
        dangerouslySetInnerHTML={{
          __html: shareCss(b.colorShareButton || '#0061ff', b.colorShareBadge || '#0061ff'),
        }}
      />
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

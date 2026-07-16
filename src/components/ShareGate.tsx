// Màn NHẬP MẬT KHẨU chia sẻ (split panel) — dùng chung cho /share (báo cáo) & /share/video (kịch bản).
// Server component: tự lấy branding + màu cấu hình. Chuỗi theo report.locale (self-contained).
import { GATE, pickGateLocale } from '@/lib/share/gate-strings';
import { getBranding } from '@/lib/store/branding';

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

function gateCss(btn: string, badge: string): string {
  return `
.sg{font-family:var(--font-inter),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1f2b;-webkit-font-smoothing:antialiased;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;
  background:linear-gradient(180deg,#eef1f6 0%,#e7ebf3 100%);}
.sg-wrap{width:100%;max-width:860px;display:grid;grid-template-columns:1.05fr .95fr;background:#fff;
  border-radius:20px;overflow:hidden;box-shadow:0 24px 64px rgba(18,33,64,.18),0 2px 8px rgba(18,33,64,.06);}
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

// action = URL POST của route unlock (khác nhau giữa báo cáo & kịch bản). err/rate: cờ hiển thị lỗi.
export async function ShareGate({
  locale,
  action,
  err,
  rate,
}: {
  locale: string;
  action: string;
  err?: boolean;
  rate?: boolean;
}) {
  const b = await getBranding();
  const btn = b.colorShareButton || '#0061ff';
  const badge = b.colorShareBadge || '#0061ff';
  const g = GATE[pickGateLocale(locale)];
  return (
    <main className="sg">
      <style dangerouslySetInnerHTML={{ __html: gateCss(btn, badge) }} />
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
          <form method="POST" action={action} className="sg-form">
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

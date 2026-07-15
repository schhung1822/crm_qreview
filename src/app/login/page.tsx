'use client';

import { ActionList, Banner, Button, Form, FormLayout, Icon, Popover, TextField } from '@shopify/polaris';
import { ChevronDownIcon } from '@shopify/polaris-icons';
import { useEffect, useState, type CSSProperties } from 'react';
import { PolarisProvider } from '@/components/PolarisProvider';
import { localeNames, locales, type Locale } from '@/i18n/config';
import { LOGIN_STRINGS } from './i18n';

// Trang đăng nhập (ngoài [locale]) - hero giới thiệu sản phẩm + form, đa ngôn ngữ 10 thứ tiếng.
export default function LoginPage() {
  return (
    <PolarisProvider>
      <LoginInner />
    </PolarisProvider>
  );
}

// Ngôn ngữ khởi tạo: localStorage đã lưu → ngôn ngữ trình duyệt → 'vi'.
function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'vi';
  const saved = window.localStorage.getItem('login_locale');
  if (saved && (locales as readonly string[]).includes(saved)) return saved as Locale;
  const nav = window.navigator.language?.slice(0, 2).toLowerCase();
  if (nav && (locales as readonly string[]).includes(nav)) return nav as Locale;
  return 'vi';
}

// Thương hiệu công khai (logo/nguồn) - lấy từ /api/branding. Fallback = giá trị mặc định noti.vn
// (KHÔNG import store server-only vào bundle client).
interface LoginBrand {
  logoAmBan: string;
  logoDuongBan: string;
  sourceText: string;
  sourceUrl: string;
  accent: string; // màu nhấn hero (đồng bộ trang chủ = colorHome, fallback colorPrimary)
}
const DEFAULT_BRAND: LoginBrand = {
  logoAmBan: 'https://noti.vn/image/new/logo-am-ban.png',
  logoDuongBan: 'https://noti.vn/image/new/logo-duong-ban.png',
  sourceText: 'by: noti.vn',
  sourceUrl: 'https://noti.vn',
  accent: '',
};
// Chỉ nhận HEX hợp lệ (#rgb / #rrggbb) → tránh chèn giá trị lạ vào CSS var.
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function LoginInner() {
  const [locale, setLocale] = useState<Locale>('vi');
  const [langOpen, setLangOpen] = useState(false);
  const [brand, setBrand] = useState<LoginBrand>(DEFAULT_BRAND);

  useEffect(() => {
    fetch('/api/branding')
      .then((r) => r.json())
      .then((b: Partial<LoginBrand> & { colorHome?: string; colorPrimary?: string }) => {
        const raw = (b.colorHome || b.colorPrimary || '').trim();
        setBrand({
          logoAmBan: b.logoAmBan || DEFAULT_BRAND.logoAmBan,
          logoDuongBan: b.logoDuongBan || DEFAULT_BRAND.logoDuongBan,
          sourceText: b.sourceText || DEFAULT_BRAND.sourceText,
          sourceUrl: b.sourceUrl || DEFAULT_BRAND.sourceUrl,
          accent: HEX.test(raw) ? raw : '',
        });
      })
      .catch(() => {});
  }, []);

  const [mode, setMode] = useState<'loading' | 'login' | 'register' | 'forgot' | 'reset'>('loading');
  const [needsSetup, setNeedsSetup] = useState(false);
  // Tự đăng ký có đang bật không (superadmin điều khiển). Mặc định true tới khi /api/auth/me trả về.
  const [regEnabled, setRegEnabled] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  // Email của tài khoản CHƯA kích hoạt (đăng ký xong chờ xác thực / đăng nhập bị chặn 403) →
  // hiện nút "Gửi lại email kích hoạt".
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const t = LOGIN_STRINGS[locale];
  // Chuỗi cho màn đặt lại mật khẩu - locale chưa dịch thì fallback sang tiếng Anh.
  const en = LOGIN_STRINGS.en;
  const tResetTitle = t.resetTitle ?? en.resetTitle!;
  const tResetHint = t.resetHint ?? en.resetHint!;
  const tBtnReset = t.btnReset ?? en.btnReset!;
  const tResetDone = t.resetDone ?? en.resetDone!;
  const tResetInvalid = t.resetInvalid ?? en.resetInvalid!;
  // Chuỗi cho luồng kích hoạt tài khoản qua email - locale chưa dịch thì fallback sang tiếng Anh.
  const tVerifySent = t.verifySent ?? en.verifySent!;
  const tVerifySendFail = t.verifySendFail ?? en.verifySendFail!;
  const tVerifyInvalid = t.verifyInvalid ?? en.verifyInvalid!;
  const tErrUnverified = t.errUnverified ?? en.errUnverified!;
  const tBtnResendVerify = t.btnResendVerify ?? en.btnResendVerify!;

  useEffect(() => {
    const loc = detectLocale();
    setLocale(loc);
    const params = new URLSearchParams(window.location.search);
    // Link kích hoạt tài khoản: /login?verify=<token> → gọi API kích hoạt; thành công thì đã có
    // phiên (API tự tạo session) → vào thẳng dashboard. Thất bại → về màn đăng nhập kèm lỗi.
    const verifyToken = params.get('verify');
    if (verifyToken) {
      window.history.replaceState(null, '', '/login'); // bỏ token khỏi URL (tránh lộ qua history)
      fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken }),
      })
        .then(async (r) => {
          const d = await r.json().catch(() => null);
          if (r.ok && d?.ok) {
            window.location.href = `/${loc}/dashboard`;
            return;
          }
          setMode('login');
          setError(LOGIN_STRINGS[loc].verifyInvalid ?? LOGIN_STRINGS.en.verifyInvalid!);
        })
        .catch(() => {
          setMode('login');
          setError(LOGIN_STRINGS[loc].verifyInvalid ?? LOGIN_STRINGS.en.verifyInvalid!);
        });
      return;
    }
    // Link đặt lại mật khẩu: /login?reset=<token> → hiện form đặt mật khẩu mới, KHÔNG chuyển hướng.
    const token = params.get('reset');
    if (token) {
      setResetToken(token);
      setMode('reset');
      return;
    }
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: { user: unknown; needsSetup: boolean; selfRegistrationEnabled?: boolean }) => {
        if (d.user) {
          window.location.href = `/${loc}/dashboard`;
          return;
        }
        setNeedsSetup(d.needsSetup);
        // Tài khoản đầu tiên (setup) LUÔN được tạo dù tự đăng ký tắt; ngoài ra theo cờ nền tảng.
        const canReg = d.needsSetup || d.selfRegistrationEnabled !== false;
        setRegEnabled(canReg);
        setMode(d.needsSetup ? 'register' : 'login');
      })
      .catch(() => setMode('login'));
  }, []);

  function changeLocale(l: Locale) {
    setLocale(l);
    setLangOpen(false);
    try {
      window.localStorage.setItem('login_locale', l);
    } catch {
      /* ignore */
    }
  }

  function switchMode(next: 'login' | 'register' | 'forgot') {
    setMode(next);
    setError(null);
    setNotice(null);
    setUnverifiedEmail(null);
  }

  // Gửi lại email kích hoạt cho tài khoản chưa xác thực (đăng ký chờ kích hoạt / đăng nhập bị chặn).
  async function resendVerify() {
    if (!unverifiedEmail) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) setNotice(tVerifySent);
      else setError(data?.error ?? t.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'forgot') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) setNotice(t.forgotSent);
        else setError(data?.error ?? t.errGeneric);
        return;
      }
      if (mode === 'reset') {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, newPassword: password }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) {
          setNotice(tResetDone);
          setPassword('');
          setResetToken(null);
          // Bỏ token khỏi URL rồi chuyển về màn đăng nhập.
          window.history.replaceState(null, '', '/login');
          setMode('login');
        } else {
          setError(data?.error ?? tResetInvalid);
        }
        return;
      }
      const url = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body = mode === 'register' ? { email, name, password } : { email, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.user) window.location.href = `/${locale}/dashboard`;
      else if (res.ok && data.requiresVerification) {
        // Đăng ký xong, chờ kích hoạt qua email → về màn đăng nhập + hướng dẫn kiểm tra hộp thư.
        setMode('login');
        setPassword('');
        setUnverifiedEmail(data.email ?? email);
        if (data.emailError) setError(tVerifySendFail);
        else setNotice(tVerifySent);
      } else if (data?.unverified) {
        // Đăng nhập đúng mật khẩu nhưng tài khoản chưa kích hoạt → cho gửi lại link.
        setUnverifiedEmail(email);
        setError(tErrUnverified);
      } else setError(data.error ?? t.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'reset'
      ? tResetTitle
      : mode === 'forgot'
        ? t.forgotTitle
        : mode === 'register'
          ? needsSetup
            ? t.createAdminTitle
            : t.createTitle
          : t.signInTitle;

  const langSwitcher = (
    <Popover
      active={langOpen}
      onClose={() => setLangOpen(false)}
      preferredAlignment="right"
      activator={
        <button
          type="button"
          className="login-lang"
          onClick={() => setLangOpen((v) => !v)}
          aria-label={t.langLabel}
        >
          <span className="flag">{localeNames[locale].flag}</span>
          <span className="login-lang__name">{localeNames[locale].native}</span>
          <Icon source={ChevronDownIcon} tone="subdued" />
        </button>
      }
    >
      <ActionList
        actionRole="menuitem"
        items={locales.map((l) => ({
          content: localeNames[l].native,
          prefix: <span className="flag">{localeNames[l].flag}</span>,
          active: l === locale,
          onAction: () => changeLocale(l),
        }))}
      />
    </Popover>
  );

  return (
    <div className="login-shell" style={brand.accent ? ({ '--lg-accent': brand.accent } as CSSProperties) : undefined}>
      {/* HERO - giới thiệu sản phẩm + USP */}
      <aside className="login-hero">
        <div className="login-hero__inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-hero__logo" src={brand.logoAmBan} alt={brand.sourceText} />
          <span className="login-hero__tag">{t.tagline}</span>
          <h1 className="login-hero__title">{t.heroTitle}</h1>
          <p className="login-hero__sub">{t.heroSubtitle}</p>
          <ul className="login-usps">
            {t.usps.map((u, i) => (
              <li key={i} className="login-usp">
                <span className="login-usp__check" aria-hidden>
                  ✓
                </span>
                <span className="login-usp__text">
                  <strong>{u.title}</strong>
                  <span>{u.desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <a className="login-hero__foot" href={brand.sourceUrl} target="_blank" rel="noopener noreferrer">
            {brand.sourceText}
          </a>
        </div>
      </aside>

      {/* FORM */}
      <main className="login-main">
        <div className="login-topbar">{langSwitcher}</div>

        <div className="login-card-wrap">
          {/* Thương hiệu thu gọn (hiện khi ẩn hero ở màn hẹp) */}
          <div className="login-brand-mobile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoDuongBan} alt={brand.sourceText} />
            <span>{t.tagline}</span>
          </div>

          {mode === 'loading' ? null : (
            <div className="login-card">
              <h2 className="login-card__title">{title}</h2>
              {mode === 'register' ? (
                <p className="login-card__note">{needsSetup ? t.registerNoteFirst : t.registerNote}</p>
              ) : null}
              {mode === 'forgot' ? <p className="login-card__note">{t.forgotHint}</p> : null}
              {mode === 'reset' ? <p className="login-card__note">{tResetHint}</p> : null}

              {error ? <Banner tone="critical">{error}</Banner> : null}
              {notice ? <Banner tone="success">{notice}</Banner> : null}
              {/* Tài khoản chưa kích hoạt → cho gửi lại link kích hoạt (không cần gõ lại email). */}
              {unverifiedEmail && mode === 'login' ? (
                <div className="login-links login-links--center">
                  <Button variant="plain" loading={busy} onClick={() => void resendVerify()}>
                    {tBtnResendVerify}
                  </Button>
                </div>
              ) : null}

              {/* Bọc Form → nhấn Enter trong ô nhập là gửi luôn (khỏi phải click nút). */}
              <Form onSubmit={() => void submit()}>
                <FormLayout>
                  {mode === 'register' ? (
                    <TextField label={t.name} value={name} onChange={setName} autoComplete="name" />
                  ) : null}
                  {mode !== 'reset' ? (
                    <TextField label={t.email} type="email" value={email} onChange={setEmail} autoComplete="email" />
                  ) : null}
                  {mode !== 'forgot' ? (
                    <TextField
                      label={t.password}
                      type="password"
                      value={password}
                      onChange={setPassword}
                      autoComplete={mode === 'register' || mode === 'reset' ? 'new-password' : 'current-password'}
                      helpText={mode === 'register' || mode === 'reset' ? t.passwordHint : undefined}
                    />
                  ) : null}
                  <Button submit variant="primary" fullWidth loading={busy}>
                    {mode === 'reset'
                      ? tBtnReset
                      : mode === 'forgot'
                        ? t.btnForgot
                        : mode === 'register'
                          ? t.btnCreate
                          : t.btnSignIn}
                  </Button>
                </FormLayout>
              </Form>

              {mode === 'login' ? (
                <div className="login-links login-links--center">
                  <Button variant="plain" onClick={() => switchMode('forgot')}>
                    {t.forgotLink}
                  </Button>
                </div>
              ) : null}

              {needsSetup ? null : mode === 'forgot' || mode === 'reset' ? (
                <div className="login-links">
                  <span>{t.rememberPassword}</span>
                  <Button variant="plain" onClick={() => switchMode('login')}>
                    {t.toSignIn}
                  </Button>
                </div>
              ) : regEnabled ? (
                <div className="login-links">
                  <span>{mode === 'register' ? t.haveAccount : t.noAccount}</span>
                  <Button variant="plain" onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}>
                    {mode === 'register' ? t.toSignIn : t.toCreate}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

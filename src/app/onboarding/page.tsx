'use client';

import {
  ActionList,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Form,
  FormLayout,
  Icon,
  InlineGrid,
  Popover,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { ChevronDownIcon } from '@shopify/polaris-icons';
import { useEffect, useState } from 'react';
import { PolarisProvider } from '@/components/PolarisProvider';
import { localeNames, locales, type Locale } from '@/i18n/config';
import { ONBOARDING_STRINGS } from './i18n';

// Onboarding (ngoài [locale]): tài khoản mới BẮT BUỘC tạo biz trước khi vào hệ thống. Đa ngôn ngữ,
// kế thừa lựa chọn ở trang login. Biz là phạm vi lớn nhất - mọi kết nối/nội dung/nhân viên/email thuộc biz.
export default function OnboardingPage() {
  return (
    <PolarisProvider>
      <OnboardingInner />
    </PolarisProvider>
  );
}

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'vi';
  const saved = window.localStorage.getItem('login_locale');
  if (saved && (locales as readonly string[]).includes(saved)) return saved as Locale;
  const nav = window.navigator.language?.slice(0, 2).toLowerCase();
  if (nav && (locales as readonly string[]).includes(nav)) return nav as Locale;
  return 'vi';
}

const DEFAULT_LOGO = 'https://noti.vn/image/new/logo-duong-ban.png';

function OnboardingInner() {
  const [locale, setLocale] = useState<Locale>('vi');
  const [langOpen, setLangOpen] = useState(false);
  const [logo, setLogo] = useState(DEFAULT_LOGO);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/branding')
      .then((r) => r.json())
      .then((b: { logoDuongBan?: string }) => setLogo(b.logoDuongBan || DEFAULT_LOGO))
      .catch(() => {});
  }, []);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = ONBOARDING_STRINGS[locale];

  // Chốt chặn: chưa đăng nhập → về login; đã có biz → vào thẳng dashboard (theo ngôn ngữ đã chọn).
  useEffect(() => {
    const loc = detectLocale();
    setLocale(loc);
    (async () => {
      try {
        const me = await fetch('/api/auth/me').then((r) => r.json());
        if (!me.user) {
          window.location.href = '/login';
          return;
        }
        const d = await fetch('/api/biz').then((r) => r.json());
        if (Array.isArray(d.bizes) && d.bizes.length > 0) {
          window.location.href = `/${loc}/dashboard`;
          return;
        }
        setReady(true);
      } catch {
        setReady(true);
      }
    })();
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

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/biz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.biz?.id) {
        setError(d?.error ?? t.errCreate);
        return;
      }
      // Lưu thêm thông tin liên hệ (nếu có) - không chặn nếu lỗi.
      if (phone.trim() || email.trim() || website.trim() || description.trim()) {
        await fetch(`/api/biz/${d.biz.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, email, website, description }),
        }).catch(() => {});
      }
      window.location.href = `/${locale}/dashboard`;
    } finally {
      setBusy(false);
    }
  }

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
    <div
      style={{ position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6f6f7', padding: 20 }}
    >
      <div className="login-topbar">{langSwitcher}</div>

      <div style={{ width: '100%', maxWidth: 560 }}>
        <BlockStack gap="400">
          <Box paddingBlockEnd="200">
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" style={{ height: 44, width: 'auto' }} />
            </div>
          </Box>
          {!ready ? (
            <Card>
              <Box padding="400">
                <Spinner size="small" />
              </Box>
            </Card>
          ) : (
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    {t.title}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {t.subtitle}
                  </Text>
                </BlockStack>
                {error ? <Banner tone="critical">{error}</Banner> : null}
                {/* Bọc Form → nhấn Enter là tạo biz luôn. */}
                <Form onSubmit={() => void create()}>
                  <FormLayout>
                    <TextField
                      label={t.nameLabel}
                      value={name}
                      onChange={setName}
                      autoComplete="off"
                      requiredIndicator
                      placeholder={t.namePlaceholder}
                    />
                    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                      <TextField label={t.phone} value={phone} onChange={setPhone} autoComplete="off" />
                      <TextField label={t.email} type="email" value={email} onChange={setEmail} autoComplete="off" />
                    </InlineGrid>
                    <TextField
                      label={t.website}
                      type="url"
                      value={website}
                      onChange={setWebsite}
                      autoComplete="off"
                      placeholder="https://"
                    />
                    <TextField
                      label={t.description}
                      value={description}
                      onChange={setDescription}
                      multiline={3}
                      autoComplete="off"
                    />
                    <Button submit variant="primary" fullWidth loading={busy} disabled={!name.trim()}>
                      {t.submit}
                    </Button>
                  </FormLayout>
                </Form>
              </BlockStack>
            </Card>
          )}
        </BlockStack>
      </div>
    </div>
  );
}

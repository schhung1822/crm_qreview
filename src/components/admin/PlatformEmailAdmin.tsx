'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Modal,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useAdminDialog } from '@/components/admin/AdminDialog';
import { apiErrText } from '@/lib/admin/api-error';
import { useCallback, useEffect, useState } from 'react';

interface Tpl {
  subject: string;
  body: string;
}
interface GmailState {
  configured: boolean;
  connected: boolean;
  clientId?: string;
  senderEmail?: string;
  fromName?: string;
}
interface State {
  transport: 'smtp' | 'gmail_oauth2';
  configured: boolean;
  smtpReady: boolean;
  gmailReady: boolean;
  gmail: GmailState;
  enabled: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  fromName?: string;
  fromEmail?: string;
  events: Record<string, boolean>;
  templates: Record<string, Tpl>;
}

const EVENTS = [
  'welcome',
  'verifyEmail',
  'registered',
  'forgotPassword',
  'userCreated',
  'roleChanged',
] as const;
const EVENT_VARS: Record<string, string[]> = {
  welcome: ['name', 'email', 'appName', 'loginUrl'],
  verifyEmail: ['name', 'email', 'verifyUrl', 'appName', 'loginUrl'],
  registered: ['name', 'email', 'appName', 'loginUrl'],
  forgotPassword: ['name', 'email', 'password', 'appName', 'loginUrl'],
  userCreated: ['name', 'email', 'password', 'role', 'appName', 'loginUrl'],
  roleChanged: ['name', 'email', 'role', 'appName', 'loginUrl'],
};

export function PlatformEmailAdmin() {
  const t = useTranslations('admin');
  const dlg = useAdminDialog();
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ host: '', port: 587, secure: false, user: '', pass: '', fromName: 'CRM QReview', fromEmail: '' });
  const [gform, setGform] = useState({ clientId: '', clientSecret: '', senderEmail: '', fromName: 'CRM QReview' });
  const [tpl, setTpl] = useState<Record<string, Tpl>>({});
  const [smtpOpen, setSmtpOpen] = useState(false);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [testTo, setTestTo] = useState(''); // email NHẬN khi gửi thử (người dùng tự nhập)
  const [dlgMsg, setDlgMsg] = useState<{ ok: boolean; text: string } | null>(null); // banner TRONG popup

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/platform-email');
    if (r.ok) {
      const d: State = await r.json();
      setSt(d);
      setTpl(d.templates ?? {});
      setForm((f) => ({
        ...f,
        host: d.host ?? '',
        port: d.port ?? 587,
        secure: d.secure ?? false,
        user: d.user ?? '',
        fromName: d.fromName ?? 'Noti SaaS',
        fromEmail: d.fromEmail ?? '',
      }));
      setGform((g) => ({
        ...g,
        clientId: d.gmail?.clientId ?? '',
        senderEmail: d.gmail?.senderEmail ?? '',
        fromName: d.gmail?.fromName ?? 'Noti SaaS',
      }));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Đọc kết quả OAuth Gmail (Google redirect về kèm ?gmail_connected / ?gmail_error), hiện banner
  // rồi dọn query khỏi URL.
  useEffect(() => {
    setOrigin(window.location.origin);
    const q = new URLSearchParams(window.location.search);
    if (q.get('gmail_connected')) {
      setMsg({ ok: true, text: t('emailGmailConnectedBanner') });
    } else if (q.get('gmail_error')) {
      setMsg({ ok: false, text: t('emailGmailErrorBanner', { err: q.get('gmail_error') ?? '' }) });
    }
    if (q.get('gmail_connected') || q.get('gmail_error')) {
      q.delete('gmail_connected');
      q.delete('gmail_error');
      const s = q.toString();
      window.history.replaceState(null, '', window.location.pathname + (s ? `?${s}` : ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setPort(v: string) {
    const port = Number(v) || 0;
    setForm((f) => ({ ...f, port, secure: port === 465 ? true : port === 587 || port === 25 ? false : f.secure }));
  }

  // target: 'page' = banner trên đầu trang (bật/tắt, chuyển phương thức, lưu template);
  //         'modal' = banner TRONG popup đang mở (lưu/gửi thử SMTP hoặc Gmail).
  async function post(body: Record<string, unknown>, key: string, target: 'page' | 'modal' = 'page'): Promise<boolean> {
    const setBanner = target === 'modal' ? setDlgMsg : setMsg;
    setBusy(key);
    setBanner(null);
    try {
      const r = await fetch('/api/admin/platform-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setBanner({ ok: true, text: key === 'test' || key === 'test-gmail' ? t('emailTestOk', { to: d?.to ?? '' }) : t('emailSaved') });
        await load();
        return true;
      }
      setBanner({ ok: false, text: apiErrText(d, t) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  // Lưu cấu hình Gmail rồi chuyển hướng tới Google để lấy refresh token.
  async function connectGmail() {
    const ok = await post({ action: 'gmail', ...gform }, 'gmail-connect', 'modal');
    if (ok) window.location.href = '/api/admin/platform-email/gmail-auth';
  }

  // Gửi email thử tới địa chỉ người dùng nhập (bắt buộc). SMTP kèm cấu hình đang nhập để test cả
  // giá trị chưa lưu; Gmail dùng cấu hình đã lưu + đã kết nối. Trạng thái hiện TRONG popup.
  async function testSend(mode: 'smtp' | 'gmail') {
    if (!testTo.trim()) {
      setDlgMsg({ ok: false, text: t('emailTestNeedTo') });
      return;
    }
    const extra = mode === 'smtp' ? form : {};
    await post({ action: 'test', mode, to: testTo.trim(), ...extra }, mode === 'smtp' ? 'test' : 'test-gmail', 'modal');
  }

  // Mở popup: dọn banner cũ để không hiện trạng thái lần trước.
  function openSmtp() {
    setDlgMsg(null);
    setSmtpOpen(true);
  }
  function openGmail() {
    setDlgMsg(null);
    setGmailOpen(true);
  }

  if (!st)
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );

  const activeSmtp = st.transport === 'smtp';
  const gmailRedirectUri = origin ? `${origin}/api/admin/platform-email/gmail-callback` : '';

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h3" variant="headingSm">
          {t('emailTitle')}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {t('emailHelp')}
        </Text>
      </BlockStack>
      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}

      {/* Chọn phương thức gửi: SMTP hoặc Gmail OAuth2 */}
      <Card>
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center" wrap>
            <Text as="h4" variant="headingSm">
              {t('emailTransport')}
            </Text>
            <Checkbox label={t('emailEnabled')} checked={st.enabled} onChange={(v) => void post({ action: 'enabled', enabled: v }, 'enabled')} />
          </InlineStack>
          <Text as="p" tone="subdued" variant="bodySm">
            {t('emailTransportHelp')}
          </Text>

          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
            {/* SMTP */}
            <Card background={activeSmtp ? 'bg-surface-selected' : undefined}>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="span" variant="headingSm">SMTP</Text>
                  {activeSmtp ? <Badge tone="success">{t('emailActive')}</Badge> : null}
                </InlineStack>
                <InlineStack gap="100">
                  <Badge tone={st.smtpReady ? 'success' : undefined}>{st.smtpReady ? t('emailConfigured') : t('emailNotConfigured')}</Badge>
                </InlineStack>
                <InlineStack gap="200" wrap>
                  <Button onClick={openSmtp}>{t('emailConfigure')}</Button>
                  {st.smtpReady && !activeSmtp ? (
                    <Button variant="plain" loading={busy === 'tr-smtp'} onClick={() => void post({ action: 'transport', transport: 'smtp' }, 'tr-smtp')}>
                      {t('emailUseThis')}
                    </Button>
                  ) : null}
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Gmail OAuth2 */}
            <Card background={!activeSmtp ? 'bg-surface-selected' : undefined}>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="span" variant="headingSm">Gmail OAuth2</Text>
                  {!activeSmtp ? <Badge tone="success">{t('emailActive')}</Badge> : null}
                </InlineStack>
                <InlineStack gap="100" wrap>
                  <Badge tone={st.gmail.configured ? 'success' : undefined}>{st.gmail.configured ? t('emailConfigured') : t('emailNotConfigured')}</Badge>
                  <Badge tone={st.gmail.connected ? 'success' : 'attention'}>{st.gmail.connected ? t('emailGmailConnected') : t('emailGmailNotConnected')}</Badge>
                </InlineStack>
                <InlineStack gap="200" wrap>
                  <Button onClick={openGmail}>{t('emailConfigure')}</Button>
                  {st.gmailReady && activeSmtp ? (
                    <Button variant="plain" loading={busy === 'tr-gmail'} onClick={() => void post({ action: 'transport', transport: 'gmail_oauth2' }, 'tr-gmail')}>
                      {t('emailUseThis')}
                    </Button>
                  ) : null}
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </BlockStack>
      </Card>

      {/* Popup cấu hình SMTP */}
      <Modal
        open={smtpOpen}
        onClose={() => setSmtpOpen(false)}
        title={t('emailModalSmtp')}
        primaryAction={{ content: t('emailSave'), loading: busy === 'smtp', onAction: () => void post({ action: 'smtp', ...form }, 'smtp', 'modal') }}
        secondaryActions={[
          { content: t('emailTest'), loading: busy === 'test', onAction: () => void testSend('smtp') },
          { content: t('emailClose'), onAction: () => setSmtpOpen(false) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {dlgMsg ? <Banner tone={dlgMsg.ok ? 'success' : 'critical'} onDismiss={() => setDlgMsg(null)}>{dlgMsg.text}</Banner> : null}
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
              <TextField label={t('emailHost')} value={form.host} onChange={(v) => setForm((f) => ({ ...f, host: v }))} autoComplete="off" />
              <TextField label={t('emailPort')} type="number" value={String(form.port)} onChange={setPort} autoComplete="off" />
              <TextField label={t('emailUser')} value={form.user} onChange={(v) => setForm((f) => ({ ...f, user: v }))} autoComplete="off" />
              <TextField label={t('emailPass')} type="password" value={form.pass} onChange={(v) => setForm((f) => ({ ...f, pass: v }))} autoComplete="off" helpText={st.smtpReady ? t('emailPassHint') : undefined} />
              <TextField label={t('emailFromName')} value={form.fromName} onChange={(v) => setForm((f) => ({ ...f, fromName: v }))} autoComplete="off" />
              <TextField label={t('emailFromEmail')} type="email" value={form.fromEmail} onChange={(v) => setForm((f) => ({ ...f, fromEmail: v }))} autoComplete="off" />
            </InlineGrid>
            <Checkbox label={t('emailSecure')} checked={form.secure} onChange={(v) => setForm((f) => ({ ...f, secure: v }))} />
            <TextField label={t('emailTestTo')} type="email" value={testTo} onChange={setTestTo} autoComplete="off" placeholder="you@example.com" />
            {st.smtpReady ? (
              <Button variant="plain" tone="critical" onClick={async () => {
                const ok = await dlg.confirm({ title: t('emailClear'), message: t('emailClearConfirm'), tone: 'critical', confirmText: t('emailClear') });
                if (!ok) return;
                await fetch('/api/admin/platform-email', { method: 'DELETE' });
                await load();
                setDlgMsg({ ok: true, text: t('emailSaved') });
              }}>
                {t('emailClear')}
              </Button>
            ) : null}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Popup cấu hình Gmail OAuth2 */}
      <Modal
        open={gmailOpen}
        onClose={() => setGmailOpen(false)}
        title={t('emailModalGmail')}
        primaryAction={{ content: st.gmail.connected ? t('emailGmailReconnect') : t('emailGmailConnect'), loading: busy === 'gmail-connect', onAction: () => void connectGmail() }}
        secondaryActions={[
          { content: t('emailSaveGmail'), loading: busy === 'gmail', onAction: () => void post({ action: 'gmail', ...gform }, 'gmail', 'modal') },
          ...(st.gmailReady ? [{ content: t('emailTest'), loading: busy === 'test-gmail', onAction: () => void testSend('gmail') }] : []),
          { content: t('emailClose'), onAction: () => setGmailOpen(false) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {dlgMsg ? <Banner tone={dlgMsg.ok ? 'success' : 'critical'} onDismiss={() => setDlgMsg(null)}>{dlgMsg.text}</Banner> : null}
            <Text as="p" tone="subdued" variant="bodySm">{t('emailGmailHelp')}</Text>
            <TextField label="Client ID" value={gform.clientId} onChange={(v) => setGform((g) => ({ ...g, clientId: v }))} autoComplete="off" />
            <TextField label="Client Secret" type="password" value={gform.clientSecret} onChange={(v) => setGform((g) => ({ ...g, clientSecret: v }))} autoComplete="off" helpText={st.gmail.configured ? t('emailGmailSecretHint') : undefined} />
            <TextField label={t('emailGmailSender')} type="email" value={gform.senderEmail} onChange={(v) => setGform((g) => ({ ...g, senderEmail: v }))} autoComplete="off" />
            <TextField label={t('emailFromName')} value={gform.fromName} onChange={(v) => setGform((g) => ({ ...g, fromName: v }))} autoComplete="off" />
            <TextField label={t('emailTestTo')} type="email" value={testTo} onChange={setTestTo} autoComplete="off" placeholder="you@example.com" helpText={t('emailTestToHelp')} />
            {gmailRedirectUri ? (
              <Banner tone="info">
                <Text as="p" variant="bodySm">{t('emailGmailRedirectHint')}</Text>
                <Box paddingBlockStart="100"><Text as="p" variant="bodySm" fontWeight="medium" breakWord>{gmailRedirectUri}</Text></Box>
              </Banner>
            ) : null}
            <InlineStack gap="100">
              <Badge tone={st.gmail.connected ? 'success' : 'attention'}>{st.gmail.connected ? t('emailGmailConnected') : t('emailGmailNotConnected')}</Badge>
            </InlineStack>
            {st.gmail.configured ? (
              <Button variant="plain" tone="critical" onClick={async () => {
                const ok = await dlg.confirm({ title: t('emailGmailRemove'), message: t('emailClearConfirm'), tone: 'critical', confirmText: t('emailGmailRemove') });
                if (!ok) return;
                await post({ action: 'clearGmail' }, 'clearGmail', 'modal');
              }}>
                {t('emailGmailRemove')}
              </Button>
            ) : null}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Nội dung email theo TRẠNG THÁI khách hàng */}
      <BlockStack gap="100">
        <Text as="h3" variant="headingSm">
          {t('emailContent')}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {t('emailContentHelp')}
        </Text>
      </BlockStack>
      {EVENTS.map((ev) => {
        const cur = tpl[ev] ?? { subject: '', body: '' };
        return (
          <Card key={ev}>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <Text as="h4" variant="headingSm">
                  {t(`emailEvent_${ev}`)}
                </Text>
                <Checkbox
                  label={t('emailEventOn')}
                  checked={st.events[ev] !== false}
                  onChange={(v) => void post({ action: 'event', event: ev, enabled: v }, `ev-${ev}`)}
                />
              </InlineStack>
              <TextField label={t('emailSubject')} value={cur.subject} onChange={(v) => setTpl((s) => ({ ...s, [ev]: { ...cur, subject: v } }))} autoComplete="off" />
              <TextField label={t('emailBody')} value={cur.body} onChange={(v) => setTpl((s) => ({ ...s, [ev]: { ...cur, body: v } }))} autoComplete="off" multiline={6} />
              <Text as="span" tone="subdued" variant="bodySm">
                {t('emailVars')}: {EVENT_VARS[ev].map((v) => `{${v}}`).join(' ')}
              </Text>
              <InlineStack gap="200">
                <Button size="slim" loading={busy === `tpl-${ev}`} onClick={() => void post({ action: 'template', event: ev, subject: cur.subject, body: cur.body }, `tpl-${ev}`)}>
                  {t('emailSaveTpl')}
                </Button>
                <Button size="slim" variant="plain" onClick={() => void post({ action: 'resetTemplate', event: ev }, `rst-${ev}`)}>
                  {t('emailResetTpl')}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        );
      })}
    </BlockStack>
  );
}

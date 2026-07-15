'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Collapsible,
  DataTable,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useAdminDialog } from '@/components/admin/AdminDialog';
import { getApiGuideMd } from '@/lib/admin/api-guide';
import { apiErrText } from '@/lib/admin/api-error';
import { markdownToHtml } from '@/lib/content/markdown';
import { useCallback, useEffect, useMemo, useState } from 'react';

const ALL_SCOPES = ['orders', 'users', 'biz', 'coupons'] as const;
type Scope = (typeof ALL_SCOPES)[number];

// Ví dụ endpoint (kỹ thuật, không dịch). Nội dung chữ hướng dẫn đi qua i18n.
const API_EXAMPLES = `Authorization: Bearer sga_...

GET    /api/v1/admin/orders
PATCH  /api/v1/admin/orders     {"id":"ord_..","status":"paid"}
PATCH  /api/v1/admin/users      {"action":"setPlan","userId":"usr_..","plan":"pro","months":3}
PATCH  /api/v1/admin/users      {"action":"cancelSubscription","userId":"usr_.."}
PATCH  /api/v1/admin/biz        {"bizId":"biz_..","action":"suspend"}
POST   /api/v1/admin/coupons    {"code":"SALE","type":"percent","value":10}
DELETE /api/v1/admin/coupons?code=SALE`;

// Khối code cuộn ngang (không tràn trang).
function CodeBlock({ text }: { text: string }) {
  return (
    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
      <div style={{ overflowX: 'auto' }}>
        <pre style={{ margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre' }}>{text}</pre>
      </div>
    </Box>
  );
}

// CSS scoped cho tài liệu render từ markdown (nhúng trong component để khỏi sửa globals.css).
const GUIDE_CSS = `
.api-guide { font-size: 14px; line-height: 1.65; }
.api-guide h1 { font-size: 20px; margin: 20px 0 8px; }
.api-guide h2 { font-size: 17px; margin: 22px 0 8px; padding-top: 8px; border-top: 1px solid #e3e5e8; }
.api-guide h3 { font-size: 15px; margin: 16px 0 6px; }
.api-guide p { margin: 8px 0; }
.api-guide ul, .api-guide ol { margin: 8px 0 8px 22px; }
.api-guide li { margin: 3px 0; }
.api-guide code { background: #eef1f5; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 0.88em; }
.api-guide pre.md-code { background: #1c2530; color: #e6edf3; padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
.api-guide pre.md-code code { background: none; color: inherit; padding: 0; }
.api-guide table, .api-guide .md-table { width: 100%; border-collapse: collapse; margin: 10px 0; display: block; overflow-x: auto; }
.api-guide th, .api-guide td { border: 1px solid #dfe3e8; padding: 6px 10px; text-align: left; font-size: 13px; vertical-align: top; }
.api-guide th { background: #f3f5f7; }
.api-guide blockquote { border-left: 3px solid #c9cccf; margin: 10px 0; padding: 6px 12px; color: #5c6670; background: #f9fafb; }
.api-guide hr { border: none; border-top: 1px solid #e3e5e8; margin: 18px 0; }
`;

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt?: string;
  revoked?: boolean;
}

export function PlatformApiTokens() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const dlg = useAdminDialog();
  const [rows, setRows] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Record<Scope, boolean>>({ orders: true, users: true, biz: true, coupons: true });
  const [busy, setBusy] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [origin, setOrigin] = useState(''); // domain hiện tại: localhost khi dev, domain thật khi deploy
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  // Tài liệu theo locale hiện tại; thay {{BASE_URL}} bằng domain đang chạy (tính client-side, tránh lệch hydrate).
  const guideHtml = useMemo(
    () => (origin ? markdownToHtml(getApiGuideMd(locale).replaceAll('{{BASE_URL}}', origin)) : ''),
    [origin, locale],
  );

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/platform-api-tokens');
    if (r.ok) setRows((await r.json()).tokens ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setMsg(null);
    setPlaintext(null);
    try {
      const chosen = ALL_SCOPES.filter((s) => scopes[s]);
      const r = await fetch('/api/admin/platform-api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes: chosen }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setPlaintext(d.plaintext);
        setName('');
        await load();
      } else setMsg({ ok: false, text: apiErrText(d, t) });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    const ok = await dlg.confirm({ title: t('apiRevoke'), message: t('apiRevokeConfirm'), tone: 'critical', confirmText: t('apiRevoke') });
    if (!ok) return;
    await fetch(`/api/admin/platform-api-tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  }

  if (!rows)
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );

  const tableRows = rows.map((tk) => [
    <Text as="span" key={`p-${tk.id}`} fontWeight="medium"><code>{tk.prefix}…</code></Text>,
    tk.name,
    tk.scopes.join(', '),
    new Date(tk.createdAt).toLocaleDateString(),
    tk.lastUsedAt ? new Date(tk.lastUsedAt).toLocaleString() : t('apiNever'),
    tk.revoked ? (
      <Badge key={`b-${tk.id}`} tone="critical">{t('apiRevoked')}</Badge>
    ) : (
      <Button key={`r-${tk.id}`} size="slim" variant="plain" tone="critical" onClick={() => void revoke(tk.id)}>
        {t('apiRevoke')}
      </Button>
    ),
  ]);

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h3" variant="headingSm">{t('apiTitle')}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{t('apiHelp')}</Text>
      </BlockStack>

      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}
      {plaintext ? (
        <Banner tone="warning" title={t('apiTokenOnce')} onDismiss={() => setPlaintext(null)}>
          <BlockStack gap="200">
            <Box background="bg-surface-secondary" padding="200" borderRadius="200">
              <Text as="p" breakWord><code>{plaintext}</code></Text>
            </Box>
            <InlineStack>
              <Button size="slim" onClick={() => { void navigator.clipboard?.writeText(plaintext); setMsg({ ok: true, text: t('apiCopied') }); }}>
                {t('apiCopy')}
              </Button>
            </InlineStack>
          </BlockStack>
        </Banner>
      ) : null}

      <Card>
        <BlockStack gap="300">
          <Text as="h4" variant="headingSm">{t('apiCreate')}</Text>
          <TextField label={t('apiName')} value={name} onChange={setName} autoComplete="off" placeholder="Zapier / n8n / server..." />
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">{t('apiScopes')}</Text>
            <InlineStack gap="300" wrap>
              {ALL_SCOPES.map((s) => (
                <Checkbox key={s} label={s} checked={scopes[s]} onChange={(v) => setScopes((p) => ({ ...p, [s]: v }))} />
              ))}
            </InlineStack>
          </BlockStack>
          <InlineStack>
            <Button variant="primary" loading={busy} disabled={!name.trim() || !ALL_SCOPES.some((s) => scopes[s])} onClick={() => void create()}>
              {t('apiCreate')}
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      <Card padding="0">
        {rows.length === 0 ? (
          <Box padding="400"><Text as="p" tone="subdued">{t('apiEmpty')}</Text></Box>
        ) : (
          <DataTable
            columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
            headings={[t('apiColPrefix'), t('apiName'), t('apiScopes'), t('apiColCreated'), t('apiColLastUsed'), '']}
            rows={tableRows}
          />
        )}
      </Card>

      {/* Hướng dẫn ngay tại tab: quick-start + tài liệu đầy đủ (render từ markdown, có thể mở/thu). */}
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center" wrap gap="200">
            <Text as="h4" variant="headingSm">{t('apiGuideTitle')}</Text>
            <Button
              variant="plain"
              onClick={() => setGuideOpen((o) => !o)}
              ariaExpanded={guideOpen}
              ariaControls="api-guide-full"
              disclosure={guideOpen ? 'up' : 'down'}
            >
              {guideOpen ? t('apiGuideHide') : t('apiGuideShow')}
            </Button>
          </InlineStack>
          <Text as="p" tone="subdued" variant="bodySm">{t('apiGuideIntro')}</Text>
          <CodeBlock text={API_EXAMPLES} />
          <Banner tone="info"><Text as="p" variant="bodySm">{t('apiGuideEmailNote')}</Text></Banner>
          <Collapsible open={guideOpen} id="api-guide-full" transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}>
            <style>{GUIDE_CSS}</style>
            {/* markdownToHtml đã escape an toàn (không chèn HTML tùy ý) — xem lib/content/markdown.ts.
                guideHtml rỗng trên SSR/lần render đầu (origin chưa có) → chỉ render sau khi mount. */}
            {guideHtml ? <div className="api-guide" dangerouslySetInnerHTML={{ __html: guideHtml }} /> : null}
          </Collapsible>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

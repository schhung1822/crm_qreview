'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Icon,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Select,
  Spinner,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import { DeleteIcon, HideIcon, RefreshIcon, ViewIcon } from '@shopify/polaris-icons';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { AddConnectionModal, PROVIDER_CFG, type ConnectionProvider } from '@/components/AddConnectionModal';
import { ApifyKeysModal } from '@/components/ApifyKeysModal';
import { ProviderLogo } from '@/components/provider-logos';
import { PlusIcon } from '@/components/icons';
import { ExtLink } from '@/components/ui';
import { CMS_PROVIDERS, SOCIAL_PROVIDERS, isSocialProvider } from '@/lib/connection-providers';

type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'moonshot' | 'qwen' | 'minimax';

interface ProviderStatus {
  id: ProviderId;
  label: string;
  keyHint: string;
  hasKey: boolean;
  source: 'store' | 'env' | 'none';
  masked?: string;
  enabled: boolean;
  model: string;
  defaultModel: string;
}
interface StatusResponse {
  providers: ProviderStatus[];
  routing: Record<string, ProviderId>;
}
interface IntStatus {
  id: string;
  label: string;
  hintKey: string;
  hasKey: boolean;
  source: 'store' | 'env' | 'none';
  masked?: string;
}
interface Conn {
  id: string;
  provider: ConnectionProvider;
  label: string;
  baseUrl: string;
  locale: string;
  pathStrategy?: string;
  seoPlugin?: string;
  status: 'active' | 'error';
}
interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  revoked?: boolean;
}

// Phân loại: CMS · Mạng xã hội · AI · Khác (tích hợp/khác).
type Cat = 'cms' | 'social' | 'ai' | 'other';
const AI_PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'gemini', 'deepseek', 'moonshot', 'qwen', 'minimax'];
const CATS: Array<Cat | 'all'> = ['all', 'cms', 'social', 'ai', 'other'];
// Nhóm cho từng integration: Perplexity là engine AI (đo Lượt AI trích dẫn) → nhóm AI; còn lại → Khác.
const intCat = (id: string): Cat => (id === 'perplexity' ? 'ai' : 'other');

type AddTarget =
  | { kind: 'cms'; provider?: ConnectionProvider }
  | { kind: 'ai'; provider: ProviderId }
  | { kind: 'integration'; id: string }
  | { kind: 'dataforseo' }
  | { kind: 'drive' };
type DetailTarget =
  | { kind: 'cms'; id: string }
  | { kind: 'ai'; id: ProviderId }
  | { kind: 'integration'; id: string }
  | { kind: 'dataforseo'; id: string }
  | { kind: 'drive'; id: string };

export default function ConnectionsHubPage() {
  const t = useTranslations('settings');

  const [data, setData] = useState<StatusResponse | null>(null);
  const [integrations, setIntegrations] = useState<IntStatus[] | null>(null);
  const [connections, setConnections] = useState<Conn[] | null>(null);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [dfs, setDfs] = useState<DfsStatus | null>(null);
  const [apiTokens, setApiTokens] = useState<ApiToken[] | null>(null);
  const [apiTokenName, setApiTokenName] = useState('');
  const [newApiToken, setNewApiToken] = useState('');
  const [apiTokenError, setApiTokenError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [add, setAdd] = useState<AddTarget | null>(null);
  const [chooser, setChooser] = useState(false);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [tab, setTab] = useState(0); // 0 Tất cả · 1 CMS · 2 Mạng xã hội · 3 AI · 4 Khác
  // Pool nhiều key Apify (quản lý ở modal riêng, không phải integration key đơn).
  const [apify, setApify] = useState<{ keys: { id: string; masked: string; addedAt: string }[]; usingFallback: boolean } | null>(null);
  const [apifyOpen, setApifyOpen] = useState(false);
  // Xác nhận xóa: phải gõ "DELETE" mới xóa (tránh xóa nhầm kết nối - key/mật khẩu mất là không khôi phục được).
  const [confirmDel, setConfirmDel] = useState<{ target: DetailTarget; name: string } | null>(null);
  const [delText, setDelText] = useState('');

  // Tile hoạt động như bộ lọc: đặt tab danh mục tương ứng.
  function selectCat(c: Cat | 'all') {
    setTab(CATS.indexOf(c));
  }

  const loadAi = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-keys');
      if (res.ok) setData(await res.json());
      else setData({ providers: [], routing: {} });
    } catch {
      setData({ providers: [], routing: {} });
    }
  }, []);
  const loadInt = useCallback(async () => {
    try {
      const res = await fetch('/api/integration-keys');
      setIntegrations(res.ok ? (await res.json()).integrations : []);
    } catch {
      setIntegrations([]);
    }
  }, []);
  const loadConns = useCallback(async () => {
    try {
      const res = await fetch('/api/connections');
      setConnections(res.ok ? (await res.json()).connections : []);
    } catch {
      setConnections([]);
    }
  }, []);
  const loadDrive = useCallback(async () => {
    try {
      const res = await fetch('/api/drive/status');
      setDrive(res.ok ? await res.json() : { configured: false, connected: false, credSource: 'none' });
    } catch {
      setDrive({ configured: false, connected: false, credSource: 'none' });
    }
  }, []);
  const loadDfs = useCallback(async () => {
    try {
      const res = await fetch('/api/dataforseo/status');
      setDfs(res.ok ? await res.json() : { configured: false, credSource: 'none' });
    } catch {
      setDfs({ configured: false, credSource: 'none' });
    }
  }, []);
  const loadApify = useCallback(async () => {
    try {
      const res = await fetch('/api/integration-keys/apify');
      setApify(res.ok ? await res.json() : { keys: [], usingFallback: false });
    } catch {
      setApify({ keys: [], usingFallback: false });
    }
  }, []);
  const loadApiTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/api-tokens');
      setApiTokens(res.ok ? (await res.json()).tokens : []);
    } catch {
      setApiTokens([]);
    }
  }, []);
  const reloadAll = useCallback(async () => {
    await Promise.all([loadAi(), loadInt(), loadConns(), loadDrive(), loadDfs(), loadApify(), loadApiTokens()]);
  }, [loadAi, loadInt, loadConns, loadDrive, loadDfs, loadApify, loadApiTokens]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  const providers = data?.providers ?? [];
  const ints = integrations ?? [];
  const conns = connections ?? [];
  const cmsConns = conns.filter((connection) => !isSocialProvider(connection.provider));
  const socialConns = conns.filter((connection) => isSocialProvider(connection.provider));
  const loading = data === null || integrations === null || connections === null;

  // ── Đếm cho tiles ──
  // Perplexity (integration nhóm AI) đếm chung với các provider AI; PageSpeed + Google Drive vào "Khác".
  const driveConnected = drive?.connected ? 1 : 0;
  const dfsConfigured = dfs?.configured ? 1 : 0;
  const apifyConfigured = apify?.keys?.length || apify?.usingFallback ? 1 : 0;
  const activeApiTokenCount = apiTokens?.filter((token) => !token.revoked).length ?? 0;
  const aiCount =
    providers.filter((p) => p.hasKey).length + ints.filter((i) => i.hasKey && intCat(i.id) === 'ai').length;
  const intCount =
    ints.filter((i) => i.hasKey && intCat(i.id) === 'other').length +
    driveConnected +
    dfsConfigured +
    apifyConfigured +
    activeApiTokenCount;
  const total = aiCount + conns.length + intCount;

  const cat = CATS[tab];
  const show = (c: Cat) => cat === 'all' || cat === c;

  // ── Danh sách đã cấu hình (gộp) ──
  const items: Array<{
    key: string;
    target: DetailTarget;
    cat: Cat;
    name: string;
    sub: string;
    logo: React.ReactNode;
    ok: boolean;
    statusLabel: string;
    canDelete: boolean;
    onView?: () => void; // ghi đè hành động Xem (vd Apify mở popup pool thay vì detail modal)
  }> = [];
  for (const c of conns) {
    items.push({
      key: `connection-${c.id}`,
      target: { kind: 'cms', id: c.id },
      cat: isSocialProvider(c.provider) ? 'social' : 'cms',
      name: c.label,
      sub: `${PROVIDER_CFG[c.provider]?.name ?? c.provider} · ${c.baseUrl}`,
      logo: <ProviderLogo id={c.provider} size={34} />,
      ok: c.status === 'active',
      statusLabel: c.status === 'active' ? t('reportAvailable') : t('reportError'),
      canDelete: true,
    });
  }
  for (const p of providers.filter((x) => x.hasKey)) {
    items.push({
      key: `ai-${p.id}`,
      target: { kind: 'ai', id: p.id },
      cat: 'ai',
      name: p.label,
      sub: `AI · ${p.model}${p.source === 'env' ? ' (env)' : ''}`,
      logo: <ProviderLogo id={p.id} label={p.label} size={34} />,
      ok: p.enabled,
      statusLabel: p.enabled ? t('reportAvailable') : t('reportDisabled'),
      canDelete: p.source === 'store',
    });
  }
  for (const it of ints.filter((x) => x.hasKey)) {
    items.push({
      key: `int-${it.id}`,
      target: { kind: 'integration', id: it.id },
      cat: intCat(it.id),
      name: it.label,
      sub: `${t('typeIntegration')}${it.source === 'env' ? ' · (env)' : ''}`,
      logo: <ProviderLogo id={it.id} label={it.label} size={34} />,
      ok: it.hasKey,
      statusLabel: t('reportAvailable'),
      canDelete: it.source === 'store',
    });
  }
  // DataForSEO (số liệu từ khóa/SERP thật) — hiển thị chung danh sách, nhóm Khác.
  if (dfs?.configured) {
    items.push({
      key: 'dataforseo',
      target: { kind: 'dataforseo', id: 'dataforseo' },
      cat: 'other',
      name: 'DataForSEO',
      sub: `${t('typeIntegration')}${dfs.login ? ` · ${dfs.login}` : ''}${dfs.credSource === 'env' ? ' · (env)' : ''}`,
      logo: <ProviderLogo id="dataforseo" label="DataForSEO" size={34} />,
      ok: true,
      statusLabel: t('reportAvailable'),
      canDelete: dfs.credSource === 'store',
    });
  }
  // Google Drive (đồng bộ bài viết) — hiển thị chung danh sách khi ĐÃ nhập thông tin, nhóm Khác.
  if (drive && drive.credSource !== 'none') {
    items.push({
      key: 'drive',
      target: { kind: 'drive', id: 'drive' },
      cat: 'other',
      name: 'Google Drive',
      sub: `${t('typeIntegration')}${drive.email ? ` · ${drive.email}` : ''}${drive.credSource === 'env' ? ' · (env)' : ''}`,
      logo: <ProviderLogo id="googledrive" label="Google Drive" size={34} />,
      ok: drive.connected,
      statusLabel: drive.connected ? t('driveConnected') : t('driveNotConnected'),
      canDelete: drive.credSource === 'store',
    });
  }

  // Apify (Báo cáo Social) - POOL nhiều key. Hiện ở danh sách ĐÃ KẾT NỐI khi đã có key (hoặc đang
  // dùng key môi trường/cũ); bấm Xem → mở popup quản lý pool (thêm 1 hoặc nhiều key).
  if (apify && (apify.keys.length > 0 || apify.usingFallback)) {
    items.push({
      key: 'apify',
      target: { kind: 'integration', id: 'apify' },
      cat: 'other',
      name: 'Apify',
      sub: `${t('typeIntegration')} · ${apify.keys.length ? t('apify.count', { n: apify.keys.length }) : t('configured')}`,
      logo: <ProviderLogo id="apify" label="Apify" size={34} />,
      ok: true,
      statusLabel: t('reportAvailable'),
      canDelete: false,
      onView: () => setApifyOpen(true),
    });
  }

  // Tên hiển thị của kết nối (cho popup xác nhận).
  function nameOfTarget(target: DetailTarget): string {
    const found = items.find((i) => i.target.kind === target.kind && i.target.id === target.id);
    if (found) return found.name;
    if (target.kind === 'dataforseo') return 'DataForSEO';
    if (target.kind === 'drive') return 'Google Drive';
    return target.id;
  }

  // Nhấn xóa → MỞ POPUP XÁC NHẬN (gõ DELETE) thay vì xóa ngay. Áp cho MỌI đường xóa (nút thùng rác
  // + nút xóa trong modal chi tiết) vì tất cả đều gọi deleteItem.
  async function deleteItem(target: DetailTarget) {
    setDelText('');
    setConfirmDel({ target, name: nameOfTarget(target) });
  }

  // Xóa THẬT (chỉ chạy sau khi người dùng gõ đúng "DELETE" ở popup xác nhận).
  async function performDelete(target: DetailTarget) {
    setBusy(`del-${target.kind}-${target.id}`);
    try {
      if (target.kind === 'cms') await fetch(`/api/connections?id=${target.id}`, { method: 'DELETE' });
      else if (target.kind === 'ai') await fetch(`/api/ai-keys?provider=${target.id}`, { method: 'DELETE' });
      else if (target.kind === 'dataforseo') await fetch('/api/dataforseo/config', { method: 'DELETE' });
      else if (target.kind === 'drive') {
        // Gỡ hoàn toàn Google Drive: ngắt kết nối (xóa token) + xóa OAuth credential đã lưu.
        await fetch('/api/drive/disconnect', { method: 'POST' }).catch(() => {});
        await fetch('/api/drive/config', { method: 'DELETE' });
      } else await fetch(`/api/integration-keys?id=${target.id}`, { method: 'DELETE' });
      await reloadAll();
      setDetail(null);
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!confirmDel || delText !== 'DELETE') return;
    const target = confirmDel.target;
    setConfirmDel(null);
    setDelText('');
    await performDelete(target);
  }

  async function createApiToken() {
    const name = apiTokenName.trim();
    if (!name) {
      setApiTokenError('Nhap ten token de de nhan dien.');
      return;
    }
    setBusy('api-token-create');
    setApiTokenError('');
    setNewApiToken('');
    try {
      const res = await fetch('/api/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiTokenError(payload.error || 'Khong tao duoc API token.');
        return;
      }
      setNewApiToken(payload.plaintext || '');
      setApiTokenName('');
      await loadApiTokens();
    } finally {
      setBusy(null);
    }
  }

  async function revokeApiToken(id: string) {
    setBusy(`api-token-${id}`);
    setApiTokenError('');
    try {
      const res = await fetch(`/api/api-tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiTokenError(payload.error || 'Khong thu hoi duoc API token.');
        return;
      }
      setApiTokens(payload.tokens ?? []);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page
      title={t('title')}
      subtitle={t('subtitle')}
      primaryAction={{ content: t('addConnection'), icon: PlusIcon, onAction: () => setChooser(true) }}
    >
      <BlockStack gap="400">
        <Banner tone="info">{t('securityNote')}</Banner>

        {/* ── Tiles tổng quan — bấm để LỌC (đúng như các tab danh mục) ── */}
        <InlineGrid columns={{ xs: 2, sm: 5 }} gap="300">
          <Tile label={t('total')} count={total} strong active={cat === 'all'} onClick={() => selectCat('all')} />
          <Tile label="CMS" count={cmsConns.length} active={cat === 'cms'} onClick={() => selectCat('cms')} />
          <Tile label="Mạng xã hội" count={socialConns.length} active={cat === 'social'} onClick={() => selectCat('social')} />
          <Tile label="AI" count={aiCount} active={cat === 'ai'} onClick={() => selectCat('ai')} />
          <Tile label={t('tabOther')} count={intCount} active={cat === 'other'} onClick={() => selectCat('other')} />
        </InlineGrid>

        {/* ── Bộ lọc CMS · AI · Khác ── */}
        <Tabs
          selected={tab}
          onSelect={setTab}
          tabs={[
            { id: 'all', content: t('tabAll') },
            { id: 'cms', content: 'CMS' },
            { id: 'social', content: 'Mạng xã hội' },
            { id: 'ai', content: 'AI' },
            { id: 'other', content: t('tabOther') },
          ]}
        />

        {/* ── Có thể thêm ── */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('addableTitle')}
            </Text>
            <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
              {show('cms') &&
                CMS_PROVIDERS.map((p) => (
                  <AddCard
                    key={p}
                    logo={<ProviderLogo id={p} size={30} />}
                    name={PROVIDER_CFG[p].name}
                    type="CMS"
                    cta={t('addNew')}
                    onClick={() => setAdd({ kind: 'cms', provider: p })}
                  />
                ))}
              {show('social') &&
                SOCIAL_PROVIDERS.map((p) => (
                  <AddCard
                    key={p}
                    logo={<ProviderLogo id={p} size={30} />}
                    name={PROVIDER_CFG[p].name}
                    type="Mạng xã hội"
                    cta={t('addNew')}
                    onClick={() => setAdd({ kind: 'cms', provider: p })}
                  />
                ))}
              {show('ai') &&
                providers.map((p) => (
                  <AddCard
                    key={p.id}
                    logo={<ProviderLogo id={p.id} label={p.label} size={30} />}
                    name={p.label}
                    type="AI"
                    cta={p.hasKey ? t('configured') : t('addNew')}
                    onClick={() => (p.hasKey ? setDetail({ kind: 'ai', id: p.id }) : setAdd({ kind: 'ai', provider: p.id }))}
                  />
                ))}
              {ints
                .filter((it) => show(intCat(it.id)))
                .map((it) => (
                  <AddCard
                    key={it.id}
                    logo={<ProviderLogo id={it.id} label={it.label} size={30} />}
                    name={it.label}
                    type={t('typeIntegration')}
                    cta={it.hasKey ? t('configured') : t('addNew')}
                    onClick={() =>
                      it.hasKey ? setDetail({ kind: 'integration', id: it.id }) : setAdd({ kind: 'integration', id: it.id })
                    }
                  />
                ))}
              {show('other') ? (
                <AddCard
                  logo={<ProviderLogo id="dataforseo" label="DataForSEO" size={30} />}
                  name="DataForSEO"
                  type={t('typeIntegration')}
                  cta={dfs?.configured ? t('configured') : t('addNew')}
                  onClick={() =>
                    dfs?.configured ? setDetail({ kind: 'dataforseo', id: 'dataforseo' }) : setAdd({ kind: 'dataforseo' })
                  }
                />
              ) : null}
              {show('other') ? (
                <AddCard
                  logo={<ProviderLogo id="googledrive" label="Google Drive" size={30} />}
                  name="Google Drive"
                  type={t('typeIntegration')}
                  cta={drive?.connected ? t('driveConnected') : drive?.credSource !== 'none' ? t('configured') : t('addNew')}
                  onClick={() =>
                    drive && drive.credSource !== 'none'
                      ? setDetail({ kind: 'drive', id: 'drive' })
                      : setAdd({ kind: 'drive' })
                  }
                />
              ) : null}
              {/* Apify (Báo cáo Social): POOL nhiều key - mở modal quản lý riêng (không phải key đơn). */}
              {show('other') ? (
                <AddCard
                  logo={<ProviderLogo id="apify" label="Apify" size={30} />}
                  name="Apify"
                  type={t('typeIntegration')}
                  cta={
                    apify?.keys?.length
                      ? t('apify.count', { n: apify.keys.length })
                      : apify?.usingFallback
                        ? t('configured')
                        : t('addNew')
                  }
                  onClick={() => setApifyOpen(true)}
                />
              ) : null}
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* ── Danh sách đã kết nối ── */}
        {show('other') ? (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">
                    API token cho API ngoài
                  </Text>
                  <Text as="p" tone="subdued">
                    Tạo token để n8n hoặc hệ thống bên ngoài gọi API tạo bài đăng mạng xã hội chờ duyệt.
                  </Text>
                </BlockStack>
                <Badge tone={activeApiTokenCount > 0 ? 'success' : undefined}>{`${activeApiTokenCount} active`}</Badge>
              </InlineStack>

              {apiTokenError ? <Banner tone="critical">{apiTokenError}</Banner> : null}
              {newApiToken ? (
                <Banner tone="success">
                  Token mới chỉ hiển thị một lần. Hãy lưu lại trước khi đóng trang.
                  <Box paddingBlockStart="200">
                    <TextField label="Bearer token" value={newApiToken} readOnly autoComplete="off" />
                  </Box>
                </Banner>
              ) : null}

              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                <TextField
                  label="Tên token"
                  value={apiTokenName}
                  onChange={setApiTokenName}
                  placeholder="Ví dụ: n8n production"
                  autoComplete="off"
                />
                <div style={{ display: 'flex', alignItems: 'end' }}>
                  <Button variant="primary" loading={busy === 'api-token-create'} onClick={() => void createApiToken()}>
                    Tạo token
                  </Button>
                </div>
              </InlineGrid>

              {apiTokens === null ? (
                <Spinner size="small" />
              ) : apiTokens.length === 0 ? (
                <Text as="p" tone="subdued">
                  Chưa có API token nào.
                </Text>
              ) : (
                <BlockStack gap="200">
                  {apiTokens.map((token) => (
                    <Box key={token.id} padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                        <BlockStack gap="050">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="p" fontWeight="semibold">
                              {token.name}
                            </Text>
                            <Badge tone={token.revoked ? 'critical' : 'success'}>
                              {token.revoked ? 'Đã thu hồi' : 'Active'}
                            </Badge>
                          </InlineStack>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {token.prefix}... · tạo {new Date(token.createdAt).toLocaleString('vi-VN')}
                            {token.lastUsedAt ? ` · dùng lần cuối ${new Date(token.lastUsedAt).toLocaleString('vi-VN')}` : ''}
                          </Text>
                        </BlockStack>
                        <Button
                          tone="critical"
                          disabled={Boolean(token.revoked)}
                          loading={busy === `api-token-${token.id}`}
                          onClick={() => void revokeApiToken(token.id)}
                        >
                          Thu hồi
                        </Button>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        ) : null}

        <Card padding="0">
          <Box padding="400" borderBlockEndWidth="025" borderColor="border">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">
                {t('configuredTitle')}
              </Text>
              <Button variant="tertiary" icon={RefreshIcon} onClick={() => void reloadAll()} accessibilityLabel={t('refresh')} />
            </InlineStack>
          </Box>
          {loading ? (
            <Box padding="400">
              <Spinner size="small" />
            </Box>
          ) : items.filter((it) => show(it.cat)).length === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued">
                {t('emptyList')}
              </Text>
            </Box>
          ) : (
            <BlockStack gap="0">
              {items.filter((it) => show(it.cat)).map((it) => (
                <Box key={it.key} padding="400" borderBlockEndWidth="025" borderColor="border">
                  <InlineStack gap="300" blockAlign="center" wrap={false}>
                    {it.logo}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text as="p" fontWeight="semibold">
                        {it.name}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued" truncate>
                        {it.sub}
                      </Text>
                    </div>
                    <Badge tone={it.ok ? 'success' : 'critical'}>{it.statusLabel}</Badge>
                    <Button
                      variant="tertiary"
                      icon={ViewIcon}
                      onClick={() => (it.onView ? it.onView() : setDetail(it.target))}
                      accessibilityLabel={t('viewDetail')}
                    />
                    {it.canDelete ? (
                      <Button
                        variant="tertiary"
                        tone="critical"
                        icon={DeleteIcon}
                        loading={busy === `del-${it.target.kind}-${it.target.id}`}
                        onClick={() => deleteItem(it.target)}
                        accessibilityLabel={t('delete')}
                      />
                    ) : (
                      // Giữ chỗ ĐÚNG kích thước nút xóa (ẩn) để badge + nút Xem thẳng hàng với các dòng khác.
                      <div aria-hidden style={{ visibility: 'hidden' }}>
                        <Button variant="tertiary" tone="critical" icon={DeleteIcon} accessibilityLabel="" />
                      </div>
                    )}
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          )}
        </Card>

        <Text as="p" tone="subdued" variant="bodySm">
          {t('envHint')}
        </Text>
      </BlockStack>

      {/* ── Modal quản lý pool key Apify ── */}
      <ApifyKeysModal open={apifyOpen} onClose={() => setApifyOpen(false)} onChanged={() => void loadApify()} />

      {/* ── Popup XÁC NHẬN xóa: phải gõ "DELETE" ── */}
      {confirmDel ? (
        <Modal
          open
          onClose={() => {
            setConfirmDel(null);
            setDelText('');
          }}
          title={t('deleteConfirmTitle')}
          primaryAction={{
            content: t('delete'),
            destructive: true,
            disabled: delText !== 'DELETE',
            loading: busy === `del-${confirmDel.target.kind}-${confirmDel.target.id}`,
            onAction: () => void confirmDelete(),
          }}
          secondaryActions={[
            {
              content: t('cancel'),
              onAction: () => {
                setConfirmDel(null);
                setDelText('');
              },
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p">{t('deleteConfirmDesc', { name: confirmDel.name })}</Text>
              <TextField
                label={t('deleteConfirmLabel')}
                value={delText}
                onChange={setDelText}
                autoComplete="off"
                placeholder="DELETE"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      ) : null}

      {/* ── Modal chọn loại để thêm ── */}
      {chooser ? (
        <Modal open onClose={() => setChooser(false)} title={t('chooserTitle')}>
          <Modal.Section>
            <InlineGrid columns={{ xs: 2, sm: 3 }} gap="300">
              {CMS_PROVIDERS.map((p) => (
                <AddCard
                  key={p}
                  logo={<ProviderLogo id={p} size={30} />}
                  name={PROVIDER_CFG[p].name}
                  type="CMS"
                  cta={t('addNew')}
                  onClick={() => {
                    setChooser(false);
                    setAdd({ kind: 'cms', provider: p });
                  }}
                />
              ))}
              {SOCIAL_PROVIDERS.map((p) => (
                <AddCard
                  key={p}
                  logo={<ProviderLogo id={p} size={30} />}
                  name={PROVIDER_CFG[p].name}
                  type="Mạng xã hội"
                  cta={t('addNew')}
                  onClick={() => {
                    setChooser(false);
                    setAdd({ kind: 'cms', provider: p });
                  }}
                />
              ))}
              {AI_PROVIDERS.map((id) => {
                const p = providers.find((x) => x.id === id);
                return (
                  <AddCard
                    key={id}
                    logo={<ProviderLogo id={id} label={p?.label ?? id} size={30} />}
                    name={p?.label ?? id}
                    type="AI"
                    cta={t('addNew')}
                    onClick={() => {
                      setChooser(false);
                      setAdd({ kind: 'ai', provider: id });
                    }}
                  />
                );
              })}
              {ints.map((it) => (
                <AddCard
                  key={it.id}
                  logo={<ProviderLogo id={it.id} label={it.label} size={30} />}
                  name={it.label}
                  type={t('typeIntegration')}
                  cta={t('addNew')}
                  onClick={() => {
                    setChooser(false);
                    setAdd({ kind: 'integration', id: it.id });
                  }}
                />
              ))}
              {/* Google Drive: chọn → mở popup nhập OAuth credential / kết nối (nhất quán kết nối khác). */}
              <AddCard
                logo={<ProviderLogo id="googledrive" size={30} />}
                name="Google Drive"
                type={t('typeIntegration')}
                cta={t('addNew')}
                onClick={() => {
                  setChooser(false);
                  if (drive && drive.credSource !== 'none') setDetail({ kind: 'drive', id: 'drive' });
                  else setAdd({ kind: 'drive' });
                }}
              />
              {/* DataForSEO: chọn → mở popup nhập login/password (nhất quán với các kết nối khác). */}
              <AddCard
                logo={<ProviderLogo id="dataforseo" size={30} />}
                name="DataForSEO"
                type={t('typeIntegration')}
                cta={t('addNew')}
                onClick={() => {
                  setChooser(false);
                  setAdd({ kind: 'dataforseo' });
                }}
              />
            </InlineGrid>
          </Modal.Section>
        </Modal>
      ) : null}

      {/* ── Modal thêm ── */}
      {add?.kind === 'cms' ? (
        <AddConnectionModal
          presetProvider={add.provider}
          onClose={() => setAdd(null)}
          onSaved={async () => {
            setAdd(null);
            await loadConns();
          }}
        />
      ) : null}
      {add?.kind === 'ai' ? (
        <AddAiKeyModal
          provider={add.provider}
          providerLabel={providers.find((p) => p.id === add.provider)?.label ?? add.provider}
          keyHint={providers.find((p) => p.id === add.provider)?.keyHint ?? ''}
          onClose={() => setAdd(null)}
          onSaved={async () => {
            setAdd(null);
            await loadAi();
          }}
        />
      ) : null}
      {add?.kind === 'integration' ? (
        <AddIntegrationModal
          integration={ints.find((i) => i.id === add.id) ?? null}
          onClose={() => setAdd(null)}
          onSaved={async () => {
            setAdd(null);
            await loadInt();
          }}
        />
      ) : null}
      {add?.kind === 'dataforseo' ? (
        <AddDataForSeoModal
          configured={false}
          onClose={() => setAdd(null)}
          onSaved={async () => {
            setAdd(null);
            await loadDfs();
          }}
        />
      ) : null}
      {add?.kind === 'drive' ? (
        <DriveModal st={drive} reload={loadDrive} onClose={() => setAdd(null)} />
      ) : null}

      {/* ── Modal chi tiết ── */}
      {detail?.kind === 'dataforseo' ? (
        <AddDataForSeoModal
          configured={dfs?.configured ?? false}
          canDelete={dfs?.credSource === 'store'}
          onDelete={async () => {
            await deleteItem({ kind: 'dataforseo', id: 'dataforseo' });
          }}
          onClose={() => setDetail(null)}
          onSaved={async () => {
            setDetail(null);
            await loadDfs();
          }}
        />
      ) : detail?.kind === 'drive' ? (
        <DriveModal st={drive} reload={loadDrive} onClose={() => setDetail(null)} />
      ) : detail ? (
        <DetailModal
          target={detail}
          providers={providers}
          ints={ints}
          conns={conns}
          busy={busy}
          setBusy={setBusy}
          onClose={() => setDetail(null)}
          onChanged={reloadAll}
          onDelete={deleteItem}
        />
      ) : null}
    </Page>
  );
}

// ── Tile đếm ──
interface DriveStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  credSource: 'store' | 'env' | 'none';
  redirectUri?: string;
}

interface DfsStatus {
  configured: boolean;
  credSource: 'store' | 'env' | 'none';
  login?: string;
}

// Google Drive: POPUP (nhất quán với các kết nối khác). Nhập OAuth credential ngay trong UI
// (lưu mã hóa) → kết nối (OAuth) → ngắt. `st` lấy từ hub; reload để tile/danh sách cập nhật.
function DriveModal({
  st,
  reload,
  onClose,
}: {
  st: DriveStatus | null;
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('settings');
  const [busy, setBusy] = useState<'save' | 'clear' | 'disconnect' | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  async function saveCreds() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setBusy('save');
    try {
      const res = await fetch('/api/drive/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      if (res.ok) {
        setShowForm(false);
        setClientId('');
        setClientSecret('');
        await reload();
      }
    } finally {
      setBusy(null);
    }
  }
  async function clearCreds() {
    setBusy('clear');
    try {
      await fetch('/api/drive/config', { method: 'DELETE' });
      await reload();
    } finally {
      setBusy(null);
    }
  }
  async function disconnect() {
    setBusy('disconnect');
    try {
      await fetch('/api/drive/disconnect', { method: 'POST' });
      await reload();
    } finally {
      setBusy(null);
    }
  }
  function connectDrive() {
    // OAuth cần điều hướng toàn trang qua API callback, không dùng router phía client.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/api/drive/auth');
  }

  if (!st) {
    return (
      <Modal open onClose={onClose} title={`${t('addIntegration')} · Google Drive`}>
        <Modal.Section>
          <Box padding="400">
            <Spinner size="small" />
          </Box>
        </Modal.Section>
      </Modal>
    );
  }
  const formOpen = showForm || st.credSource === 'none';

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('addIntegration')} · Google Drive`}
      secondaryActions={[{ content: t('close'), onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <ProviderLogo id="googledrive" label="Google Drive" size={30} />
            {st.connected ? (
              <Badge tone="success">{t('driveConnected')}</Badge>
            ) : (
              <Badge>{t('driveNotConnected')}</Badge>
            )}
          </InlineStack>

          {!formOpen ? (
            <BlockStack gap="300">
              <Text as="span" tone="subdued" variant="bodySm">
                {st.connected ? (st.email ? t('driveAs', { email: st.email }) : t('driveOn')) : t('driveDesc')}
              </Text>
              <InlineStack gap="200" wrap>
                {st.connected ? (
                  <Button loading={busy === 'disconnect'} onClick={disconnect}>
                    {t('driveDisconnect')}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={connectDrive}>
                    {t('driveConnect')}
                  </Button>
                )}
                {st.credSource === 'store' ? (
                  <Button variant="tertiary" onClick={() => setShowForm(true)}>
                    {t('driveEditCreds')}
                  </Button>
                ) : null}
              </InlineStack>
            </BlockStack>
          ) : (
            <BlockStack gap="300">
              <Text as="span" tone="subdued" variant="bodySm">
                {t('driveSetupHint')}
              </Text>
              {st.redirectUri ? (
                <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                  <BlockStack gap="050">
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {t('driveRedirectHint')}
                    </Text>
                    <Text as="span" variant="bodySm" breakWord>
                      <code>{st.redirectUri}</code>
                    </Text>
                  </BlockStack>
                </Box>
              ) : null}
              <TextField
                label={t('driveClientId')}
                value={clientId}
                onChange={setClientId}
                autoComplete="off"
                placeholder="1234567890-abc.apps.googleusercontent.com"
              />
              <TextField
                label={t('driveClientSecret')}
                value={clientSecret}
                onChange={setClientSecret}
                autoComplete="off"
                type="password"
                placeholder="GOCSPX-..."
              />
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  loading={busy === 'save'}
                  disabled={!clientId.trim() || !clientSecret.trim()}
                  onClick={saveCreds}
                >
                  {t('driveSaveCreds')}
                </Button>
                {st.credSource !== 'none' ? (
                  <Button onClick={() => setShowForm(false)}>{t('driveCancel')}</Button>
                ) : null}
                {st.credSource === 'store' ? (
                  <Button tone="critical" variant="tertiary" loading={busy === 'clear'} onClick={clearCreds}>
                    {t('driveClearCreds')}
                  </Button>
                ) : null}
              </InlineStack>
            </BlockStack>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// DataForSEO: popup nhập login + password (Basic auth) — NHẤT QUÁN với các kết nối/API key khác.
// Test → gọi API thật (số dư tài khoản). Dùng cho cả THÊM MỚI và XEM/SỬA (khi đã cấu hình).
// Password lưu mã hóa; cấp số liệu từ khóa/SERP thật cho hệ thống.
function AddDataForSeoModal({
  configured,
  canDelete,
  onDelete,
  onClose,
  onSaved,
}: {
  configured: boolean;
  canDelete?: boolean;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations('settings');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const filled = Boolean(login.trim() && password.trim());

  async function save() {
    if (!filled) return;
    setSaving(true);
    try {
      const res = await fetch('/api/dataforseo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password: password.trim() }),
      });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  }
  async function test() {
    setTesting(true);
    setResult(null);
    try {
      // Có nhập login+password → test creds đang nhập; để trống → test creds đã lưu.
      const body = filled ? { login: login.trim(), password: password.trim() } : {};
      const res = await fetch('/api/dataforseo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setResult({ ok: true, msg: t('dfsBalance', { amount: `${data.balance} ${data.currency}` }) });
      } else {
        setResult({ ok: false, msg: data?.error || t('dfsTestFail') });
      }
    } catch {
      setResult({ ok: false, msg: t('dfsTestFail') });
    } finally {
      setTesting(false);
    }
  }
  async function remove() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('addIntegration')} · DataForSEO`}
      primaryAction={{ content: t('dfsSaveCreds'), onAction: save, loading: saving, disabled: !filled }}
      secondaryActions={[
        { content: t('dfsTest'), onAction: test, loading: testing, disabled: !filled && !configured },
        ...(configured && canDelete && onDelete
          ? [{ content: t('dfsClearCreds'), onAction: remove, loading: deleting, destructive: true }]
          : []),
        { content: t('cancel'), onAction: onClose },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" tone="subdued" variant="bodySm">
            {t('dfsDesc')}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            {t('dfsSetupHint')} <ExtLink href="https://app.dataforseo.com/api-access">app.dataforseo.com</ExtLink>
          </Text>
          {configured ? <Banner tone="info">{t('dfsConfiguredHint')}</Banner> : null}
          <TextField
            label={t('dfsLogin')}
            value={login}
            onChange={setLogin}
            autoComplete="off"
            placeholder="you@example.com"
          />
          <KeyField
            label={t('dfsPassword')}
            value={password}
            type={reveal ? 'text' : 'password'}
            placeholder="••••••••"
            revealed={reveal}
            onToggle={() => setReveal((v) => !v)}
            onChange={setPassword}
          />
          {result ? <Banner tone={result.ok ? 'success' : 'critical'}>{result.msg}</Banner> : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function Tile({
  label,
  count,
  strong,
  active,
  onClick,
}: {
  label: string;
  count: number;
  strong?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <Box
      background={active ? 'bg-surface-selected' : strong ? 'bg-surface-secondary' : 'bg-surface'}
      borderColor={active ? 'border-emphasis' : 'border'}
      borderWidth={active ? '050' : '025'}
      borderRadius="300"
      padding="300"
    >
      <BlockStack gap="050">
        <Text as="span" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="span" variant="headingLg" fontWeight="bold">
          {count}
        </Text>
      </BlockStack>
    </Box>
  );
  if (!onClick) return inner;
  return (
    <button type="button" onClick={onClick} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      {inner}
    </button>
  );
}

// ── Thẻ "Có thể thêm" ──
function AddCard({
  logo,
  name,
  type,
  cta,
  onClick,
}: {
  logo: React.ReactNode;
  name: string;
  type: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <Box borderColor="border" borderWidth="025" borderRadius="300" padding="300">
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          {logo}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text as="p" variant="bodySm" fontWeight="semibold" truncate>
              {name}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {type} · {cta}
            </Text>
          </div>
        </InlineStack>
      </Box>
    </button>
  );
}

// ── Ô nhập/hiện API key có nút con mắt ──
function KeyField({
  label,
  value,
  type,
  readOnly,
  placeholder,
  revealed,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  type: 'text' | 'password';
  readOnly?: boolean;
  placeholder?: string;
  revealed: boolean;
  onToggle: () => void;
  onChange?: (v: string) => void;
}) {
  return (
    <TextField
      label={label}
      type={type}
      readOnly={readOnly}
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={onChange ?? (() => {})}
      suffix={
        value ? (
          <button
            type="button"
            onClick={onToggle}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
          >
            <Icon source={revealed ? HideIcon : ViewIcon} tone="subdued" />
          </button>
        ) : undefined
      }
    />
  );
}

// ── Modal nhập API key AI ──
function AddAiKeyModal({
  provider,
  providerLabel,
  keyHint,
  onClose,
  onSaved,
}: {
  provider: ProviderId;
  providerLabel: string;
  keyHint: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations('settings');
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: key.trim() || undefined }),
      });
      const j = await res.json();
      setResult({ ok: Boolean(j.ok), msg: j.ok ? t('testOk') : j.error ?? t('testFail') });
    } finally {
      setTesting(false);
    }
  }
  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setKey', provider, key: key.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) await onSaved();
      else setResult({ ok: false, msg: data?.error ?? t('testFail') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('addAiKey')} · ${providerLabel}`}
      primaryAction={{ content: t('saveKey'), onAction: save, loading: saving, disabled: !key.trim() }}
      secondaryActions={[
        { content: t('testConnection'), onAction: test, loading: testing, disabled: !key.trim() },
        { content: t('cancel'), onAction: onClose },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <KeyField
            label={t('apiKey')}
            value={key}
            type={reveal ? 'text' : 'password'}
            placeholder={keyHint}
            revealed={reveal}
            onToggle={() => setReveal((v) => !v)}
            onChange={setKey}
          />
          {result ? <Banner tone={result.ok ? 'success' : 'critical'}>{result.msg}</Banner> : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Modal nhập key tích hợp (PageSpeed…) ──
function AddIntegrationModal({
  integration,
  onClose,
  onSaved,
}: {
  integration: IntStatus | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations('settings');
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!integration) return null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/integration-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: integration!.id, value: value.trim() }),
      });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('addIntegration')} · ${integration.label}`}
      primaryAction={{ content: t('saveKey'), onAction: save, loading: saving, disabled: !value.trim() }}
      secondaryActions={[{ content: t('cancel'), onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" tone="subdued" variant="bodySm">
            {t(`intHint.${integration.hintKey}`)}
          </Text>
          {integration.id === 'pagespeed' ? (
            <InlineStack gap="300" wrap>
              <ExtLink href="https://console.cloud.google.com">{t('guideOpenConsole')}</ExtLink>
              <ExtLink href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com">
                {t('guideEnableApi')}
              </ExtLink>
            </InlineStack>
          ) : null}
          <KeyField
            label={t('apiKey')}
            value={value}
            type={reveal ? 'text' : 'password'}
            placeholder={t('apiKey')}
            revealed={reveal}
            onToggle={() => setReveal((v) => !v)}
            onChange={setValue}
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Modal chi tiết (xem/sửa) ──
function DetailModal({
  target,
  providers,
  ints,
  conns,
  busy,
  setBusy,
  onClose,
  onChanged,
  onDelete,
}: {
  target: DetailTarget;
  providers: ProviderStatus[];
  ints: IntStatus[];
  conns: Conn[];
  busy: string | null;
  setBusy: (v: string | null) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onDelete: (t: DetailTarget) => Promise<void>;
}) {
  const t = useTranslations('settings');
  const [reveal, setReveal] = useState(false);
  const [full, setFull] = useState<string | null>(null);
  const [models, setModels] = useState<{ loading: boolean; options: string[] }>({ loading: false, options: [] });
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [revealNew, setRevealNew] = useState(false);

  const ai = target.kind === 'ai' ? providers.find((p) => p.id === target.id) : undefined;
  const int = target.kind === 'integration' ? ints.find((i) => i.id === target.id) : undefined;
  const conn = target.kind === 'cms' ? conns.find((c) => c.id === target.id) : undefined;

  const loadModels = useCallback(async (provider: ProviderId) => {
    setModels((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const d = await res.json();
      setModels({ loading: false, options: res.ok && Array.isArray(d.models) ? d.models : [] });
    } catch {
      setModels({ loading: false, options: [] });
    }
  }, []);
  useEffect(() => {
    if (ai?.hasKey) void loadModels(ai.id);
  }, [ai?.id, ai?.hasKey, loadModels]);

  async function toggleReveal(url: string) {
    if (reveal) {
      setReveal(false);
      return;
    }
    if (full == null) {
      const res = await fetch(url);
      if (!res.ok) return;
      setFull((await res.json()).key as string);
    }
    setReveal(true);
  }

  async function postAi(body: unknown, tag: string) {
    setBusy(tag);
    setTest(null);
    try {
      const res = await fetch('/api/ai-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTest({ ok: false, msg: data?.error ?? t('testFail') });
        return;
      }
      await onChanged();
    } finally {
      setBusy(null);
    }
  }
  async function testAi(provider: ProviderId) {
    setBusy(`test-${provider}`);
    setTest(null);
    try {
      const res = await fetch('/api/ai-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const j = await res.json();
      setTest({ ok: Boolean(j.ok), msg: j.ok ? t('testOk') : j.error ?? t('testFail') });
    } finally {
      setBusy(null);
    }
  }
  // Thay khóa (AI hoặc tích hợp) bằng khóa mới.
  async function saveNewKey() {
    const k = newKey.trim();
    if (!k) return;
    setBusy(`rk-${target.kind}-${target.id}`);
    try {
      if (target.kind === 'ai') {
        const res = await fetch('/api/ai-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setKey', provider: target.id, key: k }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setTest({ ok: false, msg: data?.error ?? t('testFail') });
          return;
        }
      } else if (target.kind === 'integration') {
        await fetch('/api/integration-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: target.id, value: k }),
        });
      }
      await onChanged();
      setReplacing(false);
      setNewKey('');
      setReveal(false);
      setFull(null);
    } finally {
      setBusy(null);
    }
  }
  const replaceBlock = (keyHint?: string) =>
    replacing ? (
      <BlockStack gap="200">
        <KeyField
          label={t('apiKey')}
          value={newKey}
          type={revealNew ? 'text' : 'password'}
          placeholder={keyHint}
          revealed={revealNew}
          onToggle={() => setRevealNew((v) => !v)}
          onChange={setNewKey}
        />
        <InlineStack gap="200">
          <Button variant="primary" loading={busy === `rk-${target.kind}-${target.id}`} disabled={!newKey.trim()} onClick={saveNewKey}>
            {t('saveKey')}
          </Button>
          <Button
            onClick={() => {
              setReplacing(false);
              setNewKey('');
            }}
          >
            {t('cancel')}
          </Button>
        </InlineStack>
      </BlockStack>
    ) : (
      <Button onClick={() => setReplacing(true)}>{t('replaceKey')}</Button>
    );

  const title =
    ai?.label ?? int?.label ?? (conn ? conn.label : t('detailTitle'));

  return (
    <Modal open onClose={onClose} title={`${t('detailTitle')} · ${title}`} secondaryActions={[{ content: t('close'), onAction: onClose }]}>
      <Modal.Section>
        <BlockStack gap="300">
          {/* CMS */}
          {conn ? (
            <BlockStack gap="200">
              <Row label={t('fieldType')} value={PROVIDER_CFG[conn.provider]?.name ?? conn.provider} />
              <Row label="URL" value={conn.baseUrl} />
              {conn.seoPlugin && conn.seoPlugin !== 'none' ? <Row label="SEO plugin" value={conn.seoPlugin} /> : null}
              <Row
                label={t('fieldStatus')}
                valueNode={<Badge tone={conn.status === 'active' ? 'success' : 'critical'}>{conn.status === 'active' ? t('reportAvailable') : t('reportError')}</Badge>}
              />
              <InlineStack>
                <Button
                  tone="critical"
                  variant="tertiary"
                  icon={DeleteIcon}
                  loading={busy === `del-cms-${conn.id}`}
                  onClick={() => onDelete({ kind: 'cms', id: conn.id })}
                >
                  {t('delete')}
                </Button>
              </InlineStack>
            </BlockStack>
          ) : null}

          {/* AI provider */}
          {ai ? (
            <BlockStack gap="300">
              {!replacing ? (
                <KeyField
                  label={t('apiKey')}
                  value={reveal ? full ?? '' : ai.masked ?? ''}
                  type="text"
                  readOnly
                  revealed={reveal}
                  onToggle={() => void toggleReveal(`/api/ai-keys/reveal?provider=${ai.id}`)}
                />
              ) : null}
              {replaceBlock(ai.keyHint)}
              <Select
                label={t('model')}
                options={Array.from(new Set([...models.options, ai.model])).filter(Boolean).map((m) => ({ label: m, value: m }))}
                value={ai.model}
                disabled={models.loading}
                onChange={(model) => void postAi({ action: 'model', provider: ai.id, model }, `m-${ai.id}`)}
              />
              <Text as="span" variant="bodySm" tone="subdued">
                {`${t('default')}: ${ai.defaultModel}`}
                {models.loading ? ` · ${t('loadingModels')}` : ''}
              </Text>
              <InlineStack gap="200" wrap>
                <Button
                  loading={busy === `en-${ai.id}`}
                  tone={ai.enabled ? 'critical' : undefined}
                  onClick={() => void postAi({ action: 'enable', provider: ai.id, enabled: !ai.enabled }, `en-${ai.id}`)}
                >
                  {ai.enabled ? t('disable') : t('enable')}
                </Button>
                <Button loading={busy === `test-${ai.id}`} onClick={() => void testAi(ai.id)}>
                  {t('testConnection')}
                </Button>
                {ai.source === 'store' ? (
                  <Button
                    tone="critical"
                    variant="tertiary"
                    loading={busy === `del-ai-${ai.id}`}
                    onClick={() => onDelete({ kind: 'ai', id: ai.id })}
                  >
                    {t('removeKey')}
                  </Button>
                ) : null}
              </InlineStack>
              {test ? <Banner tone={test.ok ? 'success' : 'critical'}>{test.msg}</Banner> : null}
            </BlockStack>
          ) : null}

          {/* Integration */}
          {int ? (
            <BlockStack gap="300">
              <Text as="p" tone="subdued" variant="bodySm">
                {t(`intHint.${int.hintKey}`)}
              </Text>
              {!replacing ? (
                <KeyField
                  label={t('apiKey')}
                  value={reveal ? full ?? '' : int.masked ?? ''}
                  type="text"
                  readOnly
                  revealed={reveal}
                  onToggle={() => void toggleReveal(`/api/integration-keys?reveal=${int.id}`)}
                />
              ) : null}
              {replaceBlock()}
              {int.source === 'store' ? (
                <InlineStack>
                  <Button
                    tone="critical"
                    variant="tertiary"
                    icon={DeleteIcon}
                    loading={busy === `del-integration-${int.id}`}
                    onClick={() => onDelete({ kind: 'integration', id: int.id })}
                  >
                    {t('removeKey')}
                  </Button>
                </InlineStack>
              ) : null}
            </BlockStack>
          ) : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function Row({ label, value, valueNode }: { label: string; value?: string; valueNode?: React.ReactNode }) {
  return (
    <InlineStack align="space-between" blockAlign="center" gap="300">
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
      {valueNode ?? (
        <Text as="span" variant="bodySm">
          {value}
        </Text>
      )}
    </InlineStack>
  );
}

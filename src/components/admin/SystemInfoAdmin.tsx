'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  ProgressBar,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminDialog } from '@/components/admin/AdminDialog';
import { apiErrText } from '@/lib/admin/api-error';
import { DEFAULT_BORDER_HEX, DEFAULT_HEADER_HEX, DEFAULT_PRIMARY_HEX } from '@/lib/branding/theme';

interface Branding {
  title: string;
  description: string;
  favicon: string;
  logoAmBan: string;
  logoDuongBan: string;
  bizLogo: string;
  sourceText: string;
  sourceUrl: string;
  colorPrimary: string;
  colorHeader: string;
  colorButtonBorder: string;
  colorBorder: string;
  colorHome: string;
  colorHomeGradient: string;
  colorSocialAccent: string;
  colorSocialStrength: string;
  colorSocialWeakness: string;
}

// ─── Trạng thái máy chủ (cấu hình deploy, RAM, ổ đĩa, CPU, tốc độ mạng) ───
interface SysInfo {
  config: {
    platform: string;
    osType: string;
    osRelease: string;
    arch: string;
    hostname: string;
    nodeVersion: string;
    nodeEnv: string;
    systemUptimeSec: number;
    appUptimeSec: number;
  };
  cpu: { model: string; cores: number; speedMhz: number; usagePct: number | null };
  ram: { total: number; free: number; used: number; usedPct: number; processRss: number };
  disk: { path: string; total: number; free: number; used: number; usedPct: number } | null;
}

function fmtBytes(n: number): string {
  if (!n || n < 0) return '0';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function usageTone(pct: number): 'success' | 'primary' | 'critical' {
  if (pct >= 90) return 'critical';
  if (pct >= 75) return 'primary';
  return 'success';
}

// Cặp nhãn/giá trị xếp DỌC, gọn - dùng trong lưới nhiều cột để không tốn mỗi mục 1 dòng ngang.
function KV({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack gap="050">
      <Text as="span" tone="subdued" variant="bodyXs">
        {label}
      </Text>
      <Text as="span" variant="bodySm" fontWeight="medium" breakWord>
        {value}
      </Text>
    </BlockStack>
  );
}

function UsageBar({ label, used, total, pct, extra }: { label: string; used: number; total: number; pct: number; extra?: string }) {
  return (
    <BlockStack gap="150">
      <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {label}
        </Text>
        <Text as="span" variant="bodySm">
          {`${fmtBytes(used)} / ${fmtBytes(total)} · ${pct}%`}
        </Text>
      </InlineStack>
      <ProgressBar progress={pct} size="small" tone={usageTone(pct)} />
      {extra ? (
        <Text as="span" tone="subdued" variant="bodySm">
          {extra}
        </Text>
      ) : null}
    </BlockStack>
  );
}

function SystemStatus() {
  const t = useTranslations('admin');
  const [info, setInfo] = useState<SysInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [net, setNet] = useState<{ downMbps: number; latencyMs: number } | null>(null);
  const [netErr, setNetErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy('refresh');
    try {
      const r = await fetch('/api/admin/system');
      if (r.ok) setInfo(await r.json());
    } finally {
      setBusy(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function testNet() {
    setBusy('net');
    setNetErr(null);
    try {
      const r = await fetch('/api/admin/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'netspeed' }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) setNet({ downMbps: d.downMbps, latencyMs: d.latencyMs });
      else setNetErr(t('sysNetErr'));
    } catch {
      setNetErr(t('sysNetErr'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
        <BlockStack gap="100">
          <Text as="h3" variant="headingSm">
            {t('sysStatusTitle')}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            {t('sysStatusHelp')}
          </Text>
        </BlockStack>
        <Button size="slim" loading={busy === 'refresh'} onClick={() => void load()}>
          {t('sysRefresh')}
        </Button>
      </InlineStack>

      {!info ? (
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      ) : (
        <BlockStack gap="300">
          {/* Cấu hình deploy - lưới 2 cột, mỗi mục là cặp nhãn/giá trị dọc */}
          <Card>
            <BlockStack gap="300">
              <Text as="h4" variant="headingSm">
                {t('sysDeployTitle')}
              </Text>
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                <KV label={t('sysOs')} value={`${info.config.osType} ${info.config.osRelease}`} />
                <KV label={t('sysArch')} value={`${info.config.platform} · ${info.config.arch}`} />
                <KV label={t('sysNode')} value={info.config.nodeVersion} />
                <KV label={t('sysEnv')} value={info.config.nodeEnv} />
                <KV label={t('sysHostname')} value={info.config.hostname} />
                <KV label={t('sysUptime')} value={fmtUptime(info.config.systemUptimeSec)} />
                <KV label={t('sysAppUptime')} value={fmtUptime(info.config.appUptimeSec)} />
              </InlineGrid>
            </BlockStack>
          </Card>

          {/* CPU (chip) */}
          <Card>
            <BlockStack gap="300">
              <Text as="h4" variant="headingSm">
                {t('sysCpuTitle')}
              </Text>
              <KV label={t('sysCpuModel')} value={info.cpu.model} />
              <InlineGrid columns={{ xs: 2, sm: 3 }} gap="300">
                <KV label={t('sysCpuCores')} value={String(info.cpu.cores)} />
                <KV label={t('sysCpuSpeed')} value={info.cpu.speedMhz ? `${(info.cpu.speedMhz / 1000).toFixed(2)} GHz` : '-'} />
                {info.cpu.usagePct != null ? <KV label={t('sysCpuUsage')} value={`${info.cpu.usagePct}%`} /> : null}
              </InlineGrid>
              {info.cpu.usagePct != null ? (
                <ProgressBar progress={info.cpu.usagePct} size="small" tone={usageTone(info.cpu.usagePct)} />
              ) : null}
            </BlockStack>
          </Card>

          {/* Bộ nhớ RAM & ổ đĩa - gộp 1 thẻ, mỗi cái 1 thanh tiến trình */}
          <Card>
            <BlockStack gap="400">
              <UsageBar
                label={t('sysRamTitle')}
                used={info.ram.used}
                total={info.ram.total}
                pct={info.ram.usedPct}
                extra={`${t('sysRamApp')}: ${fmtBytes(info.ram.processRss)}`}
              />
              {info.disk ? (
                <>
                  <Divider />
                  <UsageBar
                    label={t('sysDiskTitle')}
                    used={info.disk.used}
                    total={info.disk.total}
                    pct={info.disk.usedPct}
                    extra={`${t('sysDiskFree')}: ${fmtBytes(info.disk.free)}`}
                  />
                </>
              ) : null}
            </BlockStack>
          </Card>

          {/* Tốc độ mạng - nút đo cùng hàng với kết quả */}
          <Card>
            <BlockStack gap="300">
              <Text as="h4" variant="headingSm">
                {t('sysNetTitle')}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {t('sysNetHint')}
              </Text>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Button size="slim" loading={busy === 'net'} onClick={() => void testNet()}>
                  {t('sysNetTest')}
                </Button>
                {net ? (
                  <>
                    <Badge tone="success">{`${t('sysNetDown')}: ${net.downMbps} Mbps`}</Badge>
                    <Badge>{`${t('sysNetLatency')}: ${net.latencyMs} ms`}</Badge>
                  </>
                ) : null}
                {netErr ? (
                  <Text as="span" tone="critical" variant="bodySm">
                    {netErr}
                  </Text>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Card>
        </BlockStack>
      )}
    </BlockStack>
  );
}

// Ô chọn màu: swatch (input color) + ô HEX + nút "Mặc định" (xóa = dùng màu Polaris mặc định).
// Bảng màu gợi ý bấm 1 chạm (khỏi gõ mã màu).
const COLOR_PRESETS = ['#008060', '#2b6ef2', '#7c3aed', '#e11d48', '#f59e0b', '#0ea5e9', '#10b981', '#111827'];
const HOME_DEFAULT = '#008060'; // màu trang chủ mặc định (xanh Shopify) khi chưa đặt gì

function ColorField({
  label,
  help,
  value,
  fallback,
  onChange,
  presets,
}: {
  label: string;
  help?: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
  presets?: string[];
}) {
  const t = useTranslations('admin');
  return (
    <BlockStack gap="150">
      <Text as="span" variant="bodyMd" fontWeight="medium">
        {label}
      </Text>
      <InlineStack gap="200" blockAlign="center" wrap>
        <input
          type="color"
          aria-label={label}
          value={value || fallback}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 40, height: 40, padding: 0, border: '1px solid var(--p-color-border)', borderRadius: 8, background: 'none', cursor: 'pointer' }}
        />
        <div style={{ minWidth: 140 }}>
          <TextField
            label={label}
            labelHidden
            value={value}
            onChange={onChange}
            autoComplete="off"
            placeholder={t('brandColorDefault')}
          />
        </div>
        {value ? (
          <Button size="slim" variant="plain" onClick={() => onChange('')}>
            {t('brandColorDefault')}
          </Button>
        ) : null}
      </InlineStack>
      {presets?.length ? (
        <InlineStack gap="100" wrap>
          {presets.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              title={c}
              onClick={() => onChange(c)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: c,
                border: value.toLowerCase() === c.toLowerCase() ? '2px solid var(--p-color-text)' : '1px solid var(--p-color-border)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </InlineStack>
      ) : null}
      {help ? (
        <Text as="span" tone="subdued" variant="bodySm">
          {help}
        </Text>
      ) : null}
    </BlockStack>
  );
}

// Sắc đậm hơn (trộn về đen) - cho preview gradient trang chủ khớp với landing.
function inkShade(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const p = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.66));
  return '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const MAX_UPLOAD = 512 * 1024; // 512KB - nhúng data URI, đủ cho logo/favicon

// Trường ảnh: ô dán URL/data URI + nút tải ảnh (→ data URI) + xem trước. Nền tùy chọn để thấy
// rõ logo âm bản (chữ sáng) trên nền tối.
function ImageField({
  label,
  help,
  value,
  onChange,
  preview,
  onError,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  preview: 'light' | 'dark';
  onError: (msg: string) => void;
}) {
  const t = useTranslations('admin');
  const inputRef = useRef<HTMLInputElement | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      onError(t('brandUploadTooBig'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  return (
    <BlockStack gap="150">
      <TextField label={label} value={value} onChange={onChange} autoComplete="off" helpText={help} />
      <InlineStack gap="200" blockAlign="center" wrap>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <Button size="slim" onClick={() => inputRef.current?.click()}>
          {t('brandUpload')}
        </Button>
        {value ? (
          <Button size="slim" variant="plain" tone="critical" onClick={() => onChange('')}>
            {t('brandClearField')}
          </Button>
        ) : null}
        {value ? (
          <Box
            padding="200"
            borderWidth="025"
            borderColor="border"
            borderRadius="200"
            background={preview === 'dark' ? 'bg-fill-inverse' : 'bg-surface'}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" style={{ height: 32, width: 'auto', display: 'block' }} />
          </Box>
        ) : null}
      </InlineStack>
    </BlockStack>
  );
}

export function SystemInfoAdmin() {
  const t = useTranslations('admin');
  const dlg = useAdminDialog();
  const [st, setSt] = useState<Branding | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/branding');
    if (r.ok) setSt(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: keyof Branding, v: string) => setSt((s) => (s ? { ...s, [k]: v } : s));

  async function save() {
    if (!st) return;
    setBusy('save');
    setMsg(null);
    try {
      const r = await fetch('/api/admin/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(st),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setSt(d);
        setMsg({ ok: true, text: t('brandSaved') });
      } else setMsg({ ok: false, text: apiErrText(d, t) });
    } finally {
      setBusy(null);
    }
  }

  async function resetAll() {
    const ok = await dlg.confirm({
      title: t('brandReset'),
      message: t('brandResetConfirm'),
      tone: 'critical',
      confirmText: t('brandReset'),
    });
    if (!ok) return;
    setBusy('reset');
    setMsg(null);
    try {
      const r = await fetch('/api/admin/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setSt(d);
        setMsg({ ok: true, text: t('brandSaved') });
      } else setMsg({ ok: false, text: apiErrText(d, t) });
    } finally {
      setBusy(null);
    }
  }

  if (!st)
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );

  return (
    // 2 cột: TRÁI = thương hiệu & thông tin hệ thống, PHẢI = trạng thái máy chủ. Hẹp thì xuống 1 cột.
    <InlineGrid columns={{ xs: 1, lg: 2 }} gap="500">
      {/* ── Cột 1: Thương hiệu & thông tin hệ thống ── */}
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h3" variant="headingSm">
            {t('brandTitle')}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            {t('brandHelp')}
          </Text>
        </BlockStack>
        {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}

        {/* Tiêu đề & mô tả */}
        <Card>
          <BlockStack gap="300">
            <TextField
              label={t('brandFieldTitle')}
              value={st.title}
              onChange={(v) => set('title', v)}
              autoComplete="off"
              helpText={t('brandFieldTitleHelp')}
            />
            <TextField
              label={t('brandFieldDescription')}
              value={st.description}
              onChange={(v) => set('description', v)}
              autoComplete="off"
              multiline={3}
              helpText={t('brandFieldDescriptionHelp')}
            />
          </BlockStack>
        </Card>

        {/* Logo & favicon */}
        <Card>
          <BlockStack gap="400">
            <ImageField
              label={t('brandLogoDuongBan')}
              help={t('brandLogoDuongBanHelp')}
              value={st.logoDuongBan}
              onChange={(v) => set('logoDuongBan', v)}
              preview="light"
              onError={(text) => setMsg({ ok: false, text })}
            />
            <ImageField
              label={t('brandLogoAmBan')}
              help={t('brandLogoAmBanHelp')}
              value={st.logoAmBan}
              onChange={(v) => set('logoAmBan', v)}
              preview="dark"
              onError={(text) => setMsg({ ok: false, text })}
            />
            <ImageField
              label={t('brandBizLogo')}
              help={t('brandBizLogoHelp')}
              value={st.bizLogo}
              onChange={(v) => set('bizLogo', v)}
              preview="light"
              onError={(text) => setMsg({ ok: false, text })}
            />
            <ImageField
              label={t('brandFavicon')}
              help={t('brandFaviconHelp')}
              value={st.favicon}
              onChange={(v) => set('favicon', v)}
              preview="light"
              onError={(text) => setMsg({ ok: false, text })}
            />
          </BlockStack>
        </Card>

        {/* Nguồn (by: noti.vn) - 2 ô cùng hàng */}
        <Card>
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
            <TextField
              label={t('brandSourceText')}
              value={st.sourceText}
              onChange={(v) => set('sourceText', v)}
              autoComplete="off"
              helpText={t('brandSourceTextHelp')}
            />
            <TextField
              label={t('brandSourceUrl')}
              type="url"
              value={st.sourceUrl}
              onChange={(v) => set('sourceUrl', v)}
              autoComplete="off"
              placeholder="https://"
            />
          </InlineGrid>
        </Card>

        {/* Màu sắc: nút/chủ đạo + header. Để trống = màu mặc định. */}
        <Card>
          <BlockStack gap="300">
            <BlockStack gap="050">
              <Text as="h4" variant="headingSm">
                {t('brandColorsTitle')}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {t('brandColorsHelp')}
              </Text>
            </BlockStack>
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
              <ColorField
                label={t('brandColorPrimary')}
                help={t('brandColorPrimaryHelp')}
                value={st.colorPrimary}
                fallback={DEFAULT_PRIMARY_HEX}
                onChange={(v) => set('colorPrimary', v)}
                presets={COLOR_PRESETS}
              />
              <ColorField
                label={t('brandColorHeader')}
                help={t('brandColorHeaderHelp')}
                value={st.colorHeader}
                fallback={DEFAULT_HEADER_HEX}
                onChange={(v) => set('colorHeader', v)}
              />
              <ColorField
                label={t('brandColorButtonBorder')}
                help={t('brandColorButtonBorderHelp')}
                value={st.colorButtonBorder}
                fallback={DEFAULT_BORDER_HEX}
                onChange={(v) => set('colorButtonBorder', v)}
              />
              <ColorField
                label={t('brandColorBorder')}
                help={t('brandColorBorderHelp')}
                value={st.colorBorder}
                fallback={DEFAULT_BORDER_HEX}
                onChange={(v) => set('colorBorder', v)}
              />
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* Màu BÁO CÁO SOCIAL - áp cho trang xem + bản xuất PDF/.doc/Drive. Để trống = mặc định. */}
        <Card>
          <BlockStack gap="300">
            <BlockStack gap="050">
              <Text as="h4" variant="headingSm">
                {t('brandSocialTitle')}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {t('brandSocialHelp')}
              </Text>
            </BlockStack>
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
              <ColorField
                label={t('brandColorSocialAccent')}
                help={t('brandColorSocialAccentHelp')}
                value={st.colorSocialAccent}
                fallback="#005bd3"
                onChange={(v) => set('colorSocialAccent', v)}
                presets={COLOR_PRESETS}
              />
              <ColorField
                label={t('brandColorSocialStrength')}
                help={t('brandColorSocialStrengthHelp')}
                value={st.colorSocialStrength}
                fallback="#1f8a4c"
                onChange={(v) => set('colorSocialStrength', v)}
              />
              <ColorField
                label={t('brandColorSocialWeakness')}
                help={t('brandColorSocialWeaknessHelp')}
                value={st.colorSocialWeakness}
                fallback="#c5280c"
                onChange={(v) => set('colorSocialWeakness', v)}
              />
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* Màu TRANG CHỦ (landing công khai) - tách riêng khỏi màu app + có gradient */}
        <Card>
          <BlockStack gap="300">
            <BlockStack gap="050">
              <Text as="h4" variant="headingSm">
                {t('brandHomeTitle')}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {t('brandHomeHelp')}
              </Text>
            </BlockStack>
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
              <ColorField
                label={t('brandColorHome')}
                help={t('brandColorHomeHelp')}
                value={st.colorHome}
                fallback={st.colorPrimary || HOME_DEFAULT}
                onChange={(v) => set('colorHome', v)}
                presets={COLOR_PRESETS}
              />
              <ColorField
                label={t('brandColorHomeGradient')}
                help={t('brandColorHomeGradientHelp')}
                value={st.colorHomeGradient}
                fallback={inkShade(st.colorHome || st.colorPrimary || HOME_DEFAULT)}
                onChange={(v) => set('colorHomeGradient', v)}
                presets={COLOR_PRESETS}
              />
            </InlineGrid>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">
                {t('brandGradientPreview')}
              </Text>
              <div
                style={{
                  height: 56,
                  borderRadius: 12,
                  border: '1px solid var(--p-color-border)',
                  background: `linear-gradient(135deg, ${st.colorHome || st.colorPrimary || HOME_DEFAULT}, ${
                    st.colorHomeGradient || inkShade(st.colorHome || st.colorPrimary || HOME_DEFAULT)
                  })`,
                }}
              />
            </BlockStack>
          </BlockStack>
        </Card>

        <InlineStack gap="200" wrap>
          <Button variant="primary" loading={busy === 'save'} onClick={() => void save()}>
            {t('brandSave')}
          </Button>
          <Button variant="plain" tone="critical" loading={busy === 'reset'} onClick={() => void resetAll()}>
            {t('brandReset')}
          </Button>
        </InlineStack>
      </BlockStack>

      {/* ── Cột 2: Trạng thái hệ thống ── */}
      <SystemStatus />
    </InlineGrid>
  );
}

'use client';

import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  Spinner,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ApiTokensPanel } from '@/components/ApiTokensPanel';
import { ApprovalSettingsPanel } from '@/components/ApprovalSettingsPanel';
import { BizMembersPanel } from '@/components/BizMembersPanel';
import { BrandVoicePanel } from '@/components/BrandVoicePanel';
import { CostBudgetPanel } from '@/components/CostBudgetPanel';
import { FeatureGate } from '@/components/EntitlementProvider';
import { TokenUsageReportPanel } from '@/components/TokenUsageReportPanel';
import { type Role } from '@/lib/auth/permissions';

interface BizItem {
  id: string;
  name: string;
  role: Role;
  ownerId: string;
  memberCount: number;
  phone?: string;
  email?: string;
  website?: string;
  description?: string;
}

export default function BizPage() {
  const t = useTranslations('biz');
  const [bizes, setBizes] = useState<BizItem[] | null>(null);
  const [activeBizId, setActiveBizId] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  // Bản nháp hồ sơ biz (tab Thông tin)
  const [profile, setProfile] = useState({ name: '', phone: '', email: '', website: '', description: '' });

  const active = bizes?.find((b) => b.id === activeBizId);
  const canManage = active?.role === 'owner' || active?.role === 'admin';

  const loadBizes = useCallback(async () => {
    const res = await fetch('/api/biz');
    if (!res.ok) return;
    const d = await res.json();
    setBizes(d.bizes);
    setActiveBizId(d.activeBizId);
  }, []);

  useEffect(() => {
    void loadBizes();
  }, [loadBizes]);

  // Nạp hồ sơ vào form khi đổi biz đang hoạt động.
  useEffect(() => {
    if (active) {
      setProfile({
        name: active.name ?? '',
        phone: active.phone ?? '',
        email: active.email ?? '',
        website: active.website ?? '',
        description: active.description ?? '',
      });
    }
  }, [active]);

  async function deleteBiz(bizId: string) {
    if (!confirm(t('deleteConfirm'))) return;
    setBusy(`del-${bizId}`);
    const res = await fetch(`/api/biz/${bizId}`, { method: 'DELETE' });
    // Xóa xong không còn ở biz này → về trang chủ (guard sẽ chọn biz khác / onboarding).
    if (res.ok) window.location.href = './dashboard';
    else {
      const d = await res.json().catch(() => null);
      setMsg({ ok: false, text: d?.error || t('deleteErr') });
      setBusy(null);
    }
  }

  async function saveProfile() {
    if (!active) return;
    setBusy('profile');
    setMsg(null);
    try {
      const res = await fetch(`/api/biz/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setMsg({ ok: true, text: t('profileSaved') });
        await loadBizes();
      } else {
        const d = await res.json().catch(() => null);
        setMsg({ ok: false, text: d?.error || t('saveErr') });
      }
    } finally {
      setBusy(null);
    }
  }

  if (!bizes) {
    return (
      <Page title={t('title')}>
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      </Page>
    );
  }

  const tabs = [
    { id: 'info', content: t('tabInfo') },
    { id: 'members', content: t('tabMembers') },
    { id: 'approval', content: t('tabApproval') },
    { id: 'brandVoice', content: t('tabBrandVoice') },
    { id: 'apiTokens', content: t('tabApiTokens') },
    { id: 'usage', content: t('tabUsage') },
    { id: 'cost', content: t('tabCost') },
  ];

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="400">
        {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}

        {/* Tab quản lý biz đang hoạt động (chuyển/tạo biz nằm ở header) */}
        {active ? (
          <Card padding="0">
            <Tabs tabs={tabs} selected={tab} onSelect={setTab}>
              <Box padding="400">
                {tab === 0 ? (
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingSm">
                      {t('infoTitle', { name: active.name })}
                    </Text>
                    {!canManage ? (
                      <Text as="p" tone="subdued" variant="bodySm">
                        {t('infoReadOnly')}
                      </Text>
                    ) : null}
                    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                      <TextField
                        label={t('bizNameLabel')}
                        value={profile.name}
                        onChange={(v) => setProfile((p) => ({ ...p, name: v }))}
                        autoComplete="off"
                        disabled={!canManage}
                      />
                      <TextField
                        label={t('bizPhone')}
                        value={profile.phone}
                        onChange={(v) => setProfile((p) => ({ ...p, phone: v }))}
                        autoComplete="off"
                        disabled={!canManage}
                      />
                      <TextField
                        label={t('bizEmail')}
                        type="email"
                        value={profile.email}
                        onChange={(v) => setProfile((p) => ({ ...p, email: v }))}
                        autoComplete="off"
                        disabled={!canManage}
                      />
                      <TextField
                        label={t('bizWebsite')}
                        type="url"
                        value={profile.website}
                        onChange={(v) => setProfile((p) => ({ ...p, website: v }))}
                        autoComplete="off"
                        placeholder="https://"
                        disabled={!canManage}
                      />
                    </InlineGrid>
                    <TextField
                      label={t('bizDescription')}
                      value={profile.description}
                      onChange={(v) => setProfile((p) => ({ ...p, description: v }))}
                      multiline={4}
                      autoComplete="off"
                      disabled={!canManage}
                    />
                    {canManage ? (
                      <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                        <Button
                          variant="primary"
                          loading={busy === 'profile'}
                          disabled={!profile.name.trim()}
                          onClick={saveProfile}
                        >
                          {t('saveProfile')}
                        </Button>
                        {active.role === 'owner' ? (
                          <Button
                            tone="critical"
                            variant="tertiary"
                            loading={busy === `del-${active.id}`}
                            onClick={() => deleteBiz(active.id)}
                          >
                            {t('deleteThisBiz')}
                          </Button>
                        ) : null}
                      </InlineStack>
                    ) : null}
                  </BlockStack>
                ) : null}
                {tab === 1 ? <BizMembersPanel bizId={active.id} bizName={active.name} /> : null}
                {tab === 2 ? (
                  canManage ? (
                    <FeatureGate feature="approval">
                      <ApprovalSettingsPanel bizId={active.id} />
                    </FeatureGate>
                  ) : (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('approvalReadOnly')}
                    </Text>
                  )
                ) : null}
                {tab === 3 ? (
                  canManage ? (
                    <FeatureGate feature="brandVoice">
                      <BrandVoicePanel bizId={active.id} />
                    </FeatureGate>
                  ) : (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('approvalReadOnly')}
                    </Text>
                  )
                ) : null}
                {tab === 4 ? (
                  canManage ? (
                    <FeatureGate feature="api">
                      <ApiTokensPanel bizId={active.id} />
                    </FeatureGate>
                  ) : (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('approvalReadOnly')}
                    </Text>
                  )
                ) : null}
                {tab === 5 ? (
                  canManage ? (
                    <TokenUsageReportPanel bizId={active.id} />
                  ) : (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('approvalReadOnly')}
                    </Text>
                  )
                ) : null}
                {tab === 6 ? (
                  canManage ? (
                    <CostBudgetPanel bizId={active.id} />
                  ) : (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('approvalReadOnly')}
                    </Text>
                  )
                ) : null}
              </Box>
            </Tabs>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}

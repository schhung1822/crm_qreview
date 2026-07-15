'use client';

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Page,
  Spinner,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminDialogProvider, useAdminDialog } from '@/components/admin/AdminDialog';
import { apiErrText } from '@/lib/admin/api-error';
import { AnnouncementsAdmin } from '@/components/admin/AnnouncementsAdmin';
import { BizAdmin } from '@/components/admin/BizAdmin';
import { CouponsAdmin } from '@/components/admin/CouponsAdmin';
import { EntityDetailModal, type DetailTarget } from '@/components/admin/EntityDetailModal';
import { OrdersAdmin } from '@/components/admin/OrdersAdmin';
import { NewsAdmin } from '@/components/admin/NewsAdmin';
import { OverviewAdmin } from '@/components/admin/OverviewAdmin';
import { PaymentAdmin } from '@/components/admin/PaymentAdmin';
import { PlansAdmin } from '@/components/admin/PlansAdmin';
import { PlatformApiTokens } from '@/components/admin/PlatformApiTokens';
import { PromptsAdmin } from '@/components/admin/PromptsAdmin';
import { PlatformEmailAdmin } from '@/components/admin/PlatformEmailAdmin';
import { SystemInfoAdmin } from '@/components/admin/SystemInfoAdmin';
import { TrackingAdmin } from '@/components/admin/TrackingAdmin';
import { PLAN_ORDER, type PlanId } from '@/lib/billing/plans';

interface Account {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
  plan: PlanId | null;
  status: string | null;
  trialEndsAt: string | null;
  overageArticles: number;
  ownedBiz: number;
}
interface Stats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalBiz: number;
  monthlyArticles: number;
  byPlan: Record<string, number>;
  trialingDefault: number;
  estRevenueVnd: number;
  estRevenueUsd: number;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
      <BlockStack gap="050">
        <Text as="span" tone="subdued" variant="bodySm">
          {label}
        </Text>
        <Text as="span" variant="headingLg">
          {value}
        </Text>
      </BlockStack>
    </Box>
  );
}

// Id các tab theo đúng thứ tự hiển thị → đồng bộ với ?tab= trên URL (liên kết dẫn thẳng tới tab).
const TAB_IDS = ['overview', 'users', 'biz', 'plans', 'orders', 'coupons', 'payment', 'email', 'announce', 'news', 'tracking', 'system', 'api', 'prompts'] as const;

export default function AdminPage() {
  return (
    <AdminDialogProvider>
      <AdminConsole />
    </AdminDialogProvider>
  );
}

function AdminConsole() {
  const t = useTranslations('admin');
  const tb = useTranslations('billing');
  const locale = useLocale();
  const dlg = useAdminDialog();
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const [tab, setTab] = useState(0);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  // Công tắc tự đăng ký (null = chưa tải xong).
  const [regEnabled, setRegEnabled] = useState<boolean | null>(null);
  const [regBusy, setRegBusy] = useState(false);

  const load = useCallback(async () => {
    const aRes = await fetch('/api/admin/accounts');
    if (aRes.status === 403) {
      setDenied(true);
      setAccounts([]);
      return;
    }
    if (aRes.ok) setAccounts((await aRes.json()).accounts ?? []);
    else setAccounts([]);
    const rRes = await fetch('/api/admin/registration');
    if (rRes.ok) setRegEnabled(Boolean((await rRes.json()).selfRegistrationEnabled));
  }, []);

  async function toggleRegistration(next: boolean) {
    setRegBusy(true);
    try {
      const res = await fetch('/api/admin/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) setRegEnabled(Boolean((await res.json()).selfRegistrationEnabled));
    } finally {
      setRegBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  // Đọc tab từ URL khi mở (liên kết dẫn thẳng), và cập nhật URL mỗi lần đổi tab.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('tab');
    const i = id ? TAB_IDS.indexOf(id as (typeof TAB_IDS)[number]) : -1;
    if (i >= 0) setTab(i);
  }, []);
  const selectTab = useCallback((i: number) => {
    setTab(i);
    const url = `${window.location.pathname}?tab=${TAB_IDS[i]}`;
    window.history.replaceState(null, '', url);
  }, []);

  async function userAction(userId: string, body: Record<string, unknown>) {
    setBusy(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...body }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) await dlg.alert({ message: apiErrText(d, t), tone: 'critical' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const filtered = (accounts ?? []).filter((a) => {
    const kw = q.trim().toLowerCase();
    return !kw || `${a.email} ${a.name}`.toLowerCase().includes(kw);
  });

  const tabs = [
    { id: 'overview', content: t('tabOverview') },
    { id: 'users', content: t('tabUsers') },
    { id: 'biz', content: t('tabBiz') },
    { id: 'plans', content: t('tabPlans') },
    { id: 'orders', content: t('tabOrders') },
    { id: 'coupons', content: t('tabCoupons') },
    { id: 'payment', content: t('tabPayment') },
    { id: 'email', content: t('tabEmail') },
    { id: 'announce', content: t('tabAnnounce') },
    { id: 'news', content: t('tabNews') },
    { id: 'tracking', content: t('tabTracking') },
    { id: 'system', content: t('tabSystem') },
    { id: 'api', content: t('tabApi') },
    { id: 'prompts', content: t('tabPrompts') },
  ];

  if (accounts == null) {
    return (
      <Page title={t('title')}>
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      </Page>
    );
  }
  if (denied) {
    return (
      <Page title={t('title')}>
        <Card>
          <Text as="p" tone="critical">
            {t('denied')}
          </Text>
        </Card>
      </Page>
    );
  }

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <div className="admin-sticky-tabs">
      <Card padding="0">
        <Tabs tabs={tabs} selected={tab} onSelect={selectTab}>
          <Box padding="400">
            {tab === 0 ? <OverviewAdmin /> : null}

            {tab === 1 ? (
              <BlockStack gap="300">
                {/* Công tắc TỰ ĐĂNG KÝ tài khoản mới (chỉ superadmin). */}
                <Card>
                  <BlockStack gap="200">
                    <Checkbox
                      label="Cho phép người dùng tự đăng ký tài khoản mới"
                      checked={regEnabled !== false}
                      disabled={regEnabled === null || regBusy}
                      onChange={(v) => void toggleRegistration(v)}
                    />
                    <Text as="span" tone="subdued" variant="bodySm">
                      Tắt để hệ thống KHÔNG nhận đăng ký mới — form tạo tài khoản ở trang đăng nhập sẽ
                      bị ẩn. Không ảnh hưởng tài khoản đã có; owner/admin vẫn tạo được nhân viên trong
                      từng biz.
                    </Text>
                  </BlockStack>
                </Card>
                <TextField
                  label={t('search')}
                  labelHidden
                  value={q}
                  onChange={setQ}
                  autoComplete="off"
                  placeholder={t('search')}
                  clearButton
                  onClearButtonClick={() => setQ('')}
                />
                {filtered.map((a) => (
                  <Card key={a.id}>
                    <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                      {/* Bấm vào tên/email → mở chi tiết ngay (không cần nút riêng). */}
                      <button
                        type="button"
                        className="admin-entity-link"
                        onClick={() => setDetailTarget({ kind: 'user', id: a.id })}
                      >
                        <BlockStack gap="100">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {a.name}
                          </Text>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {a.email}
                          </Text>
                          <InlineStack gap="150" blockAlign="center" wrap>
                            <Badge tone={a.active ? 'success' : 'critical'}>
                              {a.active ? t('active') : t('suspended')}
                            </Badge>
                            <Text as="span" tone="subdued" variant="bodySm">
                              {a.role} · {t('ownedBiz', { n: a.ownedBiz })}
                            </Text>
                          </InlineStack>
                        </BlockStack>
                      </button>

                      {/* Chỉ thao tác cấp TÀI KHOẢN ở đây; gói cước/overage đã chuyển sang tab Biz. */}
                      <InlineStack gap="200" blockAlign="center" wrap>
                        <Button
                          size="slim"
                          loading={busy === a.id}
                          onClick={() => void userAction(a.id, { action: a.active ? 'suspend' : 'activate' })}
                        >
                          {a.active ? t('suspend') : t('activate')}
                        </Button>
                        <Button
                          size="slim"
                          onClick={async () => {
                            const pw = await dlg.prompt({
                              title: t('resetPassword'),
                              label: t('newPasswordPrompt'),
                              inputType: 'password',
                            });
                            if (pw === null) return;
                            if (pw.length >= 8) void userAction(a.id, { action: 'setPassword', password: pw });
                            else await dlg.alert({ message: t('pwTooShort'), tone: 'warning' });
                          }}
                        >
                          {t('resetPassword')}
                        </Button>
                        <Button
                          size="slim"
                          tone="critical"
                          variant="plain"
                          onClick={async () => {
                            const ok = await dlg.confirm({
                              title: t('deleteUser'),
                              message: t('deleteConfirm', { name: a.name }),
                              tone: 'critical',
                              confirmText: t('deleteUser'),
                            });
                            if (ok) void userAction(a.id, { action: 'delete' });
                          }}
                        >
                          {t('deleteUser')}
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Card>
                ))}
              </BlockStack>
            ) : null}

            {tab === 2 ? <BizAdmin onOpenDetail={setDetailTarget} /> : null}
            {tab === 3 ? <PlansAdmin /> : null}
            {tab === 4 ? <OrdersAdmin /> : null}
            {tab === 5 ? <CouponsAdmin /> : null}
            {tab === 6 ? <PaymentAdmin /> : null}
            {tab === 7 ? <PlatformEmailAdmin /> : null}
            {tab === 8 ? <AnnouncementsAdmin /> : null}
            {tab === 9 ? <NewsAdmin /> : null}
            {tab === 10 ? <TrackingAdmin /> : null}
            {tab === 11 ? <SystemInfoAdmin /> : null}
            {tab === 12 ? <PlatformApiTokens /> : null}
            {tab === 13 ? <PromptsAdmin /> : null}
          </Box>
        </Tabs>
      </Card>
      </div>
      <EntityDetailModal initial={detailTarget} onClose={() => setDetailTarget(null)} />
    </Page>
  );
}

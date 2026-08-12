'use client';

import { Badge, BlockStack, Box, Button, Card, Checkbox, InlineStack, Page, Spinner, Tabs, Text, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { AdminDialogProvider, useAdminDialog } from '@/components/admin/AdminDialog';
import { PlatformEmailAdmin } from '@/components/admin/PlatformEmailAdmin';
import { PromptsAdmin } from '@/components/admin/PromptsAdmin';
import { SystemInfoAdmin } from '@/components/admin/SystemInfoAdmin';
import { TrackingAdmin } from '@/components/admin/TrackingAdmin';
import { apiErrText } from '@/lib/admin/api-error';

interface Account {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}

const TAB_IDS = ['users', 'email', 'tracking', 'system', 'prompts'] as const;

export default function AdminPage() {
  return <AdminDialogProvider><AdminConsole /></AdminDialogProvider>;
}

function AdminConsole() {
  const t = useTranslations('admin');
  const dialog = useAdminDialog();
  const [tab, setTab] = useState(0);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  const [registrationBusy, setRegistrationBusy] = useState(false);

  const load = useCallback(async () => {
    const accountResponse = await fetch('/api/admin/accounts');
    if (accountResponse.status === 403) {
      setDenied(true);
      setAccounts([]);
      return;
    }
    setAccounts(accountResponse.ok ? (await accountResponse.json()).accounts ?? [] : []);
    const registrationResponse = await fetch('/api/admin/registration');
    if (registrationResponse.ok) {
      setRegistrationEnabled(Boolean((await registrationResponse.json()).selfRegistrationEnabled));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('tab');
    const index = id ? TAB_IDS.indexOf(id as (typeof TAB_IDS)[number]) : -1;
    if (index >= 0) setTab(index);
  }, []);

  const selectTab = useCallback((index: number) => {
    setTab(index);
    window.history.replaceState(null, '', `${window.location.pathname}?tab=${TAB_IDS[index]}`);
  }, []);

  async function toggleRegistration(enabled: boolean) {
    setRegistrationBusy(true);
    try {
      const response = await fetch('/api/admin/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (response.ok) setRegistrationEnabled(Boolean((await response.json()).selfRegistrationEnabled));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function userAction(userId: string, body: Record<string, unknown>) {
    setBusy(userId);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) await dialog.alert({ message: apiErrText(data, t), tone: 'critical' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const filtered = (accounts ?? []).filter((account) =>
    `${account.email} ${account.name}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const tabs = TAB_IDS.map((id) => ({ id, content: t(`tab${id[0].toUpperCase()}${id.slice(1)}`) }));

  if (accounts === null) return <Page title={t('title')}><Box padding="400"><Spinner size="small" /></Box></Page>;
  if (denied) return <Page title={t('title')}><Card><Text as="p" tone="critical">{t('denied')}</Text></Card></Page>;

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <Card padding="0">
        <Tabs tabs={tabs} selected={tab} onSelect={selectTab}>
          <Box padding="400">
            {tab === 0 ? (
              <BlockStack gap="300">
                <Card>
                  <Checkbox
                    label="Cho phép người dùng tự đăng ký tài khoản mới"
                    checked={registrationEnabled !== false}
                    disabled={registrationEnabled === null || registrationBusy}
                    onChange={(value) => void toggleRegistration(value)}
                  />
                </Card>
                <TextField label={t('search')} labelHidden value={query} onChange={setQuery} autoComplete="off" placeholder={t('search')} clearButton onClearButtonClick={() => setQuery('')} />
                {filtered.map((account) => (
                  <Card key={account.id}>
                    <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                      <BlockStack gap="100">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{account.name}</Text>
                        <Text as="span" tone="subdued" variant="bodySm">{account.email}</Text>
                        <InlineStack gap="150"><Badge tone={account.active ? 'success' : 'critical'}>{account.active ? t('active') : t('suspended')}</Badge><Text as="span" tone="subdued">{account.role}</Text></InlineStack>
                      </BlockStack>
                      <InlineStack gap="200" wrap>
                        <Button size="slim" loading={busy === account.id} onClick={() => void userAction(account.id, { action: account.active ? 'suspend' : 'activate' })}>{account.active ? t('suspend') : t('activate')}</Button>
                        <Button size="slim" onClick={async () => {
                          const password = await dialog.prompt({ title: t('resetPassword'), label: t('newPasswordPrompt'), inputType: 'password' });
                          if (password && password.length >= 8) void userAction(account.id, { action: 'setPassword', password });
                        }}>{t('resetPassword')}</Button>
                        <Button size="slim" tone="critical" variant="plain" onClick={async () => {
                          const ok = await dialog.confirm({ title: t('deleteUser'), message: t('deleteConfirm', { name: account.name }), tone: 'critical', confirmText: t('deleteUser') });
                          if (ok) void userAction(account.id, { action: 'delete' });
                        }}>{t('deleteUser')}</Button>
                      </InlineStack>
                    </InlineStack>
                  </Card>
                ))}
              </BlockStack>
            ) : null}
            {tab === 1 ? <PlatformEmailAdmin /> : null}
            {tab === 2 ? <TrackingAdmin /> : null}
            {tab === 3 ? <SystemInfoAdmin /> : null}
            {tab === 4 ? <PromptsAdmin /> : null}
          </Box>
        </Tabs>
      </Card>
    </Page>
  );
}

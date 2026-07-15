'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  Page,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ROLE_LABELS, type Role } from '@/lib/auth/permissions';

interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export default function AccountPage() {
  const t = useTranslations('account');
  const [me, setMe] = useState<Me | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .catch(() => setMe(null));
  }, []);

  async function changePassword() {
    setMsg(null);
    if (next.length < 8) {
      setMsg({ ok: false, text: t('errShort') });
      return;
    }
    if (next !== confirm) {
      setMsg({ ok: false, text: t('errMismatch') });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) {
        setMsg({ ok: true, text: t('changed') });
        setCurrent('');
        setNext('');
        setConfirm('');
      } else {
        setMsg({ ok: false, text: d?.error || t('errGeneric') });
      }
    } catch {
      setMsg({ ok: false, text: t('errGeneric') });
    } finally {
      setSaving(false);
    }
  }

  if (!me) {
    return (
      <Page title={t('title')}>
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      </Page>
    );
  }

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('infoTitle')}
            </Text>
            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
              <Field label={t('name')} value={me.name} />
              <Field label={t('email')} value={me.email} />
              <BlockStack gap="100">
                <Text as="span" tone="subdued" variant="bodySm">
                  {t('role')}
                </Text>
                <Badge tone="info">{ROLE_LABELS[me.role]}</Badge>
              </BlockStack>
            </InlineGrid>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('changePwTitle')}
            </Text>
            {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}
            <TextField
              label={t('currentPw')}
              type="password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
              <TextField
                label={t('newPw')}
                type="password"
                value={next}
                onChange={setNext}
                autoComplete="new-password"
                helpText={t('pwHint')}
              />
              <TextField
                label={t('confirmPw')}
                type="password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
            </InlineGrid>
            <Box>
              <Button
                variant="primary"
                loading={saving}
                disabled={!current || !next || !confirm}
                onClick={changePassword}
              >
                {t('changePwBtn')}
              </Button>
            </Box>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack gap="100">
      <Text as="span" tone="subdued" variant="bodySm">
        {label}
      </Text>
      <Text as="span" fontWeight="medium">
        {value}
      </Text>
    </BlockStack>
  );
}

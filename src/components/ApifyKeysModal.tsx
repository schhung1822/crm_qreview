'use client';

// Quản lý POOL nhiều API key Apify (Báo cáo Social): thêm (kiểm tra trước khi lưu), xóa.
// Mỗi lần thu thập dữ liệu, hệ thống dùng NGẪU NHIÊN một khóa và tự chuyển khóa khác khi lỗi.
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  InlineStack,
  Modal,
  Text,
  TextField,
} from '@shopify/polaris';
import { DeleteIcon } from '@shopify/polaris-icons';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface ApifyKey {
  id: string;
  masked: string;
  addedAt: string;
}

export function ApifyKeysModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const t = useTranslations('settings.apify');
  const tc = useTranslations('settings'); // dùng chung deleteConfirmLabel + cancel
  const [keys, setKeys] = useState<ApifyKey[]>([]);
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  // Xóa key phải gõ "DELETE" (xác nhận INLINE ngay trong dòng, không popup lồng popup).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [delText, setDelText] = useState('');

  const [value, setValue] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Trạng thái kiểm tra: chỉ cho Lưu sau khi kiểm tra ĐẠT chính token đang nhập.
  const [testState, setTestState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [msg, setMsg] = useState('');
  const [msgErr, setMsgErr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integration-keys/apify');
      if (res.ok) {
        const body = (await res.json()) as { keys: ApifyKey[]; usingFallback: boolean };
        setKeys(body.keys ?? []);
        setFallback(!!body.usingFallback);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setValue('');
      setTestState('idle');
      setMsg('');
      setConfirmId(null);
      setDelText('');
      void load();
    }
  }, [open, load]);

  // Đổi nội dung ô nhập → phải kiểm tra lại trước khi được lưu.
  const changeValue = (v: string) => {
    setValue(v);
    setTestState('idle');
    setMsg('');
  };

  const test = useCallback(async () => {
    setTesting(true);
    setMsg('');
    try {
      const res = await fetch('/api/integration-keys/apify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value.trim(), test: true }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (body.ok) {
        setTestState('ok');
        setMsgErr(false);
        setMsg(t('testOk'));
      } else {
        setTestState('fail');
        setMsgErr(true);
        setMsg(body.error || t('testFail'));
      }
    } catch {
      setTestState('fail');
      setMsgErr(true);
      setMsg(t('testFail'));
    } finally {
      setTesting(false);
    }
  }, [value, t]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/integration-keys/apify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value.trim() }),
      });
      const body = (await res.json()) as { ok?: boolean; duplicate?: boolean; keys?: ApifyKey[]; error?: string };
      if (!res.ok || !body.ok) {
        setMsgErr(true);
        setMsg(body.error || t('testFail'));
        setTestState('fail');
        return;
      }
      setKeys(body.keys ?? []);
      setFallback(false);
      setValue('');
      setTestState('idle');
      setMsgErr(false);
      setMsg(body.duplicate ? t('duplicate') : '');
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }, [value, t, onChanged]);

  const remove = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/integration-keys/apify?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          const body = (await res.json()) as { keys: ApifyKey[]; usingFallback: boolean };
          setKeys(body.keys ?? []);
          setFallback(!!body.usingFallback);
          setConfirmId(null);
          setDelText('');
          onChanged?.();
        }
      } finally {
        setDeletingId(null);
      }
    },
    [onChanged],
  );

  return (
    <Modal open={open} onClose={onClose} title={t('title')}>
      <Modal.Section>
        <BlockStack gap="400">
          <Text as="p" tone="subdued">
            {t('desc')}
          </Text>

          {fallback ? <Banner tone="info">{t('fallbackNote')}</Banner> : null}

          {/* Danh sách khóa hiện có */}
          {loading ? (
            <Text as="p" tone="subdued">
              …
            </Text>
          ) : keys.length === 0 ? (
            <Text as="p" tone="subdued">
              {t('empty')}
            </Text>
          ) : (
            <BlockStack gap="300">
              {keys.map((k) => (
                <BlockStack key={k.id} gap="150">
                  <InlineStack align="space-between" blockAlign="center" wrap={false}>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">{t('active')}</Badge>
                      <Text as="span" fontWeight="medium">
                        {k.masked}
                      </Text>
                    </InlineStack>
                    {confirmId === k.id ? null : (
                      <Button
                        variant="tertiary"
                        tone="critical"
                        icon={DeleteIcon}
                        onClick={() => {
                          setConfirmId(k.id);
                          setDelText('');
                        }}
                        accessibilityLabel={t('delete')}
                      />
                    )}
                  </InlineStack>
                  {/* Xác nhận INLINE: gõ DELETE mới xóa được khóa này. */}
                  {confirmId === k.id ? (
                    <InlineStack gap="200" blockAlign="end" wrap={false}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <TextField
                          label={tc('deleteConfirmLabel')}
                          value={delText}
                          onChange={setDelText}
                          autoComplete="off"
                          placeholder="DELETE"
                        />
                      </div>
                      <Button
                        variant="primary"
                        tone="critical"
                        disabled={delText !== 'DELETE'}
                        loading={deletingId === k.id}
                        onClick={() => void remove(k.id)}
                      >
                        {t('delete')}
                      </Button>
                      <Button
                        onClick={() => {
                          setConfirmId(null);
                          setDelText('');
                        }}
                      >
                        {tc('cancel')}
                      </Button>
                    </InlineStack>
                  ) : null}
                </BlockStack>
              ))}
            </BlockStack>
          )}

          {/* Thêm khóa mới: nhập → Kiểm tra → Lưu (chỉ lưu được sau khi kiểm tra đạt) */}
          <BlockStack gap="200">
            <TextField
              label={t('addLabel')}
              value={value}
              onChange={changeValue}
              autoComplete="off"
              placeholder={t('placeholder')}
              helpText={t('addHelp')}
            />
            {msg ? (
              <Banner tone={msgErr ? 'critical' : 'success'}>{msg}</Banner>
            ) : null}
            <InlineStack gap="200">
              <Button onClick={() => void test()} loading={testing} disabled={value.trim().length < 10}>
                {t('test')}
              </Button>
              <Button
                variant="primary"
                onClick={() => void save()}
                loading={saving}
                disabled={testState !== 'ok'}
              >
                {t('save')}
              </Button>
            </InlineStack>
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

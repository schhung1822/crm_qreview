'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  Divider,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminDialog } from '@/components/admin/AdminDialog';

interface PromptVar {
  name: string;
  desc: string;
}
interface PromptDto {
  id: string;
  group: 'content' | 'edit' | 'analysis' | 'social' | 'image' | 'fragment';
  label: string;
  desc: string;
  image: boolean;
  hasSystem: boolean;
  vars: PromptVar[];
  defaultSystem: string;
  defaultUser: string;
  overrideSystem: string;
  overrideUser: string;
}

const GROUP_ORDER: PromptDto['group'][] = ['content', 'edit', 'analysis', 'social', 'image', 'fragment'];

export function PromptsAdmin() {
  const t = useTranslations('admin');
  const dlg = useAdminDialog();
  const [prompts, setPrompts] = useState<PromptDto[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Bản đang soạn cho từng prompt (khởi tạo = bản hiệu lực: override nếu có, else mặc định).
  const [edits, setEdits] = useState<Record<string, { system: string; user: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/prompts');
    if (!r.ok) {
      setPrompts([]);
      return;
    }
    const d = (await r.json()) as { prompts: PromptDto[] };
    setPrompts(d.prompts);
    const e: Record<string, { system: string; user: string }> = {};
    for (const p of d.prompts) {
      e[p.id] = {
        system: p.overrideSystem || p.defaultSystem,
        user: p.overrideUser || p.defaultUser,
      };
    }
    setEdits(e);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setOpen((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setField = (id: string, key: 'system' | 'user', val: string) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], [key]: val } }));

  // Chèn [ten_bien] vào cuối ô USER (tiện lựa chọn biến).
  const insertVar = (id: string, name: string) =>
    setEdits((e) => {
      const cur = e[id] ?? { system: '', user: '' };
      const sep = cur.user && !cur.user.endsWith(' ') && !cur.user.endsWith('\n') ? ' ' : '';
      return { ...e, [id]: { ...cur, user: `${cur.user}${sep}[${name}]` } };
    });

  const save = async (p: PromptDto) => {
    setBusy(p.id);
    setMsg(null);
    try {
      const cur = edits[p.id];
      // Chỉ lưu phần KHÁC mặc định (giống mặc định → gửi rỗng để về mặc định phần đó).
      const system = cur.system.trim() === p.defaultSystem.trim() ? '' : cur.system;
      const user = cur.user.trim() === p.defaultUser.trim() ? '' : cur.user;
      const r = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, system, user }),
      });
      if (r.ok) {
        setMsg({ ok: true, text: t('promptSaved') });
        await load();
      } else setMsg({ ok: false, text: t('promptSaveError') });
    } finally {
      setBusy(null);
    }
  };

  const reset = async (p: PromptDto) => {
    const ok = await dlg.confirm({
      title: t('promptReset'),
      message: t('promptResetConfirm'),
      tone: 'critical',
      confirmText: t('promptReset'),
    });
    if (!ok) return;
    setBusy(p.id);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/prompts?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
      if (r.ok) {
        setMsg({ ok: true, text: t('promptResetDone') });
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  const grouped = useMemo(() => {
    const g: Record<string, PromptDto[]> = {};
    for (const p of prompts ?? []) (g[p.group] ??= []).push(p);
    return g;
  }, [prompts]);

  if (!prompts) {
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );
  }

  const groupLabel: Record<string, string> = {
    content: t('promptGroupContent'),
    edit: t('promptGroupEdit'),
    analysis: t('promptGroupAnalysis'),
    social: t('promptGroupSocial'),
    image: t('promptGroupImage'),
    fragment: t('promptGroupFragment'),
  };

  return (
    <BlockStack gap="400">
      <Box paddingBlockEnd="100">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {t('promptTitle')}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            {t('promptSubtitle')}
          </Text>
        </BlockStack>
      </Box>

      {msg ? (
        <Banner tone={msg.ok ? 'success' : 'critical'} onDismiss={() => setMsg(null)}>
          {msg.text}
        </Banner>
      ) : null}

      {GROUP_ORDER.filter((g) => grouped[g]?.length).map((g) => (
        <BlockStack gap="200" key={g}>
          <Text as="h3" variant="headingSm">
            {groupLabel[g]}
          </Text>
          {grouped[g].map((p) => {
            const customized = !!(p.overrideSystem || p.overrideUser);
            const isOpen = open.has(p.id);
            const cur = edits[p.id] ?? { system: '', user: '' };
            return (
              <Card key={p.id}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center" wrap={false}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 0 }}
                    >
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" fontWeight="semibold">
                          {p.label}
                        </Text>
                        {customized ? (
                          <Badge tone="attention">{t('promptCustomized')}</Badge>
                        ) : (
                          <Badge>{t('promptDefault')}</Badge>
                        )}
                      </InlineStack>
                    </button>
                    <Button variant="tertiary" onClick={() => toggle(p.id)} disclosure={isOpen ? 'up' : 'down'}>
                      {isOpen ? t('promptCollapse') : t('promptEdit')}
                    </Button>
                  </InlineStack>

                  <Collapsible id={`prompt-${p.id}`} open={isOpen}>
                    <BlockStack gap="300">
                      <Text as="p" tone="subdued" variant="bodySm">
                        {p.desc}
                      </Text>

                      {/* Danh sách biến - bấm để chèn [ten_bien] vào ô nội dung */}
                      {p.vars.length ? (
                        <BlockStack gap="100">
                          <Text as="span" variant="bodySm" fontWeight="medium">
                            {t('promptVars')}
                          </Text>
                          <InlineStack gap="150" wrap>
                            {p.vars.map((v) => (
                              <Button key={v.name} size="micro" onClick={() => insertVar(p.id, v.name)}>
                                {`[${v.name}]`}
                              </Button>
                            ))}
                          </InlineStack>
                          <BlockStack gap="050">
                            {p.vars.map((v) => (
                              <Text key={v.name} as="span" tone="subdued" variant="bodySm">
                                <code>{`[${v.name}]`}</code> - {v.desc}
                              </Text>
                            ))}
                          </BlockStack>
                        </BlockStack>
                      ) : null}

                      {p.image ? (
                        <Banner tone="info">{t('promptImageNote')}</Banner>
                      ) : null}

                      {p.hasSystem ? (
                        <TextField
                          label={t('promptSystem')}
                          value={cur.system}
                          onChange={(val) => setField(p.id, 'system', val)}
                          multiline={4}
                          autoComplete="off"
                          monospaced
                        />
                      ) : null}

                      <TextField
                        label={p.image ? t('promptImageTemplate') : t('promptUser')}
                        value={cur.user}
                        onChange={(val) => setField(p.id, 'user', val)}
                        multiline={10}
                        autoComplete="off"
                        monospaced
                      />

                      <Divider />
                      <InlineStack gap="200">
                        <Button variant="primary" loading={busy === p.id} onClick={() => save(p)}>
                          {t('promptSave')}
                        </Button>
                        <Button
                          tone="critical"
                          variant="tertiary"
                          disabled={!customized || busy === p.id}
                          onClick={() => reset(p)}
                        >
                          {t('promptReset')}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Collapsible>
                </BlockStack>
              </Card>
            );
          })}
        </BlockStack>
      ))}
    </BlockStack>
  );
}

'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  FormLayout,
  InlineStack,
  Modal,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  ASSIGNABLE_ROLES,
  CUSTOMIZABLE_PERMISSIONS,
  CUSTOMIZABLE_ROLES,
  effectivePermissions,
  isFullAccessRole,
  type Permission,
  ROLE_LABELS,
  type Role,
} from '@/lib/auth/permissions';

interface Member {
  userId: string;
  role: Role;
  permissions: Permission[] | null;
  email: string;
  name: string;
  active: boolean;
  isOwner: boolean;
}

// Nhãn + mô tả ngắn cho từng quyền (dùng namespace 'users' i18n có sẵn).
const PERM_LABEL: Record<Permission, string> = {
  view: 'permView',
  'content:write': 'permWrite',
  'content:publish': 'permPublish',
  'connections:manage': 'permConnections',
  'aikeys:manage': 'permAiKeys',
  'users:manage': 'permUsers',
};
const PERM_DESC: Record<Permission, string> = {
  view: 'permViewDesc',
  'content:write': 'permWriteDesc',
  'content:publish': 'permPublishDesc',
  'connections:manage': 'permConnectionsDesc',
  'aikeys:manage': 'permAiKeysDesc',
  'users:manage': 'permUsersDesc',
};

function PermissionChecklist({
  selected,
  onToggle,
}: {
  selected: Set<Permission>;
  onToggle: (p: Permission) => void;
}) {
  const tu = useTranslations('users');
  return (
    <BlockStack gap="200">
      {CUSTOMIZABLE_PERMISSIONS.map((p) => (
        <Checkbox
          key={p}
          label={tu(PERM_LABEL[p])}
          helpText={tu(PERM_DESC[p])}
          checked={selected.has(p)}
          disabled={p === 'view'}
          onChange={() => onToggle(p)}
        />
      ))}
    </BlockStack>
  );
}

// Panel quản lý NHÂN VIÊN của một biz: thêm/xóa, vai trò + quyền tùy chỉnh RIÊNG trong biz này.
export function BizMembersPanel({ bizId, bizName }: { bizId: string; bizName: string }) {
  const t = useTranslations('biz');
  const tu = useTranslations('users'); // tái dùng nhãn quyền đã dịch sẵn
  const [members, setMembers] = useState<Member[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [permMember, setPermMember] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/biz/${bizId}/members`);
    if (!res.ok) {
      setMembers([]);
      setCanManage(false);
      return;
    }
    const d = await res.json();
    setMembers(d.members);
    setCanManage(Boolean(d.canManage));
  }, [bizId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(userId: string, role: Role) {
    setBusy(`role-${userId}`);
    try {
      await fetch(`/api/biz/${bizId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm(t('removeConfirm'))) return;
    setBusy(`rm-${userId}`);
    try {
      await fetch(`/api/biz/${bizId}/members?userId=${userId}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const roleLabel = (r: Role) => ROLE_LABELS[r];

  if (!members) return <Spinner size="small" />;

  return (
    <BlockStack gap="400">
      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center" wrap gap="200">
            <Text as="h2" variant="headingSm">
              {t('membersTitle', { name: bizName })}
            </Text>
            {canManage ? (
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                {t('addMember')}
              </Button>
            ) : null}
          </InlineStack>
          <Text as="p" tone="subdued" variant="bodySm">
            {t('isolationNote')}
          </Text>

          <BlockStack gap="0">
            {members.map((m) => (
              <Box key={m.userId} padding="300" borderBlockStartWidth="025" borderColor="border">
                <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                  <div style={{ minWidth: 0 }}>
                    <Text as="p" fontWeight="medium">
                      {m.name || m.email}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm" truncate>
                      {m.email}
                      {!m.active ? ` · ${t('inactive')}` : ''}
                    </Text>
                  </div>
                  <InlineStack gap="200" blockAlign="center">
                    {m.isOwner ? (
                      <Badge tone="info">{roleLabel('owner')}</Badge>
                    ) : canManage ? (
                      <div style={{ minWidth: 150 }}>
                        <Select
                          label=""
                          labelHidden
                          options={ASSIGNABLE_ROLES.map((r) => ({ label: ROLE_LABELS[r], value: r }))}
                          value={m.role}
                          onChange={(v) => changeRole(m.userId, v as Role)}
                          disabled={busy !== null}
                        />
                      </div>
                    ) : (
                      <Badge>{roleLabel(m.role)}</Badge>
                    )}
                    {canManage && !m.isOwner && CUSTOMIZABLE_ROLES.includes(m.role) ? (
                      <Button size="slim" onClick={() => setPermMember(m)} disabled={busy !== null}>
                        {tu('editPerms')}
                      </Button>
                    ) : null}
                    {canManage && !m.isOwner ? (
                      <Button
                        size="slim"
                        tone="critical"
                        variant="tertiary"
                        loading={busy === `rm-${m.userId}`}
                        onClick={() => removeMember(m.userId)}
                      >
                        {t('remove')}
                      </Button>
                    ) : null}
                  </InlineStack>
                </InlineStack>
              </Box>
            ))}
          </BlockStack>
        </BlockStack>
      </Card>

      {addOpen ? (
        <AddMemberModal
          bizId={bizId}
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            setAddOpen(false);
            setMsg({ ok: true, text: t('memberAdded') });
            await load();
          }}
        />
      ) : null}

      {permMember ? (
        <PermissionsModal
          bizId={bizId}
          member={permMember}
          onClose={() => setPermMember(null)}
          onSaved={async () => {
            setPermMember(null);
            await load();
          }}
        />
      ) : null}
    </BlockStack>
  );
}

// Modal phân quyền chi tiết cho 1 nhân viên (editor/viewer) TRONG biz.
function PermissionsModal({
  bizId,
  member,
  onClose,
  onSaved,
}: {
  bizId: string;
  member: Member;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations('biz');
  const tu = useTranslations('users');
  const [sel, setSel] = useState<Set<Permission>>(
    () => new Set(effectivePermissions(member.role, member.permissions ?? null)),
  );
  const [saving, setSaving] = useState<'save' | 'reset' | null>(null);

  const toggle = (p: Permission) =>
    setSel((prev) => {
      if (p === 'view') return prev;
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  async function submit(permissions: Permission[] | null, tag: 'save' | 'reset') {
    setSaving(tag);
    try {
      const res = await fetch(`/api/biz/${bizId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.userId, permissions }),
      });
      if (res.ok) await onSaved();
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={tu('permTitle', { name: member.name || member.email })}
      primaryAction={{
        content: tu('permSave'),
        onAction: () => submit([...sel], 'save'),
        loading: saving === 'save',
      }}
      secondaryActions={[
        {
          content: tu('permReset'),
          onAction: () => submit(null, 'reset'),
          loading: saving === 'reset',
          disabled: !member.permissions,
        },
        { content: t('cancel'), onAction: onClose },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" tone="subdued" variant="bodySm">
            {tu('permHint')}
          </Text>
          <PermissionChecklist selected={sel} onToggle={toggle} />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function AddMemberModal({
  bizId,
  onClose,
  onSaved,
}: {
  bizId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations('biz');
  const tu = useTranslations('users');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [customize, setCustomize] = useState(false);
  const [perms, setPerms] = useState<Set<Permission>>(() => new Set(effectivePermissions('editor', null)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeRole = (v: string) => {
    const r = v as Role;
    setRole(r);
    setPerms(new Set(effectivePermissions(r, null)));
    if (isFullAccessRole(r)) setCustomize(false);
  };
  const togglePerm = (p: Permission) =>
    setPerms((prev) => {
      if (p === 'view') return prev;
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const canCustomize = CUSTOMIZABLE_ROLES.includes(role);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body =
        mode === 'existing'
          ? { mode, email: email.trim(), role, ...(canCustomize && customize ? { permissions: [...perms] } : {}) }
          : {
              mode,
              email: email.trim(),
              name: name.trim(),
              password,
              role,
              ...(canCustomize && customize ? { permissions: [...perms] } : {}),
            };
      const res = await fetch(`/api/biz/${bizId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => null);
      if (res.ok) await onSaved();
      else setError(d?.error ?? t('addErr'));
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    mode === 'existing' ? Boolean(email.trim()) : Boolean(email.trim() && name.trim() && password.length >= 8);

  return (
    <Modal
      open
      onClose={onClose}
      title={t('addMember')}
      primaryAction={{ content: t('add'), onAction: save, loading: saving, disabled: !canSubmit }}
      secondaryActions={[{ content: t('cancel'), onAction: onClose }]}
    >
      <Modal.Section>
        <FormLayout>
          {error ? <Banner tone="critical">{error}</Banner> : null}
          <Select
            label={t('addMode')}
            options={[
              { label: t('modeExisting'), value: 'existing' },
              { label: t('modeNew'), value: 'new' },
            ]}
            value={mode}
            onChange={(v) => setMode(v as 'existing' | 'new')}
          />
          <TextField label={t('memberEmail')} type="email" value={email} onChange={setEmail} autoComplete="off" />
          {mode === 'new' ? (
            <>
              <TextField label={t('memberName')} value={name} onChange={setName} autoComplete="off" />
              <TextField
                label={t('memberPassword')}
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="off"
                helpText={t('passHint')}
              />
            </>
          ) : null}
          <Select
            label={t('memberRole')}
            options={ASSIGNABLE_ROLES.map((r) => ({ label: ROLE_LABELS[r], value: r }))}
            value={role}
            onChange={changeRole}
          />
          {canCustomize ? (
            <Checkbox label={tu('customizeToggle')} helpText={tu('customizeHint')} checked={customize} onChange={setCustomize} />
          ) : null}
          {canCustomize && customize ? <PermissionChecklist selected={perms} onToggle={togglePerm} /> : null}
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}

'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DataTable,
  FormLayout,
  InlineStack,
  Modal,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { PlusIcon } from '@/components/icons';
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

interface U {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  permissions?: Permission[];
}

// Nhãn + mô tả ngắn cho từng quyền (i18n). Bao gồm cả users:manage để đủ kiểu Permission,
// dù quyền này không nằm trong danh sách tùy chỉnh.
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

// Checklist quyền dùng chung cho modal tạo mới & modal phân quyền. 'view' luôn bật (nền tảng).
function PermissionChecklist({
  selected,
  onToggle,
}: {
  selected: Set<Permission>;
  onToggle: (p: Permission) => void;
}) {
  const t = useTranslations('users');
  return (
    <BlockStack gap="200">
      {CUSTOMIZABLE_PERMISSIONS.map((p) => (
        <Checkbox
          key={p}
          label={t(PERM_LABEL[p])}
          helpText={t(PERM_DESC[p])}
          checked={selected.has(p)}
          disabled={p === 'view'}
          onChange={() => onToggle(p)}
        />
      ))}
    </BlockStack>
  );
}

export default function UsersPage() {
  const t = useTranslations('users');
  const [users, setUsers] = useState<U[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [permUser, setPermUser] = useState<U | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/users');
    if (res.status === 403 || res.status === 401) {
      setForbidden(true);
      setUsers([]);
      return;
    }
    if (res.ok) setUsers((await res.json()).users);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) setUsers((await res.json()).users);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(`del-${id}`);
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) setUsers((await res.json()).users);
    } finally {
      setBusy(null);
    }
  }

  if (forbidden) {
    return (
      <Page title={t('title')}>
        <Banner tone="critical">{t('noPermission')}</Banner>
      </Page>
    );
  }

  const rows =
    users?.map((u) => [
      <Text as="span" fontWeight="semibold" key={`${u.id}-n`}>
        {u.name}
      </Text>,
      u.email,
      u.role === 'owner' ? (
        <Badge tone="info" key={`${u.id}-r`}>
          {ROLE_LABELS[u.role]}
        </Badge>
      ) : (
        <BlockStack gap="100" key={`${u.id}-r`}>
          <Select
            label=""
            labelHidden
            options={ASSIGNABLE_ROLES.map((r) => ({ label: ROLE_LABELS[r], value: r }))}
            value={u.role}
            onChange={(v) => patch(u.id, { role: v }, `role-${u.id}`)}
            disabled={busy !== null}
          />
          {CUSTOMIZABLE_ROLES.includes(u.role) ? (
            <Badge tone={u.permissions ? 'attention' : undefined}>
              {u.permissions ? t('customBadge') : t('permsDefault')}
            </Badge>
          ) : null}
        </BlockStack>
      ),
      <Badge key={`${u.id}-s`} tone={u.active ? 'success' : undefined}>
        {u.active ? t('active') : t('disabled')}
      </Badge>,
      u.role === 'owner' ? (
        <Text as="span" tone="subdued" key={`${u.id}-a`}>
          -
        </Text>
      ) : (
        <InlineStack key={`${u.id}-a`} gap="200" wrap={false} blockAlign="center">
          {CUSTOMIZABLE_ROLES.includes(u.role) ? (
            <Button size="slim" onClick={() => setPermUser(u)} disabled={busy !== null}>
              {t('editPerms')}
            </Button>
          ) : null}
          <Button
            size="slim"
            loading={busy === `act-${u.id}`}
            onClick={() => patch(u.id, { active: !u.active }, `act-${u.id}`)}
          >
            {u.active ? t('lock') : t('unlock')}
          </Button>
          <Button
            size="slim"
            variant="tertiary"
            tone="critical"
            loading={busy === `del-${u.id}`}
            onClick={() => remove(u.id)}
          >
            {t('delete')}
          </Button>
        </InlineStack>
      ),
    ]) ?? [];

  return (
    <Page
      title={t('title')}
      subtitle={t('subtitle')}
      primaryAction={{ content: t('add'), icon: PlusIcon, onAction: () => setOpen(true) }}
    >
      <Card padding="0">
        {users === null ? (
          <Box padding="400">
            <Spinner size="small" />
          </Box>
        ) : (
          <DataTable
            columnContentTypes={['text', 'text', 'text', 'text', 'text']}
            headings={[t('colName'), t('colEmail'), t('colRole'), t('colStatus'), '']}
            rows={rows}
          />
        )}
      </Card>

      {open ? (
        <AddUserModal
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await load();
          }}
        />
      ) : null}

      {permUser ? (
        <PermissionsModal
          user={permUser}
          onClose={() => setPermUser(null)}
          onSaved={(next) => {
            setUsers(next);
            setPermUser(null);
          }}
        />
      ) : null}
    </Page>
  );
}

// Modal phân quyền chi tiết cho một nhân viên (editor/viewer). Prefill từ quyền hiệu lực
// hiện tại. Lưu → gửi tập quyền; "Về mặc định" → gửi null (dùng lại mặc định vai trò).
function PermissionsModal({
  user,
  onClose,
  onSaved,
}: {
  user: U;
  onClose: () => void;
  onSaved: (users: U[]) => void;
}) {
  const t = useTranslations('users');
  const [sel, setSel] = useState<Set<Permission>>(
    () => new Set(effectivePermissions(user.role, user.permissions ?? null)),
  );
  const [saving, setSaving] = useState<'save' | 'reset' | null>(null);

  const toggle = (p: Permission) =>
    setSel((prev) => {
      if (p === 'view') return prev; // luôn bật
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  async function submit(permissions: Permission[] | null, tag: 'save' | 'reset') {
    setSaving(tag);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });
      if (res.ok) onSaved((await res.json()).users);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('permTitle', { name: user.name })}
      primaryAction={{
        content: t('permSave'),
        onAction: () => submit([...sel], 'save'),
        loading: saving === 'save',
      }}
      secondaryActions={[
        {
          content: t('permReset'),
          onAction: () => submit(null, 'reset'),
          loading: saving === 'reset',
          disabled: !user.permissions,
        },
        { content: t('cancel'), onAction: onClose },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" tone="subdued" variant="bodySm">
            {t('permHint')}
          </Text>
          <PermissionChecklist selected={sel} onToggle={toggle} />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const t = useTranslations('users');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [customize, setCustomize] = useState(false);
  const [perms, setPerms] = useState<Set<Permission>>(
    () => new Set(effectivePermissions('editor', null)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeRole = (v: string) => {
    const r = v as Role;
    setRole(r);
    // Đổi vai trò → nạp lại quyền mặc định của vai trò; vai trò toàn quyền thì tắt tùy chỉnh.
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
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          ...(canCustomize && customize ? { permissions: [...perms] } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) await onSaved();
      else setError(data.error ?? 'Lỗi');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = email.trim() && name.trim() && password.length >= 8;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('add')}
      primaryAction={{ content: t('save'), onAction: save, loading: saving, disabled: !canSubmit }}
      secondaryActions={[{ content: t('cancel'), onAction: onClose }]}
    >
      <Modal.Section>
        <FormLayout>
          {error ? <Banner tone="critical">{error}</Banner> : null}
          <TextField label={t('name')} value={name} onChange={setName} autoComplete="off" />
          <TextField label={t('email')} type="email" value={email} onChange={setEmail} autoComplete="off" />
          <TextField
            label={t('password')}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="off"
            helpText="≥ 8 ký tự"
          />
          <Select
            label={t('role')}
            options={ASSIGNABLE_ROLES.map((r) => ({ label: ROLE_LABELS[r], value: r }))}
            value={role}
            onChange={changeRole}
            helpText={t('roleHint')}
          />
          {canCustomize ? (
            <Checkbox
              label={t('customizeToggle')}
              helpText={t('customizeHint')}
              checked={customize}
              onChange={setCustomize}
            />
          ) : null}
          {canCustomize && customize ? (
            <PermissionChecklist selected={perms} onToggle={togglePerm} />
          ) : null}
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}

'use client';

import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Text,
  TextField,
} from '@shopify/polaris';
import { useEffect, useState } from 'react';
import { PolarisProvider } from '@/components/PolarisProvider';

// Trang đăng nhập (ngoài [locale]). Lần đầu (chưa có user) → form tạo CHỦ SỞ HỮU.
export default function LoginPage() {
  return (
    <PolarisProvider>
      <LoginInner />
    </PolarisProvider>
  );
}

function LoginInner() {
  // 'register' = tạo tài khoản; 'login' = đăng nhập. Người dùng tự chuyển qua lại.
  const [mode, setMode] = useState<'loading' | 'login' | 'register'>('loading');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: { user: unknown; needsSetup: boolean }) => {
        if (d.user) {
          window.location.href = '/vi/dashboard';
          return;
        }
        setNeedsSetup(d.needsSetup);
        // Chưa có tài khoản nào → mở thẳng màn tạo tài khoản (chủ sở hữu).
        setMode(d.needsSetup ? 'register' : 'login');
      })
      .catch(() => setMode('login'));
  }, []);

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const url = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body = mode === 'register' ? { email, name, password } : { email, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        window.location.href = '/vi/dashboard';
      } else {
        setError(data.error ?? 'Có lỗi xảy ra');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f1f1f1',
        padding: 20,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <BlockStack gap="400">
          <Box paddingBlockEnd="200">
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://noti.vn/image/new/logo-duong-ban.png"
                alt="Noti"
                style={{ height: 44, width: 'auto' }}
              />
            </div>
          </Box>
          {mode === 'loading' ? null : (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {mode === 'register'
                    ? needsSetup
                      ? 'Tạo tài khoản quản trị'
                      : 'Tạo tài khoản'
                    : 'Đăng nhập'}
                </Text>
                {mode === 'register' ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    {needsSetup
                      ? 'Lần đầu khởi tạo - tài khoản này là Chủ sở hữu, có toàn quyền.'
                      : 'Tài khoản mới mặc định quyền “Chỉ xem”; quản trị viên sẽ nâng quyền sau.'}
                  </Text>
                ) : null}
                {error ? <Banner tone="critical">{error}</Banner> : null}
                <FormLayout>
                  {mode === 'register' ? (
                    <TextField label="Họ tên" value={name} onChange={setName} autoComplete="name" />
                  ) : null}
                  <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                  />
                  <TextField
                    label="Mật khẩu"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    helpText={mode === 'register' ? 'Tối thiểu 8 ký tự' : undefined}
                  />
                  <Button variant="primary" fullWidth loading={busy} onClick={submit}>
                    {mode === 'register' ? 'Tạo & đăng nhập' : 'Đăng nhập'}
                  </Button>
                </FormLayout>

                {/* Chuyển qua lại giữa Đăng nhập / Tạo tài khoản (ẩn khi cần setup lần đầu) */}
                {needsSetup ? null : (
                  <Box paddingBlockStart="100">
                    <InlineStack gap="100" align="center" blockAlign="center">
                      <Text as="span" tone="subdued" variant="bodySm">
                        {mode === 'register' ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}
                      </Text>
                      <Button
                        variant="plain"
                        onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
                      >
                        {mode === 'register' ? 'Đăng nhập' : 'Tạo tài khoản'}
                      </Button>
                    </InlineStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          )}
        </BlockStack>
      </div>
    </div>
  );
}

'use client';

// Hộp thoại dùng chung cho Quản trị nền tảng: confirm / prompt / alert dạng POPUP Polaris (đồng bộ
// UI với web), thay cho window.confirm/prompt/alert. Dùng qua hook useAdminDialog().
import { Banner, BlockStack, Modal, Text, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type Tone = 'critical' | 'warning' | 'info';
export interface ConfirmOpts {
  title?: string;
  message?: string;
  tone?: Tone;
  confirmText?: string;
  cancelText?: string;
}
export interface PromptOpts extends ConfirmOpts {
  label?: string;
  inputType?: 'text' | 'password' | 'number';
  placeholder?: string;
  initialValue?: string;
  multiline?: boolean;
}
export interface AlertOpts {
  title?: string;
  message?: string;
  tone?: Tone;
  okText?: string;
}

interface Api {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
  alert: (o: AlertOpts) => Promise<void>;
}
const Ctx = createContext<Api | null>(null);
export function useAdminDialog(): Api {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdminDialog must be used within AdminDialogProvider');
  return c;
}

type State =
  | { kind: 'confirm'; opts: ConfirmOpts }
  | { kind: 'prompt'; opts: PromptOpts }
  | { kind: 'alert'; opts: AlertOpts }
  | null;

export function AdminDialogProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('admin');
  const [state, setState] = useState<State>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((v: unknown) => void) | null>(null);

  const settle = useCallback((result: unknown) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((res) => {
        resolver.current = res as (v: unknown) => void;
        setState({ kind: 'confirm', opts: o });
      }),
    [],
  );
  const prompt = useCallback(
    (o: PromptOpts) =>
      new Promise<string | null>((res) => {
        resolver.current = res as (v: unknown) => void;
        setValue(o.initialValue ?? '');
        setState({ kind: 'prompt', opts: o });
      }),
    [],
  );
  const alert = useCallback(
    (o: AlertOpts) =>
      new Promise<void>((res) => {
        resolver.current = () => res();
        setState({ kind: 'alert', opts: o });
      }),
    [],
  );
  const api = useMemo<Api>(() => ({ confirm, prompt, alert }), [confirm, prompt, alert]);

  // Đóng bằng X / nút phụ = hủy (false / null / void).
  const onDismiss = () => settle(state?.kind === 'confirm' ? false : state?.kind === 'prompt' ? null : undefined);
  const onPrimary = () => {
    if (state?.kind === 'prompt') settle(value.trim());
    else if (state?.kind === 'confirm') settle(true);
    else settle(undefined);
  };

  const opts = state?.opts;
  const tone = (opts && 'tone' in opts ? opts.tone : undefined) as Tone | undefined;
  const primaryText =
    state?.kind === 'alert'
      ? (state.opts.okText ?? t('dlgOk'))
      : state?.kind === 'prompt'
        ? (state.opts.confirmText ?? t('dlgConfirm'))
        : (state?.opts.confirmText ?? t('dlgConfirm'));

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal
        open={!!state}
        onClose={onDismiss}
        title={opts?.title ?? ''}
        primaryAction={{ content: primaryText, onAction: onPrimary, destructive: tone === 'critical' && state?.kind === 'confirm' }}
        secondaryActions={
          state?.kind === 'alert'
            ? undefined
            : [{ content: (state?.opts as ConfirmOpts)?.cancelText ?? t('dlgCancel'), onAction: onDismiss }]
        }
      >
        <Modal.Section>
          <BlockStack gap="300">
            {opts?.message ? (
              tone ? (
                <Banner tone={tone}>
                  <Text as="span">{opts.message}</Text>
                </Banner>
              ) : (
                <Text as="p">{opts.message}</Text>
              )
            ) : null}
            {state?.kind === 'prompt' ? (
              <TextField
                label={state.opts.label ?? ''}
                labelHidden={!state.opts.label}
                value={value}
                onChange={setValue}
                type={state.opts.inputType ?? 'text'}
                inputMode={state.opts.inputType === 'number' ? 'numeric' : undefined}
                placeholder={state.opts.placeholder}
                multiline={state.opts.multiline}
                autoComplete="off"
                autoFocus
              />
            ) : null}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Ctx.Provider>
  );
}

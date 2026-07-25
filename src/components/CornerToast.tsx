'use client';

// Thông báo nổi ở GÓC PHẢI màn hình (khác Toast Polaris mặc định nằm giữa-đáy). Tự trượt vào,
// tự ẩn sau `duration`ms, bấm nút X để đóng. Icon LUÔN là SVG (theo UI guideline).
import { Icon } from '@shopify/polaris';
import { CheckIcon, XSmallIcon } from '@shopify/polaris-icons';
import { useEffect, useState } from 'react';

export function CornerToast({
  message,
  onDismiss,
  duration = 4000,
}: {
  message: string;
  onDismiss: () => void;
  duration?: number;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(onDismiss, duration);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 72,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 360,
        padding: '12px 14px',
        background: 'var(--p-color-bg-surface, #fff)',
        border: '1px solid var(--p-color-border, #e1e1e1)',
        borderInlineStart: '4px solid var(--p-color-border-success, #2a7d4f)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.16)',
        transform: shown ? 'translateX(0)' : 'translateX(24px)',
        opacity: shown ? 1 : 0,
        transition: 'transform .25s ease, opacity .25s ease',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--p-color-bg-fill-success-secondary, #d7f0e0)',
        }}
      >
        <Icon source={CheckIcon} tone="success" />
      </span>
      <span style={{ fontWeight: 600, fontSize: 14 }}>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close"
        style={{
          marginInlineStart: 6,
          display: 'inline-flex',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 0,
        }}
      >
        <Icon source={XSmallIcon} tone="subdued" />
      </button>
    </div>
  );
}

// Mảnh UI dùng lại nhiều trang. Dùng Polaris + bộ icon SVG.
import { Badge, Card, InlineStack, Text } from '@shopify/polaris';
import type { CSSProperties, ReactNode } from 'react';

// Link RA NGOÀI app - LUÔN mở tab mới (target=_blank + rel an toàn). Dùng cho mọi link
// trỏ ra website ngoài / bài đã đăng. (Polaris Link external mở tab mới không ổn định
// nên dùng <a> thuần cho chắc.)
export function ExtLink({
  href,
  children,
  bold,
}: {
  href: string;
  children: ReactNode;
  bold?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--p-color-text-link)', fontWeight: bold ? 600 : undefined }}
    >
      {children}
    </a>
  );
}

export function ScoreRing({ value }: { value: number }) {
  const tone = value >= 80 ? '#29845a' : value >= 60 ? '#b98900' : '#c93b3b';
  const style = { '--p': value, '--c': tone } as CSSProperties;
  return (
    <div className="score-ring" style={style}>
      <span>{value}</span>
    </div>
  );
}

// Dải báo "AI đang làm việc" có hiệu ứng gradient chạy + chấm nảy (CSS ở globals.css).
// progress (tùy chọn) → thêm thanh tiến trình cho tác vụ quét/xử lý dữ liệu:
//   - số 0..100  → thanh xác định (biết % hoàn thành, vd viết hàng loạt done/total).
//   - 'indeterminate' → thanh chạy vô định (đang quét, chưa biết % - vd quét website).
export function AiWorking({
  text,
  progress,
}: {
  text: string;
  progress?: number | 'indeterminate';
}) {
  const pct =
    typeof progress === 'number' ? Math.max(0, Math.min(100, Math.round(progress))) : null;
  return (
    <div className="ai-working" role="status" aria-live="polite">
      <div className="ai-working__row">
        <span className="ai-working__dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="ai-working__text">{text}</span>
        {pct !== null ? <span className="ai-working__pct">{pct}%</span> : null}
      </div>
      {progress !== undefined ? (
        <div className="ai-working__bar" aria-hidden>
          {pct !== null ? (
            <div className="ai-working__bar-fill" style={{ width: `${pct}%` }} />
          ) : (
            <div className="ai-working__bar-indet" />
          )}
        </div>
      ) : null}
    </div>
  );
}

type Status =
  | 'published'
  | 'review'
  | 'draft'
  | 'needsWork'
  | 'outdated'
  | 'missing'
  | 'active'
  | 'warning';

const STATUS_TONE: Record<Status, 'success' | 'info' | 'attention' | 'warning' | undefined> = {
  published: 'success',
  active: 'success',
  review: 'info',
  draft: 'attention',
  needsWork: 'warning',
  outdated: 'warning',
  warning: 'warning',
  missing: undefined,
};

export function StatusBadge({ status, label }: { status: Status; label: string }) {
  return <Badge tone={STATUS_TONE[status]}>{label}</Badge>;
}

export function StatTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <Card>
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <div style={{ marginTop: 6 }}>
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
      </div>
      {delta ? (
        (() => {
          // Delta âm (bắt đầu bằng '-' hoặc '−') → mũi tên XUỐNG + tone critical, thay vì luôn xanh-lên.
          const down = /^\s*[-−]/.test(delta);
          return (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg
                width="11"
                height="11"
                viewBox="0 0 20 20"
                fill="none"
                stroke={down ? '#d12e2e' : '#29845a'}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={down ? { transform: 'rotate(180deg)' } : undefined}
              >
                <path d="m5 13 5-5 5 5" />
              </svg>
              <Text as="span" variant="bodySm" tone={down ? 'critical' : 'success'}>
                {delta}
              </Text>
            </div>
          );
        })()
      ) : null}
    </Card>
  );
}

export function MetricRow({ items }: { items: Array<{ label: string; value: string; delta?: string }> }) {
  return (
    <InlineStack gap="400" wrap>
      {items.map((it) => (
        <div key={it.label} style={{ flex: '1 1 180px', minWidth: 160 }}>
          <StatTile {...it} />
        </div>
      ))}
    </InlineStack>
  );
}

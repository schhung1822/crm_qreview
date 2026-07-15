'use client';

import { Icon, InlineStack, Popover } from '@shopify/polaris';
import { useState } from 'react';
import { HelpIcon } from './icons';

// Nút (i) nhỏ: bấm để MỞ popover giải thích chi tiết, bấm ra ngoài để đóng. Dùng cho các field
// (input/output/dropdown) mà người mới có thể chưa hiểu. Tự quản lý trạng thái mở.
// content hỗ trợ xuống dòng bằng "\n" (CSS white-space: pre-line).
export function InfoHint({ content, label }: { content: string; label?: string }) {
  const [active, setActive] = useState(false);
  return (
    <Popover
      active={active}
      onClose={() => setActive(false)}
      preferredAlignment="left"
      activator={
        <button
          type="button"
          className="info-hint__btn"
          aria-label={label ?? content}
          // Chặn propagation để bấm (i) KHÔNG focus/kích hoạt field bọc bởi <label>.
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActive((v) => !v);
          }}
        >
          <Icon source={HelpIcon} tone="subdued" />
        </button>
      }
    >
      <div className="info-hint__body">{content}</div>
    </Popover>
  );
}

// Nhãn field kèm (i). Truyền vào prop `label` của TextField/Select (nhận ReactNode).
// Dùng: label={<HelpLabel label={t('x.y')} help={t('x.yHelp')} />}
export function HelpLabel({ label, help }: { label: string; help: string }) {
  return (
    <InlineStack gap="050" blockAlign="center" wrap={false}>
      <span>{label}</span>
      <InfoHint content={help} label={label} />
    </InlineStack>
  );
}

"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  Checkbox as PolarisCheckbox,
  InlineStack,
  Labelled,
  Modal as PolarisModal,
  Spinner,
  Text,
} from "@shopify/polaris";
import React from "react";

/**
 * Cac manh giao dien dung chung cho moi trang quan tri website Qreview.
 *
 * Gom lai mot cho de tat ca man hinh CRUD trong giong nhau va hanh xu giong
 * nhau — nguoi quan tri hoc mot lan la dung duoc moi trang.
 *
 * Ban goc (du an Qreview) dung the HTML tu ve bang Tailwind. O day chung duoc
 * dung lai TREN Polaris — bo thanh phan ma phan con lai cua CRM dang dung. Giu
 * NGUYEN chu ky ham cua tung manh, nho vay 16 man hinh ben duoi khong phai sua
 * mot dong nao ma van doi duoc dien mao.
 */

// --- Thong bao -------------------------------------------------------------

export type Feedback = { type: "success" | "error"; text: string } | null;

export function FeedbackBox({ feedback }: { feedback: Feedback }) {
  if (!feedback) {
    return null;
  }

  return (
    <Box paddingBlockEnd="400">
      <Banner tone={feedback.type === "error" ? "critical" : "success"}>{feedback.text}</Banner>
    </Box>
  );
}

// --- Tieu de trang ---------------------------------------------------------

/**
 * Dau trang, dat trong `Page` cua Polaris.
 *
 * Khong dung thang thuoc tinh `title` cua `Page` vi moi man hinh o day tu render
 * phan dau cua no; lam nhu vay se phai boc lai toan bo 16 component. Kieu chu
 * lay dung thang do cua Polaris nen ket qua nhin khong khac gi tieu de that.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Box paddingBlockEnd="500">
      <InlineStack align="space-between" blockAlign="end" gap="400" wrap>
        <div className="min-w-0">
          <BlockStack gap="100">
            <Text as="h1" variant="headingLg">
              {title}
            </Text>
            {description && (
              <Text as="p" variant="bodySm" tone="subdued">
                {description}
              </Text>
            )}
          </BlockStack>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </InlineStack>
    </Box>
  );
}

// --- Truong nhap lieu ------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Labelled id={htmlFor ?? ""} label={label} requiredIndicator={required} helpText={hint}>
        {children}
      </Labelled>
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return <PolarisCheckbox label={label} checked={checked} onChange={onChange} helpText={hint} />;
}

// --- Nhan trang thai -------------------------------------------------------

type BadgeTone = React.ComponentProps<typeof Badge>["tone"];

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    active: { tone: "success", label: "Đang hiện" },
    inactive: { tone: undefined, label: "Đã ẩn" },
    draft: { tone: "attention", label: "Nháp" },
    blocked: { tone: "critical", label: "Đã khoá" },

    // Đánh giá & bình luận: không có bước duyệt, chỉ hiện hoặc ẩn.
    // `approved` là giá trị lưu trong CSDL cho trạng thái "đang hiện".
    approved: { tone: "success", label: "Đang hiện" },
    hidden: { tone: undefined, label: "Đã ẩn" },

    // Tin tức & bài viết.
    published: { tone: "success", label: "Đã đăng" },
  };

  const entry = map[status] ?? { tone: undefined, label: status };

  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

// --- Hop thoai -------------------------------------------------------------

/**
 * Polaris tu lo phan viec kho cua hop thoai: bay tieu diem, dong bang Escape,
 * khoa cuon trang nen, va gan `aria-modal`. Ban tu viet truoc day phai lam tay
 * tung thu mot; bo di la bot mot cho co the lech chuan tro nen.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <PolarisModal
      open={open}
      title={title}
      onClose={onClose}
      size={wide ? "large" : undefined}
      footer={footer}
    >
      <PolarisModal.Section>{children}</PolarisModal.Section>
    </PolarisModal>
  );
}

// --- Trang thai bang -------------------------------------------------------

export function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <Box padding="800">
        <div className="text-center">
          <Text as="p" variant="bodySm" tone="subdued">
            {message}
          </Text>
        </div>
      </Box>
    </Card>
  );
}

export function LoadingState({ message = "Đang tải dữ liệu..." }: { message?: string }) {
  return (
    <Card>
      <Box padding="800">
        <InlineStack align="center" blockAlign="center" gap="200">
          <Spinner size="small" accessibilityLabel={message} />
          <Text as="p" variant="bodySm" tone="subdued">
            {message}
          </Text>
        </InlineStack>
      </Box>
    </Card>
  );
}

// --- Tien ich hien thi -----------------------------------------------------

export function formatDateTime(iso: string | null) {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPrice(value: number) {
  if (!value) {
    return "—";
  }

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

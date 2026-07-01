'use client';

import {
  BlockStack,
  Card,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonPage,
} from '@shopify/polaris';

// Hiển thị NGAY khi chuyển tab (Suspense của segment [locale]) → người dùng thấy phản hồi
// tức thì thay vì đứng ở trang cũ ~0.5s chờ tab mới tải. Khung xương gọn kiểu Shopify.
export default function Loading() {
  return (
    <SkeletonPage primaryAction>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={3} />
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <SkeletonBodyText lines={5} />
          </BlockStack>
        </Card>
      </BlockStack>
    </SkeletonPage>
  );
}

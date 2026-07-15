'use client';

// Trang "Kết nối CMS" đã GỘP vào "Quản lý kết nối" (/settings). Giữ route này để các link/bookmark
// cũ vẫn hoạt động — chuyển hướng sang trang mới.
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ConnectionsRedirect() {
  const router = useRouter();
  const params = useParams();
  const locale = typeof params?.locale === 'string' ? params.locale : 'vi';
  useEffect(() => {
    router.replace(`/${locale}/settings`);
  }, [router, locale]);
  return null;
}

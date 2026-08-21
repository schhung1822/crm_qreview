import { Suspense } from "react";

import AffiliateLinkManager from "@/components/qreview/AffiliateLinkManager";

export const metadata = { title: "Link mua hàng" };

/** AffiliateLinkManager đọc ?productId= nên cần Suspense bao ngoài. */
const AdminAffiliateLinksPage = () => (
  <Suspense fallback={<div className="admin-card px-6 py-12 text-center admin-muted">Đang tải...</div>}>
    <AffiliateLinkManager />
  </Suspense>
);

export default AdminAffiliateLinksPage;

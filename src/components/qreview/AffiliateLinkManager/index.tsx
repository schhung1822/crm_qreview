"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import React, { useEffect, useState } from "react";

import {
  Checkbox,
  EmptyState,
  Field,
  FeedbackBox,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from "../ui";
import { useAdminResource } from "../ui/useAdminResource";

type AffiliateLink = {
  id: string;
  productId: string | null;
  productName: string | null;
  networkId: string | null;
  networkName: string | null;
  affiliateUrl: string | null;
  price: string | null;
  merchantName: string | null;
  isBest: boolean;
  sortOrder: number;
  status: string;
  note: string | null;
};

type Option = { id: string; name: string };

const EMPTY_FORM = {
  id: "",
  productId: "",
  networkId: "",
  affiliateUrl: "",
  price: "",
  merchantName: "",
  isBest: false,
  sortOrder: "0",
  status: "active",
  note: "",
};

type FormState = typeof EMPTY_FORM;

const AffiliateLinkManager = () => {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId") ?? "";

  const [productFilter, setProductFilter] = useState(initialProductId);
  const [products, setProducts] = useState<Option[]>([]);
  const [networks, setNetworks] = useState<Option[]>([]);

  const { items, isLoading, isSaving, feedback, create, update, remove } =
    useAdminResource<AffiliateLink>({
      endpoint: "/api/qreview/affiliate-links",
      collectionKey: "links",
      query: { productId: productFilter },
    });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/qreview/products", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/qreview/networks", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([productData, networkData]) => {
        if (!cancelled) {
          setProducts(productData?.products ?? []);
          setNetworks(networkData?.networks ?? []);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const setField =
    (key: keyof FormState) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
    };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, productId: productFilter });
    setIsModalOpen(true);
  };

  const openEdit = (link: AffiliateLink) => {
    setForm({
      id: link.id,
      productId: link.productId ?? "",
      networkId: link.networkId ?? "",
      affiliateUrl: link.affiliateUrl ?? "",
      price: link.price ?? "",
      merchantName: link.merchantName ?? "",
      isBest: link.isBest,
      sortOrder: String(link.sortOrder),
      status: link.status,
      note: link.note ?? "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = { ...form, sortOrder: Number(form.sortOrder) || 0 };
    const result = form.id ? await update(payload) : await create(payload);

    if (result.ok) {
      setIsModalOpen(false);
    }
  };

  const filteredProductName = products.find(
    (product) => product.id === productFilter
  )?.name;

  return (
    <>
      <PageHeader
        title="Link mua hàng"
        description="Link tiếp thị liên kết trỏ tới sàn TMĐT. Mỗi sản phẩm nên có link ở nhiều sàn để người đọc so giá."
        actions={
          <button type="button" onClick={openCreate} className="admin-btn-primary">
            <Plus size={14} aria-hidden /> Thêm link
          </button>
        }
      />

      <FeedbackBox feedback={feedback} />

      <div className="admin-card mb-4 p-4">
        <Field label="Lọc theo sản phẩm" htmlFor="link-filter">
          <select
            id="link-filter"
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
            className="admin-select max-w-xl"
          >
            <option value="">— Tất cả sản phẩm —</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </Field>

        {productFilter && filteredProductName && (
          <p className="mt-2 text-sm admin-muted">
            Đang xem link của <span className="font-medium">{filteredProductName}</span>.{" "}
            <Link
              href={`/qreview/products/${productFilter}`}
              className="underline underline-offset-2"
            >
              Mở trang sản phẩm
            </Link>
          </p>
        )}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Chưa có link mua hàng nào. Sản phẩm không có link sẽ không tạo ra doanh thu." />
      ) : (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Sàn</th>
                <th>Giá</th>
                <th>Link</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((link) => (
                <tr key={link.id}>
                  <td className="max-w-[240px]">
                    <div className="admin-table-title">{link.productName ?? "(đã xoá)"}</div>
                    {link.merchantName && (
                      <div className="text-xs admin-muted">{link.merchantName}</div>
                    )}
                  </td>
                  <td className="text-sm">{link.networkName ?? "—"}</td>
                  <td className="whitespace-nowrap text-sm">{link.price || "—"}</td>
                  <td className="max-w-[260px]">
                    {link.affiliateUrl ? (
                      <a
                        href={link.affiliateUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="admin-link block truncate text-xs underline-offset-2 hover:underline"
                        title={link.affiliateUrl}
                      >
                        {link.affiliateUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={link.status} />
                      {link.isBest && (
                        <span className="admin-badge-info">Giá tốt nhất</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(link)}
                        className="admin-action"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => remove(link.id, "Xoá link mua hàng này?")}
                        className="admin-action-danger"
                      >
                        Xoá
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={isModalOpen}
        title={form.id ? "Sửa link mua hàng" : "Thêm link mua hàng"}
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="admin-btn-secondary"
            >
              Huỷ
            </button>
            <button
              type="submit"
              form="link-form"
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? "Đang lưu..." : "Lưu"}
            </button>
          </>
        }
      >
        <form id="link-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Sản phẩm" htmlFor="lnk-product" required className="sm:col-span-2">
            <select
              id="lnk-product"
              value={form.productId}
              onChange={setField("productId")}
              required
              className="admin-select"
            >
              <option value="">— Chọn sản phẩm —</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Sàn TMĐT" htmlFor="lnk-network" required>
            <select
              id="lnk-network"
              value={form.networkId}
              onChange={setField("networkId")}
              required
              className="admin-select"
            >
              <option value="">— Chọn sàn —</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Tên người bán"
            htmlFor="lnk-merchant"
            hint="Ví dụ: Xiaomi Official Store"
          >
            <input
              id="lnk-merchant"
              value={form.merchantName}
              onChange={setField("merchantName")}
              className="admin-input"
            />
          </Field>

          <Field
            label="Link tiếp thị"
            htmlFor="lnk-url"
            required
            hint="Bắt buộc bắt đầu bằng http:// hoặc https://"
            className="sm:col-span-2"
          >
            <input
              id="lnk-url"
              type="url"
              value={form.affiliateUrl}
              onChange={setField("affiliateUrl")}
              required
              className="admin-input"
              placeholder="https://shopee.vn/..."
            />
          </Field>

          <Field
            label="Giá hiển thị"
            htmlFor="lnk-price"
            hint="Nhập kèm đơn vị, ví dụ: 24.990.000đ"
          >
            <input
              id="lnk-price"
              value={form.price}
              onChange={setField("price")}
              className="admin-input"
            />
          </Field>

          <Field label="Thứ tự hiển thị" htmlFor="lnk-sort" hint="Số nhỏ hiện trước.">
            <input
              id="lnk-sort"
              type="number"
              value={form.sortOrder}
              onChange={setField("sortOrder")}
              className="admin-input"
            />
          </Field>

          <Field label="Ghi chú nội bộ" htmlFor="lnk-note" className="sm:col-span-2">
            <textarea
              id="lnk-note"
              value={form.note}
              onChange={setField("note")}
              className="admin-textarea"
              placeholder="Ghi chú cho đội nội dung, không hiển thị ra ngoài"
            />
          </Field>

          <Field label="Trạng thái" htmlFor="lnk-status">
            <select
              id="lnk-status"
              value={form.status}
              onChange={setField("status")}
              className="admin-select"
            >
              <option value="active">Đang hiện</option>
              <option value="inactive">Đã ẩn</option>
            </select>
          </Field>

          <div className="flex items-end pb-2">
            <Checkbox
              label="Đánh dấu giá tốt nhất"
              checked={form.isBest}
              onChange={(value) => setForm((prev) => ({ ...prev, isBest: value }))}
              hint="Chỉ một link mỗi sản phẩm được đánh dấu; link cũ sẽ tự bỏ dấu."
            />
          </div>
        </form>
      </Modal>
    </>
  );
};

export default AffiliateLinkManager;

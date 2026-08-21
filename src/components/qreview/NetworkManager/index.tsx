"use client";

import { Plus } from "lucide-react";
import React, { useState } from "react";

import {
  EmptyState,
  Field,
  FeedbackBox,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from "../ui";
import { useAdminResource } from "../ui/useAdminResource";

type Network = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  trackingDomain: string | null;
  sortOrder: number;
  status: string;
  linkCount: number;
};

const EMPTY_FORM = {
  id: "",
  name: "",
  slug: "",
  logo: "",
  trackingDomain: "",
  sortOrder: "0",
  status: "active",
};

type FormState = typeof EMPTY_FORM;

const NetworkManager = () => {
  const { items, isLoading, isSaving, feedback, create, update, remove } =
    useAdminResource<Network>({
      endpoint: "/api/qreview/networks",
      collectionKey: "networks",
    });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const setField =
    (key: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
    };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (network: Network) => {
    setForm({
      id: network.id,
      name: network.name,
      slug: network.slug,
      logo: network.logo ?? "",
      trackingDomain: network.trackingDomain ?? "",
      sortOrder: String(network.sortOrder),
      status: network.status,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const result = form.id
      ? await update({ ...form, sortOrder: Number(form.sortOrder) || 0 })
      : await create({ ...form, sortOrder: Number(form.sortOrder) || 0 });

    if (result.ok) {
      setIsModalOpen(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Sàn thương mại điện tử"
        description="Nơi đặt link mua hàng: Shopee, Lazada, TikTok Shop..."
        actions={
          <button type="button" onClick={openCreate} className="admin-btn-primary">
            <Plus size={14} aria-hidden /> Thêm sàn
          </button>
        }
      />

      <FeedbackBox feedback={feedback} />

      {isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Chưa có sàn nào." />
      ) : (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Sàn</th>
                <th>Tên miền theo dõi</th>
                <th>Số link</th>
                <th>Thứ tự</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((network) => (
                <tr key={network.id}>
                  <td>
                    <div className="admin-table-title">{network.name}</div>
                    <div className="text-xs admin-muted">/{network.slug}</div>
                  </td>
                  <td className="max-w-[260px] truncate text-xs admin-muted">
                    {network.trackingDomain ?? "—"}
                  </td>
                  <td>{network.linkCount}</td>
                  <td>{network.sortOrder}</td>
                  <td>
                    <StatusBadge status={network.status} />
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(network)}
                        className="admin-action"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          remove(network.id, `Xoá sàn "${network.name}"?`)
                        }
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
        title={form.id ? "Sửa sàn TMĐT" : "Thêm sàn TMĐT"}
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
              form="network-form"
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? "Đang lưu..." : "Lưu"}
            </button>
          </>
        }
      >
        <form
          id="network-form"
          onSubmit={handleSubmit}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label="Tên sàn" htmlFor="net-name" required>
            <input
              id="net-name"
              value={form.name}
              onChange={setField("name")}
              required
              className="admin-input"
              placeholder="Shopee"
            />
          </Field>

          <Field label="Slug" htmlFor="net-slug" hint="Để trống sẽ tự sinh từ tên.">
            <input
              id="net-slug"
              value={form.slug}
              onChange={setField("slug")}
              className="admin-input"
              placeholder="shopee"
            />
          </Field>

          <Field
            label="Tên miền theo dõi"
            htmlFor="net-domain"
            hint="Trang gốc của sàn, dùng để nhận diện link."
            className="sm:col-span-2"
          >
            <input
              id="net-domain"
              type="url"
              value={form.trackingDomain}
              onChange={setField("trackingDomain")}
              className="admin-input"
              placeholder="https://shopee.vn/"
            />
          </Field>

          <Field
            label="Logo"
            htmlFor="net-logo"
            hint="Đường dẫn nội bộ (/images/...) hoặc URL đầy đủ."
            className="sm:col-span-2"
          >
            <input
              id="net-logo"
              value={form.logo}
              onChange={setField("logo")}
              className="admin-input"
              placeholder="/images/networks/shopee.png"
            />
          </Field>

          <Field label="Thứ tự hiển thị" htmlFor="net-sort" hint="Số nhỏ hiện trước.">
            <input
              id="net-sort"
              type="number"
              value={form.sortOrder}
              onChange={setField("sortOrder")}
              className="admin-input"
            />
          </Field>

          <Field label="Trạng thái" htmlFor="net-status">
            <select
              id="net-status"
              value={form.status}
              onChange={setField("status")}
              className="admin-select"
            >
              <option value="active">Đang hiện</option>
              <option value="inactive">Đã ẩn</option>
            </select>
          </Field>
        </form>
      </Modal>
    </>
  );
};

export default NetworkManager;

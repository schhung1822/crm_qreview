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

type Brand = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  web: string | null;
  description: string | null;
  country: string | null;
  sortOrder: number;
  status: string;
  productCount: number;
};

const EMPTY_FORM = {
  id: "",
  name: "",
  slug: "",
  logo: "",
  web: "",
  description: "",
  country: "",
  sortOrder: "0",
  status: "active",
};

type FormState = typeof EMPTY_FORM;

const BrandManager = () => {
  const { items, isLoading, isSaving, feedback, create, update, remove } =
    useAdminResource<Brand>({
      endpoint: "/api/qreview/brands",
      collectionKey: "brands",
    });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

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
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (brand: Brand) => {
    setForm({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logo: brand.logo ?? "",
      web: brand.web ?? "",
      description: brand.description ?? "",
      country: brand.country ?? "",
      sortOrder: String(brand.sortOrder),
      status: brand.status,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      ...form,
      sortOrder: Number(form.sortOrder) || 0,
    };

    const result = form.id ? await update(payload) : await create(payload);

    if (result.ok) {
      setIsModalOpen(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Thương hiệu"
        description="Hãng sản xuất của sản phẩm. Mỗi sản phẩm bắt buộc thuộc một thương hiệu."
        actions={
          <button type="button" onClick={openCreate} className="admin-btn-primary">
            <Plus size={14} aria-hidden /> Thêm thương hiệu
          </button>
        }
      />

      <FeedbackBox feedback={feedback} />

      {isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Chưa có thương hiệu nào. Hãy thêm thương hiệu đầu tiên." />
      ) : (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Thương hiệu</th>
                <th>Website</th>
                <th>Sản phẩm</th>
                <th>Thứ tự</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((brand) => (
                <tr key={brand.id}>
                  <td>
                    <div className="admin-table-title">{brand.name}</div>
                    <div className="text-xs admin-muted">/{brand.slug}</div>
                    {brand.country && (
                      <div className="text-xs admin-muted">{brand.country}</div>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate text-xs admin-muted">
                    {brand.web ?? "—"}
                  </td>
                  <td>{brand.productCount}</td>
                  <td>{brand.sortOrder}</td>
                  <td>
                    <StatusBadge status={brand.status} />
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(brand)}
                        className="admin-action"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          remove(
                            brand.id,
                            `Xoá thương hiệu "${brand.name}"? Thao tác này không thể hoàn tác.`
                          )
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
        title={form.id ? "Sửa thương hiệu" : "Thêm thương hiệu"}
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
              form="brand-form"
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? "Đang lưu..." : "Lưu"}
            </button>
          </>
        }
      >
        <form id="brand-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên thương hiệu" htmlFor="brand-name" required>
            <input
              id="brand-name"
              value={form.name}
              onChange={setField("name")}
              required
              className="admin-input"
              placeholder="Xiaomi"
            />
          </Field>

          <Field
            label="Slug"
            htmlFor="brand-slug"
            hint="Để trống sẽ tự sinh từ tên."
          >
            <input
              id="brand-slug"
              value={form.slug}
              onChange={setField("slug")}
              className="admin-input"
              placeholder="xiaomi"
            />
          </Field>

          <Field label="Quốc gia" htmlFor="brand-country">
            <input
              id="brand-country"
              value={form.country}
              onChange={setField("country")}
              className="admin-input"
              placeholder="Trung Quốc"
            />
          </Field>

          <Field
            label="Website"
            htmlFor="brand-web"
            hint="Phải bắt đầu bằng http:// hoặc https://"
          >
            <input
              id="brand-web"
              type="url"
              value={form.web}
              onChange={setField("web")}
              className="admin-input"
              placeholder="https://www.mi.com"
            />
          </Field>

          <Field
            label="Logo"
            htmlFor="brand-logo"
            hint="Đường dẫn nội bộ (/images/...) hoặc URL đầy đủ."
            className="sm:col-span-2"
          >
            <input
              id="brand-logo"
              value={form.logo}
              onChange={setField("logo")}
              className="admin-input"
              placeholder="/images/logo/xiaomi.webp"
            />
          </Field>

          <Field label="Mô tả" htmlFor="brand-desc" className="sm:col-span-2">
            <textarea
              id="brand-desc"
              value={form.description}
              onChange={setField("description")}
              className="admin-textarea"
              placeholder="Giới thiệu ngắn về thương hiệu"
            />
          </Field>

          <Field
            label="Thứ tự hiển thị"
            htmlFor="brand-sort"
            hint="Số nhỏ hiện trước."
          >
            <input
              id="brand-sort"
              type="number"
              value={form.sortOrder}
              onChange={setField("sortOrder")}
              className="admin-input"
            />
          </Field>

          <Field label="Trạng thái" htmlFor="brand-status">
            <select
              id="brand-status"
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

export default BrandManager;

"use client";

import { CornerDownRight, Plus } from "lucide-react";
import React, { useMemo, useState } from "react";

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

type Category = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  parentId: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  sortOrder: number;
  status: string;
  productCount: number;
};

const EMPTY_FORM = {
  id: "",
  name: "",
  slug: "",
  image: "",
  parentId: "",
  description: "",
  seoTitle: "",
  seoDescription: "",
  sortOrder: "0",
  status: "active",
};

type FormState = typeof EMPTY_FORM;

/**
 * Sap xep danh muc theo cay cha-con de bang hien thi dung thu bac.
 * Danh muc mo coi (cha da bi xoa) van duoc dua ve muc goc thay vi bien mat.
 */
function buildTree(categories: Category[]) {
  const byParent = new Map<string, Category[]>();
  const knownIds = new Set(categories.map((category) => category.id));

  for (const category of categories) {
    const parentKey =
      category.parentId && knownIds.has(category.parentId) ? category.parentId : "root";

    const bucket = byParent.get(parentKey) ?? [];
    bucket.push(category);
    byParent.set(parentKey, bucket);
  }

  const result: { category: Category; depth: number }[] = [];

  const walk = (parentKey: string, depth: number) => {
    const children = byParent.get(parentKey) ?? [];

    for (const category of children) {
      result.push({ category, depth });

      // Chan de quy vo han neu du lieu bi loi vong tron.
      if (depth < 5) {
        walk(category.id, depth + 1);
      }
    }
  };

  walk("root", 0);

  return result;
}

const CategoryManager = () => {
  const { items, isLoading, isSaving, feedback, create, update, remove } =
    useAdminResource<Category>({
      endpoint: "/api/qreview/categories",
      collectionKey: "categories",
    });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const tree = useMemo(() => buildTree(items), [items]);

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

  const openEdit = (category: Category) => {
    setForm({
      id: category.id,
      name: category.name,
      slug: category.slug,
      image: category.image ?? "",
      parentId: category.parentId ?? "",
      description: category.description ?? "",
      seoTitle: category.seoTitle ?? "",
      seoDescription: category.seoDescription ?? "",
      sortOrder: String(category.sortOrder),
      status: category.status,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      ...form,
      parentId: form.parentId || null,
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
        title="Danh mục"
        description="Cây danh mục sản phẩm. Mỗi danh mục có bộ thông số kỹ thuật riêng dùng khi nhập sản phẩm."
        actions={
          <button type="button" onClick={openCreate} className="admin-btn-primary">
            <Plus size={14} aria-hidden /> Thêm danh mục
          </button>
        }
      />

      <FeedbackBox feedback={feedback} />

      {isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Chưa có danh mục nào." />
      ) : (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Danh mục</th>
                <th>Sản phẩm</th>
                <th>Thứ tự</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(({ category, depth }) => (
                <tr key={category.id}>
                  <td>
                    <div
                      className="font-medium"
                      style={{ paddingLeft: `${depth * 20}px` }}
                    >
                      {depth > 0 && (
                        <CornerDownRight
                          size={13}
                          className="admin-faint mr-1 inline shrink-0 align-[-2px]"
                          aria-hidden
                        />
                      )}
                      {category.name}
                    </div>
                    <div
                      className="text-xs admin-muted"
                      style={{ paddingLeft: `${depth * 20}px` }}
                    >
                      /{category.slug}
                    </div>
                  </td>
                  <td>{category.productCount}</td>
                  <td>{category.sortOrder}</td>
                  <td>
                    <StatusBadge status={category.status} />
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(category)}
                        className="admin-action"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          remove(
                            category.id,
                            `Xoá danh mục "${category.name}"? Các định nghĩa thông số của danh mục này cũng sẽ bị xoá.`
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
        title={form.id ? "Sửa danh mục" : "Thêm danh mục"}
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
              form="category-form"
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? "Đang lưu..." : "Lưu"}
            </button>
          </>
        }
      >
        <form
          id="category-form"
          onSubmit={handleSubmit}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label="Tên danh mục" htmlFor="cat-name" required>
            <input
              id="cat-name"
              value={form.name}
              onChange={setField("name")}
              required
              className="admin-input"
              placeholder="Điện thoại & máy tính bảng"
            />
          </Field>

          <Field label="Slug" htmlFor="cat-slug" hint="Để trống sẽ tự sinh từ tên.">
            <input
              id="cat-slug"
              value={form.slug}
              onChange={setField("slug")}
              className="admin-input"
              placeholder="phone-tablet"
            />
          </Field>

          <Field
            label="Danh mục cha"
            htmlFor="cat-parent"
            hint="Để trống nếu đây là danh mục gốc."
          >
            <select
              id="cat-parent"
              value={form.parentId}
              onChange={setField("parentId")}
              className="admin-select"
            >
              <option value="">— Danh mục gốc —</option>
              {items
                .filter((category) => category.id !== form.id)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Thứ tự hiển thị" htmlFor="cat-sort" hint="Số nhỏ hiện trước.">
            <input
              id="cat-sort"
              type="number"
              value={form.sortOrder}
              onChange={setField("sortOrder")}
              className="admin-input"
            />
          </Field>

          <Field
            label="Ảnh danh mục"
            htmlFor="cat-image"
            hint="Đường dẫn nội bộ (/images/...) hoặc URL đầy đủ."
            className="sm:col-span-2"
          >
            <input
              id="cat-image"
              value={form.image}
              onChange={setField("image")}
              className="admin-input"
              placeholder="/images/categories/phone.png"
            />
          </Field>

          <Field label="Mô tả" htmlFor="cat-desc" className="sm:col-span-2">
            <textarea
              id="cat-desc"
              value={form.description}
              onChange={setField("description")}
              className="admin-textarea"
            />
          </Field>

          <Field label="Tiêu đề SEO" htmlFor="cat-seo-title" className="sm:col-span-2">
            <input
              id="cat-seo-title"
              value={form.seoTitle}
              onChange={setField("seoTitle")}
              className="admin-input"
            />
          </Field>

          <Field label="Mô tả SEO" htmlFor="cat-seo-desc" className="sm:col-span-2">
            <textarea
              id="cat-seo-desc"
              value={form.seoDescription}
              onChange={setField("seoDescription")}
              className="admin-textarea"
            />
          </Field>

          <Field label="Trạng thái" htmlFor="cat-status">
            <select
              id="cat-status"
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

export default CategoryManager;

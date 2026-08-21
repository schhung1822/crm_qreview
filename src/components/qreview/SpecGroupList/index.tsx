"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { ChevronRight, Layers, Plus } from "lucide-react";

import {
  Field,
  FeedbackBox,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from "../ui";
import { useAdminResource } from "../ui/useAdminResource";

/**
 * Danh sach NHOM THONG SO.
 *
 * Nhom thong so la khai niem DOC LAP voi danh muc: danh muc la cach nguoi doc
 * duyet trang, con nhom thong so la bo truong ky thuat de nhap va so sanh. Mot
 * danh muc co the dung nhieu nhom, va mot nhom cung dung duoc cho nhieu danh muc.
 *
 * Bam vao mot nhom se mo trang chi tiet de them/bot cac thong so trong nhom do.
 */

type SpecGroup = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  status: string;
  definitionCount: number;
  productCount: number;
};

const EMPTY_FORM = {
  name: "",
  slug: "",
  description: "",
  sortOrder: "0",
  status: "active",
};

const SpecGroupList = () => {
  const router = useRouter();

  const { items, isLoading, isSaving, feedback, create } = useAdminResource<SpecGroup>({
    endpoint: "/api/qreview/spec-groups",
    collectionKey: "groups",
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const result = await create({
      ...form,
      sortOrder: Number(form.sortOrder) || 0,
    });

    if (result.ok) {
      setIsModalOpen(false);
      setForm(EMPTY_FORM);
      // Tao xong thi vao thang trang chi tiet de them thong so — do la viec tiep
      // theo tu nhien, khoi phai tu tim lai nhom vua tao.
      router.refresh();
    }
  };

  return (
    <>
      <PageHeader
        title="Nhóm thông số kỹ thuật"
        description="Mỗi nhóm là một bộ trường kỹ thuật dùng cho một loại sản phẩm. Bấm vào nhóm để thêm/bớt các thông số bên trong."
        actions={
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_FORM);
              setIsModalOpen(true);
            }}
            className="admin-btn-primary"
          >
            <Plus size={15} /> Thêm nhóm
          </button>
        }
      />

      <FeedbackBox feedback={feedback} />

      {isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <div className="admin-card px-6 py-16 text-center">
          <Layers size={26} className="mx-auto" style={{ color: "var(--admin-faint)" }} />
          <p className="mx-auto mt-3 max-w-md text-[13px] admin-muted">
            Chưa có nhóm thông số nào. Hãy tạo nhóm theo loại sản phẩm bạn đang làm —
            ví dụ &quot;Điện thoại&quot;, &quot;Loa Bluetooth&quot;, &quot;Bàn phím cơ&quot;.
          </p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="admin-btn-primary mt-4"
          >
            <Plus size={15} /> Tạo nhóm đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((group) => (
            <Link
              key={group.id}
              href={`/qreview/specs/${group.id}`}
              className="admin-card group block p-4 transition hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Layers size={15} className="shrink-0" style={{ color: "var(--admin-faint)" }} />
                  <span className="truncate text-[14px] font-semibold">{group.name}</span>
                </div>

                <ChevronRight
                  size={16}
                  className="shrink-0 transition group-hover:translate-x-0.5"
                  style={{ color: "var(--admin-faint)" }}
                />
              </div>

              {group.description && (
                <p className="mt-1.5 line-clamp-2 text-xs admin-muted">{group.description}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                  className={
                    group.definitionCount > 0 ? "admin-badge-info" : "admin-badge-warning"
                  }
                >
                  {group.definitionCount > 0
                    ? `${group.definitionCount} thông số`
                    : "Chưa có thông số"}
                </span>
                <span className="admin-badge-neutral">
                  {group.productCount} sản phẩm
                </span>
                {group.status !== "active" && <StatusBadge status={group.status} />}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={isModalOpen}
        title="Thêm nhóm thông số"
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
              form="group-create-form"
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? "Đang tạo..." : "Tạo nhóm"}
            </button>
          </>
        }
      >
        <form id="group-create-form" onSubmit={handleSubmit} className="grid gap-4">
          <Field
            label="Tên nhóm"
            htmlFor="grp-name"
            required
            hint="Đặt theo loại sản phẩm, không phải theo danh mục. Ví dụ: Điện thoại, Loa Bluetooth, Bàn phím cơ."
          >
            <input
              id="grp-name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              autoFocus
              className="admin-input"
              placeholder="Điện thoại"
            />
          </Field>

          <Field label="Mô tả" htmlFor="grp-desc" hint="Ghi chú nội bộ, không bắt buộc.">
            <textarea
              id="grp-desc"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              className="admin-textarea min-h-[70px]"
              placeholder="Bộ thông số dùng cho điện thoại thông minh"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" htmlFor="grp-slug" hint="Để trống sẽ tự sinh từ tên.">
              <input
                id="grp-slug"
                value={form.slug}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                className="admin-input"
              />
            </Field>

            <Field label="Thứ tự hiển thị" htmlFor="grp-sort" hint="Số nhỏ hiện trước.">
              <input
                id="grp-sort"
                type="number"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sortOrder: event.target.value }))
                }
                className="admin-input"
              />
            </Field>
          </div>

          <p className="text-xs admin-muted">
            Sau khi tạo, bấm vào nhóm để thêm các thông số bên trong.
          </p>
        </form>
      </Modal>
    </>
  );
};

export default SpecGroupList;

"use client";

import React, { useState } from "react";

import {
  EmptyState,
  FeedbackBox,
  LoadingState,
  PageHeader,
  StatusBadge,
  formatDateTime,
} from "../ui";
import { useAdminResource } from "../ui/useAdminResource";

/**
 * Quan ly danh gia va binh luan.
 *
 * Noi dung khach gui hien NGAY tren trang, khong qua buoc duyet — de nguoi dung
 * thay dong gop cua minh xuat hien lap tuc. Admin can thiep sau: an di neu la
 * spam hoac noi dung khong phu hop, xoa han neu can.
 *
 * "An" giu nguyen du lieu (con xem lai va hien lai duoc), "Xoa" thi mat han.
 */

type Item = {
  id: string;
  productId: string | null;
  productName: string | null;
  title?: string | null;
  content: string;
  rating?: number;
  authorName: string;
  authorEmail: string | null;
  status: string;
  createdAt: string | null;
};

const STATUS_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "approved", label: "Đang hiện" },
  { value: "hidden", label: "Đã ẩn" },
];

const ReviewManager = () => {
  const [kind, setKind] = useState<"reviews" | "comments">("reviews");
  const [status, setStatus] = useState("");

  const { items, isLoading, isSaving, feedback, mutate } = useAdminResource<Item>({
    endpoint: "/api/qreview/reviews",
    collectionKey: "items",
    query: { kind, status },
  });

  /** Bật/tắt hiển thị. Dữ liệu được giữ nguyên trong cả hai trường hợp. */
  const toggleVisibility = (id: string, isHidden: boolean) =>
    mutate(
      "PATCH",
      { id, kind, status: isHidden ? "approved" : "hidden" },
      isHidden ? "Đã hiện lại nội dung." : "Đã ẩn nội dung khỏi trang."
    );

  // Khong dung `remove` cua hook: endpoint nay can biet dang xoa danh gia hay
  // binh luan, nen phai gui kem `kind`.
  const removeItem = (id: string, confirmText: string) => {
    if (!window.confirm(confirmText)) {
      return;
    }

    void mutate("DELETE", { id, kind }, "Đã xoá thành công.");
  };

  return (
    <>
      <PageHeader
        title="Đánh giá & bình luận"
        description="Nội dung người dùng gửi hiển thị ngay, không cần duyệt. Bạn có thể ẩn nội dung không phù hợp (vẫn giữ dữ liệu) hoặc xoá hẳn."
      />

      <FeedbackBox feedback={feedback} />

      <div className="admin-card mb-4 flex flex-wrap items-center gap-4 p-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind("reviews")}
            className={kind === "reviews" ? "admin-btn-primary" : "admin-btn-secondary"}
          >
            Đánh giá
          </button>
          <button
            type="button"
            onClick={() => setKind("comments")}
            className={kind === "comments" ? "admin-btn-primary" : "admin-btn-secondary"}
          >
            Bình luận
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="review-status" className="text-sm admin-muted">
            Trạng thái
          </label>
          <select
            id="review-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="admin-select w-auto"
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Không có nội dung nào khớp với bộ lọc." />
      ) : (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nội dung</th>
                <th>Sản phẩm</th>
                <th>Người gửi</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="max-w-[380px]">
                    {item.title && <div className="font-medium">{item.title}</div>}
                    {typeof item.rating === "number" && item.rating > 0 && (
                      <div className="text-xs" style={{ color: "var(--admin-warning)" }}>
                        {"★".repeat(item.rating)}
                        {"☆".repeat(Math.max(0, 5 - item.rating))}
                      </div>
                    )}
                    <p className="mt-1 whitespace-pre-wrap text-sm">{item.content}</p>
                  </td>
                  <td className="max-w-[180px] text-sm">
                    {item.productName ?? "(đã xoá)"}
                  </td>
                  <td className="text-sm">
                    <div>{item.authorName}</div>
                    {item.authorEmail && (
                      <div className="text-xs admin-muted">{item.authorEmail}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-xs admin-muted">
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          toggleVisibility(item.id, item.status !== "approved")
                        }
                        className="admin-action"
                      >
                        {item.status === "approved" ? "Ẩn" : "Hiện lại"}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          removeItem(
                            item.id,
                            kind === "reviews"
                              ? "Xoá vĩnh viễn đánh giá này? Các bình luận trả lời nó cũng sẽ bị xoá. Nếu chỉ muốn gỡ khỏi trang, hãy dùng nút Ẩn."
                              : "Xoá vĩnh viễn bình luận này? Nếu chỉ muốn gỡ khỏi trang, hãy dùng nút Ẩn."
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
    </>
  );
};

export default ReviewManager;

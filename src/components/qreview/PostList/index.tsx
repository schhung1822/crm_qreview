"use client";

import Link from "next/link";
import React, { useState } from "react";
import { Plus } from "lucide-react";

import {
  EmptyState,
  FeedbackBox,
  LoadingState,
  PageHeader,
  StatusBadge,
  formatDateTime,
} from "../ui";
import { useAdminResource } from "../ui/useAdminResource";

type Post = {
  id: string;
  title: string;
  slug: string;
  type: string;
  excerpt: string | null;
  coverImage: string | null;
  authorName: string | null;
  status: string;
  isFeatured: boolean;
  viewCount: number;
  productCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
};

export const POST_TYPE_LABELS: Record<string, string> = {
  news: "Tin tức",
  article: "Bài viết",
  review: "Bài đánh giá",
};

const POST_STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  published: "Đã đăng",
  hidden: "Đã ẩn",
};

const PostList = () => {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");

  const { items, isLoading, isSaving, feedback, remove } = useAdminResource<Post>({
    endpoint: "/api/qreview/posts",
    collectionKey: "posts",
    query: { q: appliedSearch, status, type },
  });

  return (
    <>
      <PageHeader
        title="Tin tức & bài viết"
        description="Nội dung biên tập của trang. Mỗi bài có thể gắn kèm sản phẩm đề xuất để dẫn người đọc tới link mua hàng."
        actions={
          <Link href="/qreview/posts/new" className="admin-btn-primary">
            <Plus size={15} /> Viết bài mới
          </Link>
        }
      />

      <FeedbackBox feedback={feedback} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedSearch(search);
        }}
        className="admin-card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_170px_170px_auto]"
      >
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo tiêu đề hoặc slug"
          className="admin-input"
        />

        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="admin-select"
        >
          <option value="">Mọi loại</option>
          {Object.entries(POST_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="admin-select"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(POST_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <button type="submit" className="admin-btn-primary">
          Tìm
        </button>
      </form>

      {isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Chưa có bài viết nào khớp với bộ lọc. Bấm “Viết bài mới” để bắt đầu." />
      ) : (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Bài viết</th>
                <th>Loại</th>
                <th>Sản phẩm</th>
                <th>Lượt xem</th>
                <th>Ngày đăng</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((post) => (
                <tr key={post.id}>
                  <td>
                    <div className="flex items-start gap-3">
                      {post.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.coverImage}
                          alt=""
                          className="admin-thumb h-12 w-16 shrink-0 rounded border object-cover"
                          style={{ borderColor: "var(--admin-border)" }}
                        />
                      ) : (
                        <span
                          className="flex h-12 w-16 shrink-0 items-center justify-center rounded border text-[10px] admin-muted"
                          style={{ borderColor: "var(--admin-border)" }}
                        >
                          Không ảnh
                        </span>
                      )}

                      <div className="min-w-0">
                        <Link
                          href={`/qreview/posts/${post.id}`}
                          className="admin-table-title hover:underline"
                        >
                          {post.title}
                        </Link>
                        <div className="truncate text-xs admin-muted">/{post.slug}</div>
                        {post.isFeatured && (
                          <span className="admin-badge-warning mt-1 inline-flex">
                            Nổi bật
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="text-[13px]">
                    {POST_TYPE_LABELS[post.type] ?? post.type}
                  </td>

                  <td>
                    {post.productCount > 0 ? (
                      <span className="admin-badge-info">{post.productCount}</span>
                    ) : (
                      <span className="admin-badge-neutral">0</span>
                    )}
                  </td>

                  <td className="text-[13px]">{post.viewCount.toLocaleString("vi-VN")}</td>

                  <td className="whitespace-nowrap text-xs admin-muted">
                    {formatDateTime(post.publishedAt)}
                  </td>

                  <td>
                    <StatusBadge status={post.status} />
                  </td>

                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/qreview/posts/${post.id}`} className="admin-action">
                        Sửa
                      </Link>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          remove(
                            post.id,
                            `Xoá bài viết "${post.title}"? Thao tác này không thể hoàn tác.`
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

export default PostList;

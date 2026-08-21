"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  FolderTree,
  Link2,
  MessageSquareText,
  Newspaper,
  Package,
  Plus,
  SlidersHorizontal,
  Star,
  Store,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

import { FeedbackBox, LoadingState, PageHeader, type Feedback } from "../ui";

type Stats = {
  products: number;
  activeProducts: number;
  productsWithoutLink: number;
  productsWithoutSpec: number;
  categories: number;
  brands: number;
  networks: number;
  affiliateLinks: number;
  specDefinitions: number;
  reviews: number;
  hiddenReviews: number;
  comments: number;
  hiddenComments: number;
  users: number;
  posts: number;
  publishedPosts: number;
  postsWithoutProduct: number;
};

function StatCard({
  label,
  value,
  href,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  href: string;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="admin-card admin-stat-card group block p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium admin-muted">{label}</p>
          <p className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em]">
            {value.toLocaleString("vi-VN")}
          </p>
        </div>
        <span className="admin-stat-icon">
          <Icon size={18} />
        </span>
      </div>
      {hint && <p className="mt-3 text-xs admin-muted">{hint}</p>}
    </Link>
  );
}

/** Viec can lam: chi hien khi thuc su co van de can xu ly. */
function TodoRow({
  count,
  label,
  actionLabel,
  href,
  tone,
}: {
  count: number;
  label: string;
  actionLabel: string;
  href: string;
  tone: "warning" | "danger";
}) {
  if (count === 0) {
    return null;
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-3 ${
        tone === "danger" ? "admin-alert-danger" : "admin-alert-warning"
      }`}
    >
      <AlertTriangle
        size={15}
        className="shrink-0"
        style={{ color: tone === "danger" ? "#dc2626" : "#b45309" }}
      />
      <span className="text-[13px]">
        <span className="font-semibold">{count}</span> {label}
      </span>
      <Link href={href} className="admin-action ml-auto">
        {actionLabel} →
      </Link>
    </li>
  );
}

const Dashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/qreview/stats", { cache: "no-store" });
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setFeedback({
            type: "error",
            text: data?.error ?? "Không tải được số liệu tổng quan.",
          });
          return;
        }

        setStats(data.stats);
      } catch {
        if (!cancelled) {
          setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Bảng điều khiển" />
        <LoadingState />
      </>
    );
  }

  // Danh gia khong con hang cho duyet, nen o day chi con viec ve noi dung.
  const hasTodos =
    stats &&
    (stats.productsWithoutLink > 0 ||
      stats.productsWithoutSpec > 0 ||
      stats.postsWithoutProduct > 0);

  return (
    <>
      <PageHeader
        title="Bảng điều khiển"
        description="Tình trạng nội dung và những việc cần xử lý."
        actions={
          <Link href="/qreview/products/new" className="admin-btn-primary">
            <Plus size={14} aria-hidden /> Thêm sản phẩm
          </Link>
        }
      />

      <FeedbackBox feedback={feedback} />

      {stats && (
        <>
          {hasTodos && (
            <section className="mb-6">
              <h2 className="admin-section-title mb-3">Việc cần làm</h2>
              <ul className="space-y-2">
                <TodoRow
                  count={stats.productsWithoutLink}
                  label="sản phẩm chưa có link mua hàng — chưa thể tạo doanh thu"
                  actionLabel="Thêm link"
                  href="/qreview/affiliate-links"
                  tone="danger"
                />
                <TodoRow
                  count={stats.productsWithoutSpec}
                  label="sản phẩm chưa có thông số kỹ thuật — không xuất hiện trong bảng so sánh"
                  actionLabel="Bổ sung"
                  href="/qreview/products"
                  tone="warning"
                />
                <TodoRow
                  count={stats.postsWithoutProduct}
                  label="bài đã đăng chưa gắn sản phẩm đề xuất — chưa dẫn người đọc tới link mua hàng"
                  actionLabel="Gắn sản phẩm"
                  href="/qreview/posts"
                  tone="warning"
                />
              </ul>
            </section>
          )}

          <section className="mb-6">
            <h2 className="admin-section-title mb-3">Nội dung</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Sản phẩm"
                value={stats.products}
                href="/qreview/products"
                hint={`${stats.activeProducts} đang hiển thị`}
                icon={Package}
              />
              <StatCard
                label="Đánh giá"
                value={stats.reviews}
                href="/qreview/reviews"
                hint={
                  stats.hiddenReviews
                    ? `${stats.hiddenReviews} đang ẩn`
                    : "Tất cả đang hiển thị"
                }
                icon={Star}
              />
              <StatCard
                label="Tin tức & bài viết"
                value={stats.posts}
                href="/qreview/posts"
                hint={`${stats.publishedPosts} đã đăng`}
                icon={Newspaper}
              />
              <StatCard
                label="Bình luận"
                value={stats.comments}
                href="/qreview/reviews"
                hint={
                  stats.hiddenComments
                    ? `${stats.hiddenComments} đang ẩn`
                    : "Tất cả đang hiển thị"
                }
                icon={MessageSquareText}
              />
              <StatCard
                label="Người dùng"
                value={stats.users}
                href="/qreview/users"
                icon={Users}
              />
            </div>
          </section>

          <section className="mb-6">
            <h2 className="admin-section-title mb-3">Phân loại</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Danh mục"
                value={stats.categories}
                href="/qreview/categories"
                icon={FolderTree}
              />
              <StatCard
                label="Thương hiệu"
                value={stats.brands}
                href="/qreview/brands"
                icon={Tags}
              />
              <StatCard
                label="Định nghĩa thông số"
                value={stats.specDefinitions}
                href="/qreview/specs"
                hint="Khuôn nhập thông số theo danh mục"
                icon={SlidersHorizontal}
              />
            </div>
          </section>

          <section>
            <h2 className="admin-section-title mb-3">Kiếm tiền</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Sàn TMĐT"
                value={stats.networks}
                href="/qreview/networks"
                icon={Store}
              />
              <StatCard
                label="Link mua hàng"
                value={stats.affiliateLinks}
                href="/qreview/affiliate-links"
                icon={Link2}
              />
            </div>
          </section>
        </>
      )}
    </>
  );
};

export default Dashboard;

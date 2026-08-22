"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { ArrowLeft, ImagePlus, Search, Upload } from "lucide-react";

import {
  Checkbox,
  Field,
  FeedbackBox,
  LoadingState,
  PageHeader,
  formatDateTime,
  type Feedback,
} from "../ui";
import ProductPicker, { type PickedProduct } from "./ProductPicker";
import RichTextEditor from "./RichTextEditor";

/**
 * Soan tin tuc / bai viet.
 *
 * Bo cuc hai cot giong form san pham: trai la noi dung, phai la cac quyet dinh
 * xuat ban. Phan "San pham de xuat" nam o cot trai vi no la mot phan cua noi
 * dung — bai viet dan nguoi doc toi san pham nao.
 */

const POST_TYPES = [
  { value: "news", label: "Tin tức" },
  { value: "article", label: "Bài viết" },
  { value: "review", label: "Bài đánh giá" },
];

const POST_STATUSES = [
  { value: "draft", label: "Nháp — chưa hiện ra ngoài" },
  { value: "published", label: "Đã đăng — hiện trên trang" },
  { value: "hidden", label: "Đã ẩn — gỡ khỏi trang, giữ dữ liệu" },
];

const EMPTY_FORM = {
  title: "",
  slug: "",
  type: "news",
  excerpt: "",
  content: "",
  coverImage: "",
  status: "draft",
  isFeatured: false,
  publishedAt: "",
};

type FormState = typeof EMPTY_FORM;

/** `datetime-local` cần dạng YYYY-MM-DDTHH:mm theo giờ máy người dùng. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const PostForm = ({ postId }: { postId?: string }) => {
  const router = useRouter();
  const isEditing = Boolean(postId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [products, setProducts] = useState<PickedProduct[]>([]);
  const [meta, setMeta] = useState<{ authorName: string | null; viewCount: number }>({
    authorName: null,
    viewCount: 0,
  });

  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const setField =
    (key: keyof FormState) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
    };

  useEffect(() => {
    if (!postId) return;

    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/qreview/posts/${postId}`, { cache: "no-store" });
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok || !data?.post) {
          setFeedback({ type: "error", text: data?.error ?? "Không tìm thấy bài viết." });
          return;
        }

        const post = data.post;

        setForm({
          title: post.title ?? "",
          slug: post.slug ?? "",
          type: post.type ?? "news",
          excerpt: post.excerpt ?? "",
          content: post.content ?? "",
          coverImage: post.coverImage ?? "",
          status: post.status ?? "draft",
          isFeatured: Boolean(post.isFeatured),
          publishedAt: toLocalInput(post.publishedAt),
        });

        setProducts(
          (post.products ?? []).map((item: PickedProduct) => ({
            ...item,
            note: item.note ?? "",
          }))
        );

        setMeta({ authorName: post.authorName ?? null, viewCount: post.viewCount ?? 0 });
      } catch {
        if (!cancelled) {
          setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setIsUploading(true);
    setFeedback(null);

    try {
      const body = new FormData();
      body.append("files", files[0]);

      const response = await fetch("/api/qreview/uploads", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as
        | { urls?: string[]; error?: string }
        | null;

      if (!response.ok) {
        setFeedback({
          type: "error",
          text: data?.error ?? `Không tải được ảnh (HTTP ${response.status}).`,
        });
        return;
      }

      const url = data?.urls?.[0];
      if (url) setForm((prev) => ({ ...prev, coverImage: url }));
    } catch {
      setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;

    setFeedback(null);

    if (!form.title.trim()) {
      setFeedback({ type: "error", text: "Vui lòng nhập tiêu đề bài viết." });
      return;
    }

    setIsSaving(true);

    const payload = {
      ...(postId ? { id: postId } : {}),
      ...form,
      // Chuyển giờ máy người dùng sang ISO để server hiểu đúng múi giờ.
      publishedAt: form.publishedAt
        ? new Date(form.publishedAt).toISOString()
        : "",
      products: products.map((item) => ({
        productId: item.productId,
        note: item.note,
      })),
    };

    try {
      const response = await fetch("/api/qreview/posts", {
        method: postId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setFeedback({ type: "error", text: data?.error ?? "Không lưu được bài viết." });
        return;
      }

      if (postId) {
        setFeedback({ type: "success", text: "Đã lưu thay đổi." });
      } else {
        router.push(`/qreview/posts/${data.post.id}`);
        router.refresh();
      }
    } catch {
      setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title={isEditing ? "Sửa bài viết" : "Viết bài mới"} />
        <LoadingState />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEditing ? "Sửa bài viết" : "Viết bài mới"}
        description={
          isEditing
            ? `${meta.authorName ? `Tác giả: ${meta.authorName} · ` : ""}${meta.viewCount.toLocaleString("vi-VN")} lượt xem`
            : "Bài mới mặc định ở trạng thái Nháp — chuyển sang Đã đăng khi sẵn sàng."
        }
        actions={
          <>
            <Link href="/qreview/posts" className="admin-btn-secondary">
              <ArrowLeft size={15} /> Danh sách
            </Link>
            <button
              type="submit"
              form="post-form"
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo bài viết"}
            </button>
          </>
        }
      />

      <FeedbackBox feedback={feedback} />

      <form id="post-form" onSubmit={handleSubmit}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* ================= CỘT TRÁI ================= */}
          <div className="min-w-0 space-y-4">
            <section className="admin-card p-5">
              <h2 className="admin-section-title mb-4">Nội dung</h2>

              <div className="grid gap-4">
                <Field label="Tiêu đề" htmlFor="po-title" required>
                  <input
                    id="po-title"
                    value={form.title}
                    onChange={setField("title")}
                    required
                    className="admin-input"
                    placeholder="Top 5 điện thoại đáng mua nhất 2026"
                  />
                </Field>

                <Field label="Slug" htmlFor="po-slug" hint="Để trống sẽ tự sinh từ tiêu đề.">
                  <input
                    id="po-slug"
                    value={form.slug}
                    onChange={setField("slug")}
                    className="admin-input"
                    placeholder="top-5-dien-thoai-dang-mua-2026"
                  />
                </Field>

                <Field
                  label="Mô tả ngắn"
                  htmlFor="po-excerpt"
                  hint="Hiển thị ở danh sách bài viết và dùng làm mô tả SEO."
                >
                  <textarea
                    id="po-excerpt"
                    value={form.excerpt}
                    onChange={setField("excerpt")}
                    className="admin-textarea min-h-[80px]"
                    placeholder="Tóm tắt 1-2 câu về nội dung bài viết"
                  />
                </Field>
              </div>
            </section>

            <section className="admin-card p-5">
              <h2 className="admin-section-title mb-1">Nội dung bài viết</h2>
              <p className="mb-4 text-xs admin-muted">
                Phần nội dung dài hiển thị ở trang chi tiết bài viết.
              </p>

              <RichTextEditor
                value={form.content}
                onChange={(content) => setForm((prev) => ({ ...prev, content }))}
                onFeedback={(message, type = "success") =>
                  setFeedback({ type, text: message })
                }
              />

              <div className="mt-3 grid gap-2 text-xs admin-muted sm:grid-cols-2">
                <p>• Dùng H2 cho mục lớn, H3 cho mục nhỏ; không chèn thêm H1 trong nội dung.</p>
                <p>• Khi dán bài từ trang khác, định dạng có ích được giữ lại và mã nguy hiểm bị loại bỏ.</p>
                <p>• Mỗi ảnh nên có mô tả alt và chú thích để hỗ trợ SEO, khả năng tiếp cận.</p>
                <p>• Ảnh ngoài có thể giữ nguyên link hoặc dùng nút tải xuống để lưu về QReview.</p>
              </div>
            </section>

            {/* --- Sản phẩm đề xuất --- */}
            <section className="admin-card p-5">
              <ProductPicker selected={products} onChange={setProducts} />
            </section>
          </div>

          {/* ================= CỘT PHẢI ================= */}
          <aside className="space-y-4">
            <section className="admin-card p-5">
              <h2 className="admin-section-title mb-4">Xuất bản</h2>

              <div className="space-y-4">
                <Field label="Trạng thái" htmlFor="po-status">
                  <select
                    id="po-status"
                    value={form.status}
                    onChange={setField("status")}
                    className="admin-select"
                  >
                    {POST_STATUSES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Ngày đăng"
                  htmlFor="po-published"
                  hint="Để trống sẽ lấy thời điểm đăng lần đầu."
                >
                  <input
                    id="po-published"
                    type="datetime-local"
                    value={form.publishedAt}
                    onChange={setField("publishedAt")}
                    className="admin-input"
                  />
                </Field>

                <Checkbox
                  label="Bài nổi bật"
                  checked={form.isFeatured}
                  onChange={(value) => setForm((prev) => ({ ...prev, isFeatured: value }))}
                  hint="Được ưu tiên hiển thị trước trong danh sách."
                />
              </div>
            </section>

            <section className="admin-card p-5">
              <h2 className="admin-section-title mb-4">Phân loại</h2>

              <Field label="Loại nội dung" htmlFor="po-type">
                <select
                  id="po-type"
                  value={form.type}
                  onChange={setField("type")}
                  className="admin-select"
                >
                  {POST_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </section>

            <section className="admin-card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="admin-section-title">Ảnh bìa</h2>

                <label className="admin-btn-secondary admin-btn-sm cursor-pointer">
                  <Upload size={13} />
                  {isUploading ? "Đang tải..." : "Tải lên"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    onChange={handleUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              </div>

              {form.coverImage ? (
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.coverImage}
                    alt="Ảnh bìa"
                    className="admin-thumb w-full rounded-lg border object-cover"
                    style={{ borderColor: "var(--admin-border)", maxHeight: 160 }}
                  />
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, coverImage: "" }))}
                    className="admin-action-danger mt-2"
                  >
                    Gỡ ảnh bìa
                  </button>
                </div>
              ) : (
                <label
                  className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed py-8 transition hover:bg-[var(--p-color-bg-surface-hover)]"
                  style={{ borderColor: "var(--admin-border-strong)" }}
                >
                  <ImagePlus size={20} style={{ color: "var(--admin-faint)" }} />
                  <span className="mt-2 text-xs admin-muted">Bấm để chọn ảnh</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    onChange={handleUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              )}

              <Field label="Hoặc nhập đường dẫn" htmlFor="po-cover" className="mt-3">
                <input
                  id="po-cover"
                  value={form.coverImage}
                  onChange={setField("coverImage")}
                  className="admin-input"
                  placeholder="/images/blog/blog-01.jpg"
                />
              </Field>
            </section>

            <section className="admin-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Search size={15} style={{ color: "var(--admin-faint)" }} />
                <h2 className="admin-section-title">SEO</h2>
              </div>

              <p className="mb-3 text-xs admin-muted">
                Tự động lấy từ tiêu đề và mô tả ngắn — không cần nhập riêng.
              </p>

              <div
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--admin-border)" }}
              >
                <p className="truncate text-[13px] font-medium admin-link">
                  {form.title || "Tiêu đề sẽ hiện ở đây"}
                </p>
                <p className="mt-1 line-clamp-2 text-xs admin-muted">
                  {form.excerpt || "Mô tả ngắn sẽ hiện ở đây"}
                </p>
              </div>
            </section>

            {isEditing && (
              <section className="admin-card p-5">
                <h2 className="admin-section-title mb-3">Thông tin</h2>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="admin-muted">Tác giả</dt>
                    <dd className="text-right">{meta.authorName ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="admin-muted">Lượt xem</dt>
                    <dd>{meta.viewCount.toLocaleString("vi-VN")}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="admin-muted">Ngày đăng</dt>
                    <dd className="text-right">
                      {form.publishedAt
                        ? formatDateTime(new Date(form.publishedAt).toISOString())
                        : "Chưa đăng"}
                    </dd>
                  </div>
                </dl>
              </section>
            )}
          </aside>
        </div>

        <div
          className="mt-4 flex flex-wrap justify-end gap-3 border-t pt-4"
          style={{ borderColor: "var(--admin-border)" }}
        >
          <Link href="/qreview/posts" className="admin-btn-secondary">
            Huỷ
          </Link>
          <button type="submit" disabled={isSaving} className="admin-btn-primary">
            {isSaving ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo bài viết"}
          </button>
        </div>
      </form>
    </>
  );
};

export default PostForm;

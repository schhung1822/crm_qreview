"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Search, Trash2, X } from "lucide-react";

import { Modal, formatPrice } from "../ui";

/**
 * Chon san pham de xuat cho bai viet.
 *
 * Hai phan:
 *   - Danh sach da chon: keo thu tu bang nut mui ten, moi muc co o ghi chu rieng
 *     (vi du "Lua chon dang tien nhat")
 *   - Hop thoai tim kiem: loc theo ten/slug, bam de them
 *
 * Danh sach san pham duoc nap MOT LAN roi loc o client. Trang nay chi co vai
 * tram san pham nen loc tai cho cho phan hoi tuc thi, khong can goi mang moi
 * lan go phim.
 */

export type PickedProduct = {
  productId: string;
  name: string;
  slug?: string;
  priceMin?: number;
  thumbnail?: string | null;
  brandName?: string | null;
  categoryName?: string | null;
  note: string;
};

type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  priceMin: number;
  thumbnail: string | null;
  brandName: string | null;
  categoryName: string | null;
  status: string;
};

/** Bo dau tieng Viet de go "dien thoai" van tim ra "Điện thoại". */
function foldAccents(value: string) {
  const decomposed = value.toLowerCase().replace(/đ/g, "d").normalize("NFD");

  let result = "";

  for (const char of decomposed) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue;
    result += char;
  }

  return result;
}

const ProductPicker = ({
  selected,
  onChange,
}: {
  selected: PickedProduct[];
  onChange: (next: PickedProduct[]) => void;
}) => {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Nạp danh mục sản phẩm lần đầu mở hộp thoại, không nạp sẵn khi vào trang.
  useEffect(() => {
    if (!isOpen || catalog.length > 0) return;

    let cancelled = false;
    setIsLoading(true);

    fetch("/api/qreview/products", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setCatalog(data?.products ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, catalog.length]);

  const selectedIds = useMemo(
    () => new Set(selected.map((item) => item.productId)),
    [selected]
  );

  const results = useMemo(() => {
    const needle = foldAccents(query.trim());

    if (!needle) return catalog;

    return catalog.filter(
      (product) =>
        foldAccents(product.name).includes(needle) ||
        product.slug.includes(needle) ||
        foldAccents(product.brandName ?? "").includes(needle)
    );
  }, [catalog, query]);

  const add = (product: CatalogProduct) => {
    if (selectedIds.has(product.id)) return;

    onChange([
      ...selected,
      {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        priceMin: product.priceMin,
        thumbnail: product.thumbnail,
        brandName: product.brandName,
        categoryName: product.categoryName,
        note: "",
      },
    ]);
  };

  const remove = (productId: string) => {
    onChange(selected.filter((item) => item.productId !== productId));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;

    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const setNote = (index: number, note: string) => {
    onChange(
      selected.map((item, position) => (position === index ? { ...item, note } : item))
    );
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="admin-section-title">Sản phẩm đề xuất</h2>
          <p className="mt-0.5 text-xs admin-muted">
            {selected.length > 0
              ? `${selected.length} sản phẩm · thứ tự bên dưới là thứ tự hiển thị trong bài`
              : "Gắn sản phẩm liên quan để dẫn người đọc tới link mua hàng."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="admin-btn-secondary admin-btn-sm"
        >
          <Plus size={13} /> Chọn sản phẩm
        </button>
      </div>

      {selected.length === 0 ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed py-8 transition hover:bg-[var(--p-color-bg-surface-hover)]"
          style={{ borderColor: "var(--admin-border-strong)" }}
        >
          <Plus size={20} style={{ color: "var(--admin-faint)" }} />
          <span className="mt-2 text-[13px] admin-muted">
            Chọn sản phẩm từ danh sách sản phẩm
          </span>
        </button>
      ) : (
        <ul className="space-y-2">
          {selected.map((item, index) => (
            <li
              key={item.productId}
              className="flex flex-wrap items-start gap-3 rounded-lg border p-3"
              style={{ borderColor: "var(--admin-border)" }}
            >
              <div className="flex flex-col gap-0.5 pt-1">
                <button
                  type="button"
                  aria-label="Lên trên"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="admin-action-muted"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  aria-label="Xuống dưới"
                  disabled={index === selected.length - 1}
                  onClick={() => move(index, 1)}
                  className="admin-action-muted"
                >
                  <ArrowDown size={13} />
                </button>
              </div>

              {item.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnail}
                  alt=""
                  className="admin-thumb h-12 w-12 shrink-0 rounded border object-contain"
                  style={{ borderColor: "var(--admin-border)" }}
                />
              ) : (
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded border text-[10px] admin-muted"
                  style={{ borderColor: "var(--admin-border)" }}
                >
                  —
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{item.name}</p>
                <p className="text-xs admin-muted">
                  {[item.brandName, item.categoryName].filter(Boolean).join(" · ") || "—"}
                  {item.priceMin ? ` · ${formatPrice(item.priceMin)}` : ""}
                </p>

                <input
                  value={item.note}
                  onChange={(event) => setNote(index, event.target.value)}
                  className="admin-input mt-2"
                  placeholder="Ghi chú hiển thị kèm, ví dụ: Lựa chọn đáng tiền nhất"
                />
              </div>

              <button
                type="button"
                aria-label="Bỏ sản phẩm"
                onClick={() => remove(item.productId)}
                className="admin-btn-danger admin-btn-sm"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={isOpen}
        title="Chọn sản phẩm đề xuất"
        onClose={() => setIsOpen(false)}
        wide
        footer={
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="admin-btn-primary"
          >
            Xong ({selected.length} sản phẩm)
          </button>
        }
      >
        <div className="relative mb-4">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--admin-faint)" }}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên, slug hoặc thương hiệu"
            className="admin-input pl-9"
            autoFocus
          />
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-[13px] admin-muted">Đang tải sản phẩm...</p>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-[13px] admin-muted">
            {catalog.length === 0
              ? "Chưa có sản phẩm nào trong hệ thống."
              : "Không tìm thấy sản phẩm phù hợp."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((product) => {
              const isPicked = selectedIds.has(product.id);

              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => (isPicked ? remove(product.id) : add(product))}
                    className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition hover:bg-[var(--p-color-bg-surface-hover)]"
                    style={{
                      borderColor: isPicked
                        ? "var(--admin-text)"
                        : "var(--admin-border)",
                    }}
                  >
                    {product.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.thumbnail}
                        alt=""
                        className="admin-thumb h-10 w-10 shrink-0 rounded object-contain"
                      />
                    ) : (
                      <span className="admin-thumb flex h-10 w-10 shrink-0 items-center justify-center rounded text-[10px] admin-muted">
                        —
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {product.name}
                      </span>
                      <span className="block truncate text-xs admin-muted">
                        {[product.brandName, product.categoryName]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                        {product.priceMin ? ` · ${formatPrice(product.priceMin)}` : ""}
                      </span>
                    </span>

                    <span
                      className={isPicked ? "admin-badge-info" : "admin-badge-neutral"}
                    >
                      {isPicked ? (
                        <>
                          <X size={11} className="mr-0.5" /> Bỏ chọn
                        </>
                      ) : (
                        <>
                          <Plus size={11} className="mr-0.5" /> Thêm
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
};

export default ProductPicker;

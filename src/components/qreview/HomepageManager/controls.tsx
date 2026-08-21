"use client";

import React, { useMemo, useState } from "react";
import { ImagePlus, Link2Off, Search, Upload, X } from "lucide-react";

import { Field } from "../ui";

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  shortDesc: string | null;
  priceMin: number;
  priceMax: number;
  thumbnail: string | null;
  brandName: string | null;
  categoryName: string | null;
  status: string;
};

function foldAccents(value: string) {
  return value
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function ProductPicker({
  id,
  value,
  products,
  onChange,
}: {
  id: string;
  value: string;
  products: CatalogProduct[];
  onChange: (product: CatalogProduct | null) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = products.find((product) => product.id === value) ?? null;
  const results = useMemo(() => {
    const needle = foldAccents(query.trim());
    if (!needle) return [];

    return products
      .filter((product) =>
        [product.name, product.slug, product.brandName ?? ""]
          .map(foldAccents)
          .some((text) => text.includes(needle))
      )
      .slice(0, 8);
  }, [products, query]);

  return (
    <Field
      label="Sản phẩm liên kết"
      htmlFor={id}
      hint="Chọn sản phẩm để tự điền tên, mô tả, ảnh và link. Bạn vẫn có thể sửa lại sau đó."
      className="sm:col-span-2"
    >
      {value && (
        <div className="homepage-product-selected">
          {selected?.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.thumbnail} alt="" />
          ) : (
            <span className="homepage-product-placeholder">—</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">
              {selected?.name ?? `Sản phẩm #${value}`}
            </p>
            <p className="truncate text-[11px] admin-muted">
              {[selected?.brandName, selected?.categoryName]
                .filter(Boolean)
                .join(" · ") || "Đang liên kết"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="admin-action-muted"
            aria-label="Bỏ liên kết sản phẩm"
            title="Bỏ liên kết"
          >
            <Link2Off size={15} />
          </button>
        </div>
      )}

      <div className="homepage-product-search">
        <Search size={15} aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={selected ? "Tìm sản phẩm khác..." : "Tìm theo tên, slug hoặc thương hiệu..."}
          autoComplete="off"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Xoá tìm kiếm">
            <X size={14} />
          </button>
        )}
      </div>

      {query.trim() && (
        <div className="homepage-product-results">
          {results.length ? (
            results.map((product) => (
              <button
                type="button"
                key={product.id}
                onClick={() => {
                  onChange(product);
                  setQuery("");
                }}
                className={product.id === value ? "is-selected" : ""}
              >
                {product.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.thumbnail} alt="" />
                ) : (
                  <span className="homepage-product-placeholder">—</span>
                )}
                <span className="min-w-0 flex-1">
                  <strong>{product.name}</strong>
                  <small>
                    {[product.brandName, product.categoryName]
                      .filter(Boolean)
                      .join(" · ") || "Chưa phân loại"}
                    {product.status !== "active" ? " · Đang ẩn/nháp" : ""}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p>Không tìm thấy sản phẩm phù hợp.</p>
          )}
        </div>
      )}
    </Field>
  );
}

export function ImageField({
  id,
  label,
  value,
  onChange,
  hint = "Hỗ trợ JPG, PNG, WEBP, GIF hoặc AVIF, tối đa 5 MB.",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setError("");

    try {
      const body = new FormData();
      body.append("files", file);
      const response = await fetch("/api/qreview/uploads", { method: "POST", body });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error ?? "Không tải được ảnh.");
        return;
      }

      if (data?.urls?.[0]) onChange(data.urls[0]);
    } catch {
      setError("Không kết nối được tới máy chủ.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void uploadFile(file);
    event.target.value = "";
  };

  return (
    <Field label={label} htmlFor={id} hint={hint} className="sm:col-span-2">
      <div
        className="homepage-image-field"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) void uploadFile(file);
        }}
      >
        <div className="homepage-image-preview">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" />
          ) : (
            <ImagePlus size={24} aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <input
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="admin-input"
            placeholder="/images/..."
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="admin-btn-secondary admin-btn-sm cursor-pointer">
              <Upload size={13} />
              {isUploading ? "Đang tải..." : "Tải ảnh / kéo thả"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                onChange={handleFile}
                disabled={isUploading}
                className="hidden"
              />
            </label>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="admin-btn-secondary admin-btn-sm"
              >
                Gỡ ảnh
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-xs" style={{ color: "var(--admin-danger)" }}>{error}</p>}
        </div>
      </div>
    </Field>
  );
}

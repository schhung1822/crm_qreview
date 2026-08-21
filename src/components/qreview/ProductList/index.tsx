"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  ImageOff,
  PackageSearch,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  FeedbackBox,
  PageHeader,
  StatusBadge,
  formatPrice,
  type Feedback,
} from "../ui";
import { useAdminResource } from "../ui/useAdminResource";

type Product = {
  id: string;
  name: string;
  slug: string;
  brandName: string | null;
  categoryName: string | null;
  priceMin: number;
  priceMax: number;
  status: string;
  imageCount: number;
  linkCount: number;
  reviewCount: number;
  thumbnail: string | null;
};

type Option = { id: string; name: string };

type SpecGroup = Option & {
  definitionCount: number;
  productCount: number;
};

type CsvImportResult = {
  total: number;
  created: number;
  updated: number;
  failed: number;
  downloadedImages: number;
  errors: Array<{ row: number; message: string }>;
};

/** So dong khung xuong hien trong luc cho du lieu. */
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

const ProductList = () => {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");

  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [specGroups, setSpecGroups] = useState<SpecGroup[]>([]);

  // Khu nhap/xuat CSV chi hien khi can: da so lan vao trang la de xem va sua
  // danh sach, khong phai de nhap file.
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvGroupId, setCsvGroupId] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvBusy, setCsvBusy] = useState<"export" | "import" | null>(null);
  const [csvFeedback, setCsvFeedback] = useState<Feedback>(null);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items, isLoading, isSaving, feedback, load, remove } = useAdminResource<Product>({
    endpoint: "/api/qreview/products",
    collectionKey: "products",
    query: { q: appliedSearch, categoryId, brandId },
  });

  const hasFilter = Boolean(appliedSearch || categoryId || brandId);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/qreview/categories", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/qreview/brands", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/qreview/spec-groups", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([categoryData, brandData, groupData]) => {
        if (!cancelled) {
          setCategories(categoryData?.categories ?? []);
          setBrands(brandData?.brands ?? []);
          setSpecGroups(groupData?.groups ?? []);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const clearFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setCategoryId("");
    setBrandId("");
  };

  const exportCsv = async () => {
    if (!csvGroupId || csvBusy) {
      setCsvFeedback({ type: "error", text: "Vui lòng chọn nhóm thông số cần xuất." });
      return;
    }

    setCsvBusy("export");
    setCsvFeedback(null);
    setImportResult(null);

    try {
      const response = await fetch(
        `/api/qreview/products/csv?specGroupId=${encodeURIComponent(csvGroupId)}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setCsvFeedback({
          type: "error",
          text: data?.error ?? "Không thể xuất file CSV.",
        });
        return;
      }

      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "san-pham.csv";
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setCsvFeedback({ type: "success", text: "Đã xuất file CSV theo nhóm thông số." });
    } catch {
      setCsvFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
    } finally {
      setCsvBusy(null);
    }
  };

  const importCsv = async () => {
    if (!csvGroupId) {
      setCsvFeedback({ type: "error", text: "Vui lòng chọn nhóm thông số của file." });
      return;
    }
    if (!csvFile) {
      setCsvFeedback({ type: "error", text: "Vui lòng chọn file CSV cần nhập." });
      return;
    }
    if (csvBusy) return;

    setCsvBusy("import");
    setCsvFeedback(null);
    setImportResult(null);

    try {
      const body = new FormData();
      body.append("specGroupId", csvGroupId);
      body.append("file", csvFile);

      const response = await fetch("/api/qreview/products/csv", {
        method: "POST",
        body,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCsvFeedback({
          type: "error",
          text: data?.error ?? "Không thể nhập file CSV.",
        });
        return;
      }

      const result = data?.result as CsvImportResult;
      setImportResult(result);
      setCsvFeedback({
        type: result.failed ? "error" : "success",
        text: result.failed
          ? `Đã xử lý ${result.total} dòng: thêm ${result.created}, cập nhật ${result.updated}, lỗi ${result.failed}.`
          : `Đã nhập ${result.total} dòng: thêm ${result.created}, cập nhật ${result.updated}, tải ${result.downloadedImages} ảnh.`,
      });
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch {
      setCsvFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
    } finally {
      setCsvBusy(null);
    }
  };

  return (
    /* Bang san pham nhieu cot nen trang nay xin them be ngang so voi mac dinh. */
    <div className="admin-page-wide">
      <PageHeader
        title="Sản phẩm"
        description="Mỗi sản phẩm cần có danh mục, thương hiệu, thông số kỹ thuật và ít nhất một link mua hàng."
        actions={
          <>
            <button
              type="button"
              onClick={() => setCsvOpen((open) => !open)}
              aria-expanded={csvOpen}
              className="admin-btn-secondary"
            >
              <FileSpreadsheet size={14} aria-hidden="true" />
              CSV
            </button>
            <Link href="/qreview/products/new" className="admin-btn-primary">
              Thêm sản phẩm
            </Link>
          </>
        }
      />

      <FeedbackBox feedback={feedback} />
      <FeedbackBox feedback={csvFeedback} />

      {csvOpen && (
        <section className="admin-card mb-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="product-csv-group">
              Nhóm thông số
            </label>
            <select
              id="product-csv-group"
              value={csvGroupId}
              onChange={(event) => {
                setCsvGroupId(event.target.value);
                setCsvFeedback(null);
                setImportResult(null);
              }}
              className="admin-select admin-select-sm min-w-[190px] flex-1 sm:max-w-[280px]"
            >
              <option value="">Chọn nhóm thông số</option>
              {specGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={!csvGroupId || csvBusy !== null}
              className="admin-btn-secondary admin-input-sm px-3"
            >
              <Download size={14} aria-hidden="true" />
              {csvBusy === "export" ? "Đang xuất..." : "Xuất"}
            </button>

            <span
              className="mx-1 hidden h-6 w-px sm:block"
              style={{ backgroundColor: "var(--admin-border)" }}
              aria-hidden="true"
            />

            <input
              ref={fileInputRef}
              id="product-csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setCsvFile(event.target.files?.[0] ?? null);
                setCsvFeedback(null);
                setImportResult(null);
              }}
              className="sr-only"
            />
            <label
              htmlFor="product-csv-file"
              className="admin-btn-secondary admin-input-sm px-3 max-w-[220px] cursor-pointer"
              title={csvFile?.name}
            >
              <Upload size={14} aria-hidden="true" />
              <span className="truncate">{csvFile?.name ?? "Chọn file"}</span>
            </label>

            <button
              type="button"
              onClick={() => void importCsv()}
              disabled={!csvGroupId || !csvFile || csvBusy !== null}
              className="admin-btn-primary admin-input-sm px-3"
            >
              {csvBusy === "import" ? "Đang nhập..." : "Nhập"}
            </button>
          </div>

          {importResult?.errors?.length ? (
            <div className="admin-alert-warning mt-3">
              <p className="font-medium">Các dòng chưa nhập được:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {importResult.errors.map((error) => (
                  <li key={`${error.row}-${error.message}`}>
                    Dòng {error.row}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      {/*
        Bo loc nam ngay tren bang trong cung mot the: khi loc khong ra ket qua,
        nguoi dung thay lien o loc de sua thay vi phai cuon nguoc len.
      */}
      <div className="admin-card overflow-hidden">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search);
          }}
          className="admin-toolbar"
        >
          <div className="admin-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên hoặc slug"
              aria-label="Tìm sản phẩm"
            />
          </div>

          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            aria-label="Lọc theo danh mục"
            className="admin-select admin-select-sm w-auto min-w-[150px]"
          >
            <option value="">Mọi danh mục</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            aria-label="Lọc theo thương hiệu"
            className="admin-select admin-select-sm w-auto min-w-[150px]"
          >
            <option value="">Mọi thương hiệu</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>

          <button type="submit" className="admin-btn-secondary admin-input-sm px-3">
            Tìm
          </button>

          {hasFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="admin-action-muted inline-flex items-center gap-1"
            >
              <X size={13} aria-hidden="true" />
              Bỏ lọc
            </button>
          )}

          <span className="ml-auto hidden text-xs admin-muted sm:block">
            {isLoading ? "Đang tải..." : `${items.length} sản phẩm`}
          </span>
        </form>

        <div className="admin-table-wrap">
          <table className="admin-table" aria-busy={isLoading}>
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Danh mục</th>
                <th>Giá</th>
                <th>Link mua</th>
                <th>Trạng thái</th>
                <th>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>

            {/*
              Luc tai va luc rong van giu nguyen khung bang: dau trang khong
              nhay khi du lieu ve, va thanh loc phia tren luon o nguyen cho.
            */}
            {isLoading ? (
              <tbody>
                {SKELETON_ROWS.map((row) => (
                  <tr key={row} aria-hidden="true">
                    <td className="align-middle">
                      <div className="flex items-center gap-3">
                        <span className="admin-skeleton h-11 w-11 shrink-0 rounded-lg" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <span className="admin-skeleton h-3 w-1/2" />
                          <span className="admin-skeleton h-2.5 w-1/4" />
                        </div>
                      </div>
                    </td>
                    <td className="align-middle">
                      <span className="admin-skeleton h-3 w-24" />
                    </td>
                    <td className="align-middle">
                      <span className="admin-skeleton h-3 w-20" />
                    </td>
                    <td className="align-middle">
                      <span className="admin-skeleton h-3 w-8" />
                    </td>
                    <td className="align-middle">
                      <span className="admin-skeleton h-5 w-20 rounded-md" />
                    </td>
                    <td className="align-middle">
                      <span className="admin-skeleton ml-auto h-8 w-[68px] rounded-lg" />
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : items.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <span className="admin-empty-icon">
                      <PackageSearch size={20} aria-hidden="true" />
                    </span>
                    <p className="mt-3 text-sm font-medium">
                      {hasFilter ? "Không tìm thấy sản phẩm" : "Chưa có sản phẩm nào"}
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-[13px] admin-muted">
                      {hasFilter
                        ? "Thử đổi từ khoá hoặc bỏ bớt bộ lọc đang áp dụng."
                        : "Thêm sản phẩm đầu tiên để bắt đầu xây dựng danh mục."}
                    </p>
                    <div className="mt-4">
                      {hasFilter ? (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="admin-btn-secondary admin-input-sm px-3"
                        >
                          <X size={14} aria-hidden="true" />
                          Bỏ lọc
                        </button>
                      ) : (
                        <Link
                          href="/qreview/products/new"
                          className="admin-btn-primary admin-input-sm px-3"
                        >
                          Thêm sản phẩm
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {items.map((product) => (
                  <tr key={product.id} className="group">
                    <td className="align-middle">
                      <div className="flex items-center gap-3">
                        {product.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.thumbnail}
                            alt=""
                            className="admin-row-thumb"
                          />
                        ) : (
                          <span className="admin-row-thumb admin-row-thumb-empty">
                            <ImageOff size={15} aria-hidden="true" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <Link
                            href={`/qreview/products/${product.id}`}
                            className="admin-table-title hover:underline"
                          >
                            {product.name}
                          </Link>
                          <div className="truncate text-xs admin-muted">
                            /{product.slug} · {product.imageCount} ảnh
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Danh muc va thuong hieu di lien nhau nen gop mot cot cho bang gon. */}
                    <td className="align-middle">
                      <div>{product.categoryName ?? "—"}</div>
                      <div className="text-xs admin-muted">{product.brandName ?? "—"}</div>
                    </td>
                    <td className="whitespace-nowrap align-middle tabular-nums">
                      <div>{formatPrice(product.priceMin)}</div>
                      {/* Chi hien khoang gia khi cac phien ban that su khac gia nhau. */}
                      {product.priceMax > product.priceMin && (
                        <div className="text-xs admin-muted">
                          đến {formatPrice(product.priceMax)}
                        </div>
                      )}
                    </td>
                    <td className="align-middle">
                      {product.linkCount > 0 ? (
                        <span className="tabular-nums">{product.linkCount}</span>
                      ) : (
                        <Link
                          href={`/qreview/affiliate-links?productId=${product.id}`}
                          className="admin-badge-danger underline-offset-2 hover:underline"
                        >
                          Chưa có
                        </Link>
                      )}
                    </td>
                    <td className="align-middle">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="align-middle">
                      <div className="flex justify-end gap-1 opacity-60 transition group-hover:opacity-100">
                        <Link
                          href={`/qreview/products/${product.id}`}
                          className="admin-icon-btn"
                          title="Sửa sản phẩm"
                        >
                          <Pencil size={15} aria-hidden="true" />
                          <span className="sr-only">Sửa</span>
                        </Link>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() =>
                            remove(
                              product.id,
                              `Xoá sản phẩm "${product.name}"? Toàn bộ ảnh, thông số, link mua hàng, đánh giá và bình luận của sản phẩm này cũng sẽ bị xoá.`
                            )
                          }
                          className="admin-icon-btn admin-icon-btn-danger"
                          title="Xoá sản phẩm"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          <span className="sr-only">Xoá</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductList;

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  GripVertical,
  ImagePlus,
  Link2,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
  Youtube,
} from "lucide-react";
import {
  extractYouTubeVideoId,
  getYouTubeThumbnailUrl,
} from "@/lib/qreview/youtube";

import {
  Checkbox,
  Field,
  FeedbackBox,
  LoadingState,
  PageHeader,
  type Feedback,
} from "../ui";

/**
 * Form them/sua san pham.
 *
 * Bo cuc hai cot: cot trai la noi dung chinh (thong tin, anh, thong so), cot
 * phai la cac quyet dinh xuat ban (trang thai, danh muc, thuong hieu, gia).
 * Nhu vay thu phai nhap nhieu chu nam o vung rong, con cac lua chon ngan gon
 * luon nhin thay duoc khi cuon.
 *
 * Thong so ky thuat: chon MOT nhom -> form hien dung cac o cua nhom do.
 */

type Option = { id: string; name: string };

type SpecGroup = {
  id: string;
  name: string;
  definitionCount: number;
};

type SpecDefinition = {
  id: string;
  groupId: string;
  specKey: string;
  label: string;
  section: string | null;
  unit: string | null;
  dataType: string;
  options: string[];
  placeholder: string | null;
  isRequired: boolean;
  isComparable: boolean;
  isHighlight: boolean;
  sortOrder: number;
};

type ImageItem = { url: string; isThumbnail: boolean; colorId: string | null };

type VideoItem = {
  id?: string;
  url: string;
  title: string;
};

const MAX_PRODUCT_VIDEOS = 10;

type ColorItem = {
  clientId: string;
  name: string;
  hexCode: string;
  sortOrder: number;
  status: string;
};

type AffiliateLinkItem = {
  id?: string;
  networkId: string;
  affiliateUrl: string;
  price: string;
  merchantName: string;
  isBest: boolean;
  sortOrder: number;
  status: string;
  note: string;
};

/** Thong so nhap tay, ngoai bo dinh nghia cua nhom. */
type CustomSpec = { label: string; value: string; unit: string };

const EMPTY_FORM = {
  name: "",
  slug: "",
  brandId: "",
  categoryId: "",
  specGroupId: "",
  shortDesc: "",
  content: "",
  priceMin: "",
  priceMax: "",
  status: "active",
  segmentLabel: "",
  compareEnabled: true,
};

type FormState = typeof EMPTY_FORM;

/** Ô nhập giá hiển thị kèm định dạng nghìn cho dễ đọc. */
function formatVnd(value: string) {
  const number = Number(value);
  if (!value || !Number.isFinite(number) || number <= 0) return "";
  return new Intl.NumberFormat("vi-VN").format(number) + " ₫";
}

function createClientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Mot phan cua form: dai tieu de co vien duoi, nut rieng cua phan do nam ben
 * phai, noi dung o duoi. Dung chung cho ca 7 phan de chung deu nhau.
 */
function FormSection({
  title,
  description,
  action,
  bodyClassName = "admin-form-section-body",
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-card overflow-hidden">
      <header className="admin-form-section-head">
        <div className="min-w-0">
          <h2 className="admin-section-title">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs admin-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Khung viền đứt dùng cho các phần chưa có dữ liệu. */
function SectionPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border border-dashed px-4 py-6 text-center text-[13px] admin-muted"
      style={{ borderColor: "var(--admin-border-strong)" }}
    >
      {children}
    </div>
  );
}

const ProductForm = ({ productId }: { productId?: string }) => {
  const router = useRouter();
  const isEditing = Boolean(productId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [brands, setBrands] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [networks, setNetworks] = useState<Option[]>([]);
  const [specGroups, setSpecGroups] = useState<SpecGroup[]>([]);
  const [definitions, setDefinitions] = useState<SpecDefinition[]>([]);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const [customSpecs, setCustomSpecs] = useState<CustomSpec[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [imageDropTargetIndex, setImageDropTargetIndex] = useState<number | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [colors, setColors] = useState<ColorItem[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLinkItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false);
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

  // --- Nạp dữ liệu ban đầu -------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const requests = [
          fetch("/api/qreview/brands", { cache: "no-store" }),
          fetch("/api/qreview/categories", { cache: "no-store" }),
          fetch("/api/qreview/spec-groups", { cache: "no-store" }),
          fetch("/api/qreview/networks", { cache: "no-store" }),
        ];

        if (productId) {
          requests.push(fetch(`/api/qreview/products/${productId}`, { cache: "no-store" }));
        }

        const responses = await Promise.all(requests);
        const [brandData, categoryData, groupData, networkData, productData] = await Promise.all(
          responses.map((response) => response.json())
        );

        if (cancelled) return;

        setBrands(brandData?.brands ?? []);
        setCategories(categoryData?.categories ?? []);
        setSpecGroups(groupData?.groups ?? []);
        setNetworks(networkData?.networks ?? []);

        if (productData?.product) {
          const product = productData.product;

          setForm({
            name: product.name ?? "",
            slug: product.slug ?? "",
            brandId: product.brandId ?? "",
            categoryId: product.categoryId ?? "",
            specGroupId: product.specGroupId ?? "",
            shortDesc: product.shortDesc ?? "",
            content: product.content ?? "",
            priceMin: product.priceMin ? String(product.priceMin) : "",
            priceMax: product.priceMax ? String(product.priceMax) : "",
            status: product.status ?? "active",
            segmentLabel: product.segmentLabel ?? "",
            compareEnabled: product.compareEnabled !== false,
          });

          setColors(product.colors ?? []);
          setImages(
            (product.images ?? []).map((image: ImageItem) => ({
              ...image,
              colorId: image.colorId ?? null,
            }))
          );
          setVideos(
            (product.videos ?? []).map((video: VideoItem) => ({
              id: video.id,
              url: video.url ?? "",
              title: video.title ?? "",
            }))
          );
          setAffiliateLinks(
            (product.affiliateLinks ?? []).map((link: AffiliateLinkItem) => ({
              ...link,
              affiliateUrl: link.affiliateUrl ?? "",
              price: link.price ?? "",
              merchantName: link.merchantName ?? "",
              note: link.note ?? "",
            }))
          );

          const stored: Record<string, string> = {};
          for (const spec of product.specs ?? []) {
            stored[spec.specKey] = spec.value;
          }
          setSpecValues(stored);
        } else if (productId) {
          setFeedback({ type: "error", text: "Không tìm thấy sản phẩm." });
        }
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
  }, [productId]);

  // Nhóm thông số độc lập với danh mục nên không tự chọn theo danh mục:
  // "Phụ kiện công nghệ" có thể là bàn phím, chuột hay sạc dự phòng — mỗi thứ
  // một bộ thông số khác hẳn, chỉ người nhập mới biết đúng nhóm nào.

  // --- Nạp thông số của nhóm đã chọn ---------------------------------------

  useEffect(() => {
    if (!form.specGroupId) {
      setDefinitions([]);
      return;
    }

    let cancelled = false;
    setIsLoadingSpecs(true);

    fetch(`/api/qreview/spec-definitions?groupId=${form.specGroupId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setDefinitions(data?.definitions ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoadingSpecs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.specGroupId]);

  /**
   * Thông số đã lưu nhưng không còn trong nhóm hiện tại — vẫn phải hiện ra để
   * quản trị viên thấy và không làm mất dữ liệu cũ khi lưu lại.
   */
  useEffect(() => {
    if (!definitions.length) return;

    const knownKeys = new Set(definitions.map((definition) => definition.specKey));

    setCustomSpecs((prev) => {
      if (prev.length) return prev;

      return Object.entries(specValues)
        .filter(([key, value]) => !knownKeys.has(key) && value)
        .map(([key, value]) => ({ label: key, value, unit: "" }));
    });
  }, [definitions, specValues]);

  /** Gom thông số theo "Phần" để form không thành một dãy ô dài. */
  const groupedDefinitions = useMemo(() => {
    const sections = new Map<string, SpecDefinition[]>();

    for (const definition of definitions) {
      const key = definition.section?.trim() || "";
      const bucket = sections.get(key) ?? [];
      bucket.push(definition);
      sections.set(key, bucket);
    }

    return Array.from(sections.entries());
  }, [definitions]);

  const filledSpecCount = useMemo(
    () => definitions.filter((d) => specValues[d.specKey]?.trim()).length,
    [definitions, specValues]
  );

  const selectedGroup = specGroups.find((group) => group.id === form.specGroupId);

  // --- Ảnh -----------------------------------------------------------------

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;

    setIsUploading(true);
    setFeedback(null);

    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));

      const response = await fetch("/api/qreview/uploads", { method: "POST", body });
      const data = await response.json();

      if (!response.ok) {
        setFeedback({ type: "error", text: data?.error ?? "Không tải được ảnh." });
        return;
      }

      const uploaded: ImageItem[] = (data.urls ?? []).map((url: string) => ({
        url,
        isThumbnail: false,
        colorId: null,
      }));

      setImages((prev) => {
        const next = [...prev, ...uploaded];
        if (next.length && !next.some((image) => image.isThumbnail)) {
          next[0] = { ...next[0], isThumbnail: true };
        }
        return next;
      });
    } catch {
      setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    await uploadFiles(Array.from(input.files ?? []));
    input.value = "";
  };

  /** Tha tep anh thang vao khung: loc san cac tep khong phai anh. */
  const handleFileDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDraggingFiles(false);

    const files = Array.from(event.dataTransfer.files ?? []).filter((file) =>
      file.type.startsWith("image/")
    );

    if (!files.length) {
      setFeedback({ type: "error", text: "Chỉ thả được tệp ảnh." });
      return;
    }

    await uploadFiles(files);
  };

  const addImageByUrl = () => {
    const url = window.prompt("Nhập đường dẫn ảnh (bắt đầu bằng / hoặc https://)");
    if (!url?.trim()) return;

    setImages((prev) => [
      ...prev,
      { url: url.trim(), isThumbnail: prev.length === 0, colorId: null },
    ]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const next = prev.filter((_, position) => position !== index);
      if (next.length && !next.some((image) => image.isThumbnail)) {
        next[0] = { ...next[0], isThumbnail: true };
      }
      return next;
    });
  };

  const setThumbnail = (index: number) => {
    setImages((prev) =>
      prev.map((image, position) => ({ ...image, isThumbnail: position === index }))
    );
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    setImages((prev) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }

      const next = [...prev];
      const [movedImage] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedImage);
      return next;
    });
  };

  const moveImageByDirection = (index: number, direction: -1 | 1) => {
    moveImage(index, index + direction);
  };

  const dropImageAt = (targetIndex: number) => {
    if (draggedImageIndex !== null) {
      moveImage(draggedImageIndex, targetIndex);
    }
    setDraggedImageIndex(null);
    setImageDropTargetIndex(null);
  };

  // --- Màu sắc --------------------------------------------------------------

  const addColor = () => {
    setColors((prev) => [
      ...prev,
      {
        clientId: createClientId("color"),
        name: "",
        hexCode: "#9CA3AF",
        sortOrder: prev.length,
        status: "active",
      },
    ]);
  };

  const updateColor = (clientId: string, patch: Partial<ColorItem>) => {
    setColors((prev) =>
      prev.map((color) => (color.clientId === clientId ? { ...color, ...patch } : color))
    );
  };

  const removeColor = (clientId: string) => {
    setColors((prev) => prev.filter((color) => color.clientId !== clientId));
    setImages((prev) =>
      prev.map((image) =>
        image.colorId === clientId ? { ...image, colorId: null } : image
      )
    );
  };

  const setImageColor = (index: number, colorId: string) => {
    setImages((prev) =>
      prev.map((image, position) =>
        position === index ? { ...image, colorId: colorId || null } : image
      )
    );
  };

  // --- Video YouTube -------------------------------------------------------

  const addVideo = () => {
    setVideos((prev) =>
      prev.length >= MAX_PRODUCT_VIDEOS
        ? prev
        : [...prev, { url: "", title: "" }]
    );
  };

  const updateVideo = (index: number, patch: Partial<VideoItem>) => {
    setVideos((prev) =>
      prev.map((video, position) =>
        position === index ? { ...video, ...patch } : video
      )
    );
  };

  const removeVideo = (index: number) => {
    setVideos((prev) => prev.filter((_, position) => position !== index));
  };

  const moveVideo = (index: number, direction: -1 | 1) => {
    setVideos((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // --- Link mua hàng --------------------------------------------------------

  const addAffiliateLink = () => {
    setAffiliateLinks((prev) => [
      ...prev,
      {
        networkId: "",
        affiliateUrl: "",
        price: "",
        merchantName: "",
        isBest: prev.length === 0,
        sortOrder: prev.length,
        status: "active",
        note: "",
      },
    ]);
  };

  const updateAffiliateLink = (
    index: number,
    patch: Partial<AffiliateLinkItem>
  ) => {
    setAffiliateLinks((prev) =>
      prev.map((link, position) =>
        position === index ? { ...link, ...patch } : link
      )
    );
  };

  const markBestAffiliateLink = (index: number) => {
    setAffiliateLinks((prev) =>
      prev.map((link, position) => ({ ...link, isBest: position === index }))
    );
  };

  // --- Thông số nhập tay ---------------------------------------------------

  const updateCustomSpec = (index: number, patch: Partial<CustomSpec>) => {
    setCustomSpecs((prev) =>
      prev.map((spec, position) => (position === index ? { ...spec, ...patch } : spec))
    );
  };

  // --- Lưu -----------------------------------------------------------------

  const buildSpecPayload = useCallback(() => {
    const fromDefinitions = definitions
      .map((definition) => ({
        specKey: definition.specKey,
        label: definition.label,
        value: specValues[definition.specKey] ?? "",
        unit: definition.unit ?? "",
        groupId: form.specGroupId || null,
        sortOrder: definition.sortOrder,
        isComparable: definition.isComparable,
        isHighlight: definition.isHighlight,
      }))
      .filter((spec) => spec.value.trim());

    const fromCustom = customSpecs
      .filter((spec) => spec.label.trim() && spec.value.trim())
      .map((spec, index) => ({
        specKey: "",
        label: spec.label.trim(),
        value: spec.value.trim(),
        unit: spec.unit.trim(),
        groupId: null,
        sortOrder: 1000 + index,
        isComparable: true,
        isHighlight: false,
      }));

    return [...fromDefinitions, ...fromCustom];
  }, [definitions, specValues, customSpecs, form.specGroupId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;

    setFeedback(null);

    const unnamedColorIndex = colors.findIndex((color) => !color.name.trim());
    if (unnamedColorIndex >= 0) {
      setFeedback({
        type: "error",
        text: `Vui lòng nhập tên cho màu ${unnamedColorIndex + 1}.`,
      });
      return;
    }

    const missingRequired = definitions.filter(
      (definition) => definition.isRequired && !specValues[definition.specKey]?.trim()
    );

    if (missingRequired.length) {
      setFeedback({
        type: "error",
        text: `Thiếu thông số bắt buộc: ${missingRequired.map((d) => d.label).join(", ")}`,
      });
      return;
    }

    const invalidVideoIndex = videos.findIndex(
      (video) => !extractYouTubeVideoId(video.url)
    );
    if (invalidVideoIndex >= 0) {
      setFeedback({
        type: "error",
        text: `Video ${invalidVideoIndex + 1}: vui lòng nhập URL YouTube hợp lệ.`,
      });
      return;
    }

    setIsSaving(true);

    const payload = {
      ...(productId ? { id: productId } : {}),
      ...form,
      specGroupId: form.specGroupId || null,
      priceMin: Number(form.priceMin) || 0,
      priceMax: Number(form.priceMax) || 0,
      images,
      videos,
      colors,
      affiliateLinks,
      specs: buildSpecPayload(),
    };

    try {
      const response = await fetch("/api/qreview/products", {
        method: productId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setFeedback({ type: "error", text: data?.error ?? "Không lưu được sản phẩm." });
        return;
      }

      if (productId) {
        setFeedback({ type: "success", text: "Đã lưu thay đổi." });
      } else {
        router.push(`/qreview/products/${data.product.id}`);
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
      <div className="admin-page-wide">
        <PageHeader title={isEditing ? "Sửa sản phẩm" : "Thêm sản phẩm"} />
        <LoadingState />
      </div>
    );
  }

  const renderSpecInput = (definition: SpecDefinition) => {
    const inputId = `spec-${definition.id}`;
    const value = specValues[definition.specKey] ?? "";
    const onChange = (next: string) =>
      setSpecValues((prev) => ({ ...prev, [definition.specKey]: next }));

    if (definition.dataType === "enum") {
      return (
        <select
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="admin-select"
        >
          <option value="">— Chọn —</option>
          {definition.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (definition.dataType === "boolean") {
      return (
        <select
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="admin-select"
        >
          <option value="">— Chọn —</option>
          <option value="Có">Có</option>
          <option value="Không">Không</option>
        </select>
      );
    }

    return (
      <input
        id={inputId}
        type={definition.dataType === "number" ? "number" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="admin-input"
        placeholder={definition.placeholder ?? ""}
      />
    );
  };

  return (
    /* Form nay nhieu o va co luoi anh nen xin them be ngang so voi mac dinh. */
    <div className="admin-page-wide">
      <PageHeader
        title={isEditing ? "Sửa sản phẩm" : "Thêm sản phẩm"}
        description={
          isEditing
            ? "Cập nhật thông tin, ảnh và thông số kỹ thuật."
            : "Chọn danh mục và nhóm thông số để form hiện đúng các ô cần nhập."
        }
        actions={
          <>
            <Link href="/qreview/products" className="admin-btn-secondary">
              <ArrowLeft size={15} /> Danh sách
            </Link>
            {isEditing && (
              <Link
                href={`/qreview/affiliate-links?productId=${productId}`}
                className="admin-btn-secondary"
              >
                <Link2 size={15} /> Link mua hàng
              </Link>
            )}
            <button
              type="submit"
              form="product-form"
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo sản phẩm"}
            </button>
          </>
        }
      />

      <FeedbackBox feedback={feedback} />

      <form id="product-form" onSubmit={handleSubmit}>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* ================= CỘT TRÁI: NỘI DUNG ================= */}
          <div className="min-w-0 space-y-4">
            {/* --- Thông tin cơ bản --- */}
            <FormSection
              title="Thông tin cơ bản"
              description="Tên, đường dẫn và mô tả ngắn của sản phẩm."
            >
              <div className="grid gap-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Tên sản phẩm" htmlFor="p-name" required>
                    <input
                      id="p-name"
                      value={form.name}
                      onChange={setField("name")}
                      required
                      className="admin-input"
                      placeholder="Điện thoại Xiaomi 17 Pro Max"
                    />
                  </Field>

                  <Field label="Slug" htmlFor="p-slug" hint="Để trống sẽ tự sinh từ tên.">
                    <input
                      id="p-slug"
                      value={form.slug}
                      onChange={setField("slug")}
                      className="admin-input"
                      placeholder="xiaomi-17-pro-max"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <Field
                    label="Nhãn phân khúc"
                    htmlFor="p-segment"
                    hint="Ví dụ: Cao cấp, Tầm trung"
                  >
                    <input
                      id="p-segment"
                      value={form.segmentLabel}
                      onChange={setField("segmentLabel")}
                      className="admin-input"
                    />
                  </Field>

                  <Field
                    label="Mô tả ngắn"
                    htmlFor="p-short"
                    hint="Hiển thị ở danh sách sản phẩm và dùng làm mô tả SEO."
                  >
                    <textarea
                      id="p-short"
                      value={form.shortDesc}
                      onChange={setField("shortDesc")}
                      className="admin-textarea min-h-[80px]"
                      placeholder="Tóm tắt 1-2 câu về sản phẩm"
                    />
                  </Field>
                </div>
              </div>
            </FormSection>

            {/* --- Bài review --- */}
            <FormSection
              title="Nội dung bài review"
              description="Phần nội dung dài hiển thị ở trang chi tiết sản phẩm."
            >
              <textarea
                id="p-content"
                value={form.content}
                onChange={setField("content")}
                className="admin-textarea min-h-[260px]"
                placeholder="Viết đánh giá chi tiết về sản phẩm..."
              />
            </FormSection>

            {/* --- Màu sắc --- */}
            <FormSection
              title="Màu sắc"
              description="Tạo màu trước, sau đó gắn từng ảnh với màu tương ứng ở phần Ảnh."
              action={
                <button
                  type="button"
                  onClick={addColor}
                  className="admin-btn-secondary admin-btn-sm"
                >
                  <Plus size={13} /> Thêm màu
                </button>
              }
            >
              {colors.length === 0 ? (
                <SectionPlaceholder>
                  Sản phẩm chưa có phân loại màu. Bấm “Thêm màu” để bắt đầu.
                </SectionPlaceholder>
              ) : (
                <ul className="grid gap-2.5 2xl:grid-cols-2">
                  {colors.map((color, index) => (
                    <li
                      key={color.clientId}
                      className="grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-[52px_minmax(0,1fr)_96px_auto]"
                      style={{ borderColor: "var(--admin-border)" }}
                    >
                      <input
                        type="color"
                        value={color.hexCode}
                        onChange={(event) =>
                          updateColor(color.clientId, { hexCode: event.target.value.toUpperCase() })
                        }
                        aria-label={`Mã màu ${color.name || index + 1}`}
                        className="h-10 w-12 cursor-pointer rounded-lg border bg-white p-1"
                        style={{ borderColor: "var(--admin-border-strong)" }}
                      />
                      <input
                        value={color.name}
                        onChange={(event) =>
                          updateColor(color.clientId, { name: event.target.value })
                        }
                        className="admin-input"
                        placeholder="Ví dụ: Đen Midnight"
                        aria-label={`Tên màu ${index + 1}`}
                      />
                      <span className="rounded-lg bg-[var(--admin-surface-sub)] px-2 py-2.5 text-center text-xs tracking-wide admin-muted">
                        {color.hexCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeColor(color.clientId)}
                        className="admin-btn-danger admin-btn-sm"
                        aria-label={`Xóa màu ${color.name || index + 1}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </FormSection>

            {/* --- Ảnh --- */}
            <FormSection
              title="Ảnh sản phẩm"
              description={
                images.length > 0
                  ? `${images.length} ảnh · kéo tay cầm để đổi vị trí · thứ tự này cũng dùng cho slider sản phẩm`
                  : "JPG, PNG, WEBP, GIF, AVIF — tối đa 5MB mỗi ảnh"
              }
              action={
                <>
                  <label className="admin-btn-secondary admin-btn-sm cursor-pointer">
                    <Upload size={13} />
                    {isUploading ? "Đang tải..." : "Tải ảnh lên"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                      multiple
                      onChange={handleUpload}
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addImageByUrl}
                    className="admin-btn-secondary admin-btn-sm"
                  >
                    <ImagePlus size={13} /> Thêm URL
                  </button>
                </>
              }
            >
              {images.length === 0 ? (
                <label
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingFiles(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setIsDraggingFiles(false);
                    }
                  }}
                  onDrop={handleFileDrop}
                  className={`admin-dropzone ${isDraggingFiles ? "admin-dropzone-over" : ""}`}
                >
                  <span className="admin-empty-icon">
                    <ImagePlus size={20} aria-hidden="true" />
                  </span>
                  <span className="mt-3 text-[13px] font-medium">
                    {isUploading ? "Đang tải ảnh lên..." : "Kéo thả ảnh vào đây hoặc bấm để chọn"}
                  </span>
                  <span className="mt-1 text-xs admin-muted">
                    JPG, PNG, WEBP, GIF, AVIF — tối đa 5MB mỗi ảnh
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    multiple
                    onChange={handleUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                  {images.map((image, index) => (
                    <li
                      key={`${image.url}-${index}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (draggedImageIndex !== null && draggedImageIndex !== index) {
                          setImageDropTargetIndex(index);
                        }
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setImageDropTargetIndex((current) =>
                            current === index ? null : current
                          );
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();

                        // Tha tep anh len o dang co: coi nhu tai anh moi len,
                        // thay vi im lang khong lam gi.
                        if (draggedImageIndex === null && event.dataTransfer.files.length) {
                          void handleFileDrop(event);
                          return;
                        }

                        dropImageAt(index);
                      }}
                      className={`admin-image-card ${
                        image.isThumbnail ? "admin-image-card-main" : ""
                      } ${draggedImageIndex === index ? "opacity-40" : ""} ${
                        imageDropTargetIndex === index ? "admin-image-card-drop" : ""
                      }`}
                    >
                      <div className="admin-image-frame">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.url}
                          alt={`Ảnh ${index + 1}`}
                          draggable={false}
                          className="admin-image-media"
                        />

                        <span
                          className={`admin-image-badge ${
                            image.isThumbnail ? "admin-image-badge-main" : ""
                          }`}
                          title={
                            image.isThumbnail
                              ? `Ảnh đại diện · vị trí ${index + 1}`
                              : `Vị trí ${index + 1}`
                          }
                        >
                          {/* Van giu so thu tu: thu tu nay chinh la thu tu slider. */}
                          {image.isThumbnail && <Star size={10} fill="currentColor" />}
                          {index + 1}
                        </span>

                        <button
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            setDraggedImageIndex(index);
                            setImageDropTargetIndex(null);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", String(index));
                          }}
                          onDragEnd={() => {
                            setDraggedImageIndex(null);
                            setImageDropTargetIndex(null);
                          }}
                          className="admin-image-grip"
                          aria-label={`Kéo để đổi vị trí ảnh ${index + 1}`}
                          title="Kéo để đổi vị trí"
                        >
                          <GripVertical size={14} />
                        </button>
                      </div>

                      {/* O chon mau chi co nghia khi san pham da khai bao mau. */}
                      {colors.length > 0 && (
                        <div className="px-2 pt-2">
                          <select
                            value={image.colorId ?? ""}
                            onChange={(event) => setImageColor(index, event.target.value)}
                            className="admin-select admin-select-bare"
                            aria-label={`Màu của ảnh ${index + 1}`}
                          >
                            <option value="">Ảnh dùng chung</option>
                            {colors.map((color) => (
                              <option key={color.clientId} value={color.clientId}>
                                {color.name || "Màu chưa đặt tên"}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="flex items-center gap-1 p-2">
                        <button
                          type="button"
                          onClick={() => setThumbnail(index)}
                          disabled={image.isThumbnail}
                          aria-label={`Đặt ảnh ${index + 1} làm ảnh đại diện`}
                          title={image.isThumbnail ? "Đang là ảnh đại diện" : "Đặt làm đại diện"}
                          className={`admin-icon-btn ${
                            image.isThumbnail ? "admin-icon-btn-active" : ""
                          }`}
                        >
                          <Star
                            size={14}
                            fill={image.isThumbnail ? "currentColor" : "none"}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImageByDirection(index, -1)}
                          disabled={index === 0}
                          aria-label={`Đưa ảnh ${index + 1} lên trước`}
                          title="Đưa lên trước"
                          className="admin-icon-btn"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImageByDirection(index, 1)}
                          disabled={index === images.length - 1}
                          aria-label={`Đưa ảnh ${index + 1} xuống sau`}
                          title="Đưa xuống sau"
                          className="admin-icon-btn"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          aria-label={`Xoá ảnh ${index + 1}`}
                          title="Xoá ảnh"
                          className="admin-icon-btn admin-icon-btn-danger ml-auto"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}

                  {/* O them anh cuoi luoi: van keo tha duoc khi da co anh. */}
                  <li>
                    <label
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsDraggingFiles(true);
                      }}
                      onDragLeave={(event) => {
                        if (
                          !event.currentTarget.contains(event.relatedTarget as Node | null)
                        ) {
                          setIsDraggingFiles(false);
                        }
                      }}
                      onDrop={handleFileDrop}
                      className={`admin-dropzone h-full min-h-[132px] ${
                        isDraggingFiles ? "admin-dropzone-over" : ""
                      }`}
                    >
                      <ImagePlus size={18} style={{ color: "var(--admin-faint)" }} />
                      <span className="mt-2 text-xs font-medium">
                        {isUploading ? "Đang tải..." : "Thêm ảnh"}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                        multiple
                        onChange={handleUpload}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                  </li>
                </ul>
              )}
            </FormSection>

            {/* --- Video YouTube --- */}
            <FormSection
              title="Video YouTube"
              description={`Video xuất hiện trong slider sau ảnh sản phẩm · tối đa ${MAX_PRODUCT_VIDEOS} video.`}
              action={
                <button
                  type="button"
                  onClick={addVideo}
                  disabled={videos.length >= MAX_PRODUCT_VIDEOS}
                  className="admin-btn-secondary admin-btn-sm"
                >
                  <Plus size={13} /> Thêm video
                </button>
              }
            >
              {videos.length === 0 ? (
                <button
                  type="button"
                  onClick={addVideo}
                  className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition hover:bg-[var(--p-color-bg-surface-hover)]"
                  style={{ borderColor: "var(--admin-border-strong)" }}
                >
                  <Youtube size={24} style={{ color: "var(--admin-faint)" }} />
                  <span className="mt-2 text-[13px] font-medium">Thêm video giới thiệu hoặc đánh giá</span>
                  <span className="mt-1 text-xs admin-muted">
                    Hỗ trợ youtube.com, youtu.be, Shorts và video ID.
                  </span>
                </button>
              ) : (
                <ul className="space-y-3">
                  {videos.map((video, index) => {
                    const videoId = extractYouTubeVideoId(video.url);

                    return (
                      <li
                        key={video.id ?? `new-video-${index}`}
                        className="grid gap-4 rounded-lg border p-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
                        style={{ borderColor: "var(--admin-border)" }}
                      >
                        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-[#0f172a]">
                          {videoId ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={getYouTubeThumbnailUrl(videoId)}
                                alt=""
                                className="h-full w-full object-cover opacity-85"
                              />
                              <span className="absolute flex h-9 w-12 items-center justify-center rounded-lg bg-[#ff0033] text-white shadow-lg">
                                <svg width="15" height="17" viewBox="0 0 15 17" fill="currentColor" aria-hidden="true">
                                  <path d="M14 6.77a1.5 1.5 0 0 1 0 2.46l-11.65 7A1.5 1.5 0 0 1 .08 14.95V2.05A1.5 1.5 0 0 1 2.35.77L14 6.77Z" />
                                </svg>
                              </span>
                            </>
                          ) : (
                            <div className="px-4 text-center text-xs text-white/60">
                              Thumbnail sẽ hiện sau khi nhập URL hợp lệ
                            </div>
                          )}
                        </div>

                        <div className="grid content-start gap-3">
                          <Field label={`URL YouTube ${index + 1}`} required>
                            <input
                              value={video.url}
                              onChange={(event) => updateVideo(index, { url: event.target.value })}
                              required
                              className="admin-input"
                              placeholder="https://www.youtube.com/watch?v=..."
                            />
                          </Field>
                          <Field label="Tiêu đề video" hint="Không bắt buộc">
                            <input
                              value={video.title}
                              onChange={(event) => updateVideo(index, { title: event.target.value })}
                              maxLength={255}
                              className="admin-input"
                              placeholder="Ví dụ: Trên tay và đánh giá nhanh"
                            />
                          </Field>
                        </div>

                        <div className="flex gap-1 sm:flex-col">
                          <button
                            type="button"
                            onClick={() => moveVideo(index, -1)}
                            disabled={index === 0}
                            className="admin-action-muted disabled:opacity-30"
                            aria-label="Đưa video lên trên"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveVideo(index, 1)}
                            disabled={index === videos.length - 1}
                            className="admin-action-muted disabled:opacity-30"
                            aria-label="Đưa video xuống dưới"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeVideo(index)}
                            className="admin-action-danger"
                            aria-label={`Xóa video ${index + 1}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </FormSection>

            {/* --- Link mua hàng --- */}
            <FormSection
              title="Link mua hàng"
              description="Có thể thêm nhiều nơi bán. Chỉ một link được đánh dấu giá tốt nhất."
              action={
                <button
                  type="button"
                  onClick={addAffiliateLink}
                  className="admin-btn-secondary admin-btn-sm"
                >
                  <Plus size={13} /> Thêm link
                </button>
              }
            >
              {affiliateLinks.length === 0 ? (
                <SectionPlaceholder>
                  Chưa có link mua hàng. Sản phẩm sẽ chưa hiển thị nơi bán trên trang khách.
                </SectionPlaceholder>
              ) : (
                <ul className="space-y-3">
                  {affiliateLinks.map((link, index) => (
                    <li
                      key={link.id ?? `new-link-${index}`}
                      className={`admin-link-card ${link.isBest ? "admin-link-card-best" : ""}`}
                    >
                      {/*
                        Dai dau the tom tat link: nhin luot la biet dang sua noi
                        ban nao ma khong phai doc lai tung o ben duoi.
                      */}
                      <header className="admin-link-card-head">
                        <span className="admin-link-card-index">{index + 1}</span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">
                            {networks.find((network) => network.id === link.networkId)
                              ?.name ?? `Nơi bán ${index + 1}`}
                          </p>
                          <p className="truncate text-xs admin-muted">
                            {link.merchantName ||
                              link.affiliateUrl ||
                              "Chưa nhập link tiếp thị"}
                          </p>
                        </div>

                        {link.isBest && (
                          <span className="admin-badge-info hidden sm:inline-flex">
                            Giá tốt nhất
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            link.isBest
                              ? updateAffiliateLink(index, { isBest: false })
                              : markBestAffiliateLink(index)
                          }
                          aria-pressed={link.isBest}
                          title={
                            link.isBest
                              ? "Bỏ đánh dấu giá tốt nhất"
                              : "Đánh dấu là giá tốt nhất"
                          }
                          className={`admin-icon-btn ${
                            link.isBest ? "admin-icon-btn-active" : ""
                          }`}
                        >
                          <Star size={15} fill={link.isBest ? "currentColor" : "none"} />
                          <span className="sr-only">Giá tốt nhất</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setAffiliateLinks((prev) =>
                              prev.filter((_, position) => position !== index)
                            )
                          }
                          title="Xoá nơi bán này"
                          className="admin-icon-btn admin-icon-btn-danger"
                        >
                          <Trash2 size={15} />
                          <span className="sr-only">Xoá</span>
                        </button>
                      </header>

                      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Field label="Sàn TMĐT" required>
                          <select
                            value={link.networkId}
                            onChange={(event) =>
                              updateAffiliateLink(index, { networkId: event.target.value })
                            }
                            required
                            className="admin-select"
                          >
                            <option value="">— Chọn sàn —</option>
                            {networks.map((network) => (
                              <option key={network.id} value={network.id}>
                                {network.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Tên người bán">
                          <input
                            value={link.merchantName}
                            onChange={(event) =>
                              updateAffiliateLink(index, { merchantName: event.target.value })
                            }
                            className="admin-input"
                            placeholder="Ví dụ: Official Store"
                          />
                        </Field>
                        <Field
                          label="Link tiếp thị"
                          required
                          className="sm:col-span-2 xl:col-span-4"
                        >
                          <input
                            type="url"
                            value={link.affiliateUrl}
                            onChange={(event) =>
                              updateAffiliateLink(index, { affiliateUrl: event.target.value })
                            }
                            required
                            className="admin-input"
                            placeholder="https://shopee.vn/..."
                          />
                        </Field>
                        <Field label="Giá hiển thị" hint="Ví dụ: 24.990.000đ">
                          <input
                            value={link.price}
                            onChange={(event) =>
                              updateAffiliateLink(index, { price: event.target.value })
                            }
                            className="admin-input"
                          />
                        </Field>
                        <Field label="Trạng thái">
                          <select
                            value={link.status}
                            onChange={(event) =>
                              updateAffiliateLink(index, { status: event.target.value })
                            }
                            className="admin-select"
                          >
                            <option value="active">Đang hiện</option>
                            <option value="inactive">Đã ẩn</option>
                          </select>
                        </Field>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </FormSection>

            {/* --- Thông số kỹ thuật --- */}
            <FormSection
              title="Thông số kỹ thuật"
              description="Chọn nhóm thông số phù hợp với loại sản phẩm này."
              action={
                <Link
                  href={
                    form.specGroupId
                      ? `/qreview/specs/${form.specGroupId}`
                      : "/qreview/specs"
                  }
                  className="admin-btn-secondary admin-btn-sm"
                >
                  <SlidersHorizontal size={13} /> Quản lý nhóm
                </Link>
              }
            >
              <Field
                label="Nhóm thông số"
                htmlFor="p-spec-group"
                hint={
                  selectedGroup
                    ? `${selectedGroup.definitionCount} thông số trong nhóm này`
                    : "Mỗi nhóm là một bộ thông số dùng cho một loại sản phẩm."
                }
                className="max-w-xl"
              >
                <select
                  id="p-spec-group"
                  value={form.specGroupId}
                  onChange={setField("specGroupId")}
                  className="admin-select"
                >
                  <option value="">— Chưa chọn nhóm —</option>
                  {specGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} — {group.definitionCount} thông số
                    </option>
                  ))}
                </select>
              </Field>

              {!form.specGroupId ? (
                <p className="mt-4 text-[13px] admin-muted">
                  Chọn một nhóm ở trên để hiện các ô thông số cần nhập.
                </p>
              ) : isLoadingSpecs ? (
                <p className="mt-4 text-[13px] admin-muted">Đang tải thông số...</p>
              ) : definitions.length === 0 ? (
                <div className="admin-alert-warning mt-4">
                  Nhóm này chưa có thông số nào.{" "}
                  <Link
                    href={`/qreview/specs/${form.specGroupId}`}
                    className="font-medium underline underline-offset-2"
                  >
                    Thêm thông số cho nhóm
                  </Link>{" "}
                  hoặc nhập tay ở phần dưới.
                </div>
              ) : (
                <>
                  {/* Thanh tien do cho biet con bao nhieu o chua dien. */}
                  <div
                    className="mt-4 border-t pt-4"
                    style={{ borderColor: "var(--admin-border)" }}
                  >
                    <div className="flex items-center justify-between text-xs admin-muted">
                      <span>
                        Đã điền <span className="font-semibold">{filledSpecCount}</span>/
                        {definitions.length} thông số
                      </span>
                      <span className="tabular-nums">
                        {Math.round((filledSpecCount / definitions.length) * 100)}%
                      </span>
                    </div>
                    <div className="admin-progress mt-2">
                      <span
                        style={{
                          width: `${(filledSpecCount / definitions.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-5">
                    {groupedDefinitions.map(([section, sectionDefinitions]) => (
                      <div key={section || "__default"}>
                        {section && (
                          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide admin-muted">
                            {section}
                          </h3>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {sectionDefinitions.map((definition) => (
                            <Field
                              key={definition.id}
                              label={
                                definition.unit
                                  ? `${definition.label} (${definition.unit})`
                                  : definition.label
                              }
                              htmlFor={`spec-${definition.id}`}
                              required={definition.isRequired}
                            >
                              {renderSpecInput(definition)}
                            </Field>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Thông số nhập tay */}
              <div
                className="mt-6 border-t pt-4"
                style={{ borderColor: "var(--admin-border)" }}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[13px] font-semibold">Thông số nhập thêm</h3>
                    <p className="text-xs admin-muted">
                      Dùng cho thông số riêng chưa có trong nhóm.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCustomSpecs((prev) => [...prev, { label: "", value: "", unit: "" }])
                    }
                    className="admin-btn-secondary admin-btn-sm"
                  >
                    <Plus size={13} /> Thêm dòng
                  </button>
                </div>

                {customSpecs.length > 0 && (
                  <ul className="space-y-2">
                    {customSpecs.map((spec, index) => (
                      <li
                        key={index}
                        className="grid gap-2 sm:grid-cols-[1fr_1fr_110px_auto]"
                      >
                        <input
                          value={spec.label}
                          onChange={(event) =>
                            updateCustomSpec(index, { label: event.target.value })
                          }
                          className="admin-input"
                          placeholder="Tên thông số"
                        />
                        <input
                          value={spec.value}
                          onChange={(event) =>
                            updateCustomSpec(index, { value: event.target.value })
                          }
                          className="admin-input"
                          placeholder="Giá trị"
                        />
                        <input
                          value={spec.unit}
                          onChange={(event) =>
                            updateCustomSpec(index, { unit: event.target.value })
                          }
                          className="admin-input"
                          placeholder="Đơn vị"
                        />
                        <button
                          type="button"
                          aria-label="Xoá dòng"
                          onClick={() =>
                            setCustomSpecs((prev) =>
                              prev.filter((_, position) => position !== index)
                            )
                          }
                          className="admin-btn-danger admin-btn-sm"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </FormSection>
          </div>

          {/*
            ============ CỘT PHẢI: XUẤT BẢN ============
            Gộp trạng thái, phân loại và giá vào một thẻ: đây đều là các lựa
            chọn ngắn, tách ba thẻ chỉ tốn thêm ba dòng tiêu đề. Thẻ đủ thấp
            nên cả cột dính được theo màn hình khi cuộn.
          */}
          <aside className="admin-form-aside space-y-4">
            <FormSection title="Thiết lập" bodyClassName="">
              <div className="admin-form-aside-group">
                <Field label="Trạng thái" htmlFor="p-status">
                  <select
                    id="p-status"
                    value={form.status}
                    onChange={setField("status")}
                    className="admin-select"
                  >
                    <option value="active">Đang hiện</option>
                    <option value="draft">Nháp</option>
                    <option value="inactive">Đã ẩn</option>
                  </select>
                </Field>

                <Checkbox
                  label="Cho phép so sánh"
                  checked={form.compareEnabled}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, compareEnabled: value }))
                  }
                  hint="Xuất hiện trong bảng so sánh cùng phân khúc."
                />
              </div>

              <div className="admin-form-aside-group">
                <Field label="Danh mục" htmlFor="p-category" required>
                  <select
                    id="p-category"
                    value={form.categoryId}
                    onChange={setField("categoryId")}
                    required
                    className="admin-select"
                  >
                    <option value="">— Chọn danh mục —</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Thương hiệu" htmlFor="p-brand" required>
                  <select
                    id="p-brand"
                    value={form.brandId}
                    onChange={setField("brandId")}
                    required
                    className="admin-select"
                  >
                    <option value="">— Chọn thương hiệu —</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="admin-form-aside-group">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Giá thấp nhất" htmlFor="p-price-min">
                    <input
                      id="p-price-min"
                      type="number"
                      min="0"
                      value={form.priceMin}
                      onChange={setField("priceMin")}
                      className="admin-input"
                      placeholder="24990000"
                    />
                  </Field>

                  <Field label="Giá cao nhất" htmlFor="p-price-max">
                    <input
                      id="p-price-max"
                      type="number"
                      min="0"
                      value={form.priceMax}
                      onChange={setField("priceMax")}
                      className="admin-input"
                      placeholder="Không bắt buộc"
                    />
                  </Field>
                </div>

                {/* Doi chieu nhanh: so vua go co dung hang chuc trieu khong. */}
                <p className="mt-2 text-xs admin-muted">
                  {formatVnd(form.priceMin)
                    ? `${formatVnd(form.priceMin)}${
                        formatVnd(form.priceMax) ? ` – ${formatVnd(form.priceMax)}` : ""
                      }`
                    : "Nhập giá theo đơn vị VNĐ, không có dấu chấm."}
                </p>
              </div>
            </FormSection>

            {/* SEO tự động — chỉ xem, không nhập */}
            <FormSection
              title="Xem trước SEO"
              description="Tự động lấy từ tên và mô tả ngắn — không cần nhập riêng."
              action={<Search size={15} style={{ color: "var(--admin-faint)" }} />}
            >
              <p className="truncate text-[13px] font-medium admin-link">
                {form.name || "Tên sản phẩm sẽ hiện ở đây"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs admin-muted">
                {form.shortDesc || "Mô tả ngắn sẽ hiện ở đây"}
              </p>
            </FormSection>
          </aside>
        </div>

        {/* Thanh lưu dính đáy màn hình: cuộn tới đâu cũng lưu được. */}
        <div className="admin-sticky-actions">
          <p className="mr-auto hidden text-xs admin-muted sm:block">
            {isEditing
              ? "Thay đổi chỉ được áp dụng sau khi bấm Lưu."
              : "Bắt buộc: tên sản phẩm, danh mục và thương hiệu."}
          </p>
          <Link href="/qreview/products" className="admin-btn-secondary">
            Huỷ
          </Link>
          <button type="submit" disabled={isSaving} className="admin-btn-primary">
            {isSaving ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo sản phẩm"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;

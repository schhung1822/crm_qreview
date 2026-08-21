"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  CheckCircle2,
  ExternalLink,
  GalleryHorizontalEnd,
  LayoutTemplate,
  Monitor,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Timer,
  Trash2,
} from "lucide-react";

import {
  FeedbackBox,
  Field,
  LoadingState,
  PageHeader,
  type Feedback,
} from "../ui";
import {
  ImageField,
  ProductPicker,
  type CatalogProduct,
} from "./controls";
import {
  createDefaultHomepageConfig,
  type HomepageConfig,
  type HomepageHeroSlide,
  type HomepagePromoBanner,
  type HomepageSpotlight,
} from "@/lib/qreview/homepage-types";
import { qreviewSiteUrl } from "@/lib/qreview/site-url";

type SectionKey = "hero" | "promo" | "countdown";

const MAX_HERO_SLIDES = 5;
const MAX_SPOTLIGHTS = 4;

const SECTION_TABS: Array<{
  key: SectionKey;
  label: string;
  description: string;
  icon: typeof LayoutTemplate;
}> = [
  {
    key: "hero",
    label: "Hero",
    description: "Slide & thẻ nổi bật",
    icon: LayoutTemplate,
  },
  {
    key: "promo",
    label: "PromoBanner",
    description: "3 banner khuyến mãi",
    icon: BadgePercent,
  },
  {
    key: "countdown",
    label: "CountDown",
    description: "Ưu đãi đếm ngược",
    icon: Timer,
  },
];

const formatPrice = (value: number) =>
  value > 0 ? `${new Intl.NumberFormat("vi-VN").format(value)}₫` : "";

const productHref = (product: CatalogProduct) =>
  `/shop-details/${product.slug || product.id}`;

const cloneConfig = (config: HomepageConfig) =>
  JSON.parse(JSON.stringify(config)) as HomepageConfig;

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "Chưa lưu lần nào";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Đã lưu";

  return `Lưu lúc ${date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })}`;
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  badge,
  action,
}: {
  icon: typeof LayoutTemplate;
  title: string;
  description: string;
  badge: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="homepage-section-heading">
      <div className="homepage-section-icon">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2>{title}</h2>
          <span>{badge}</span>
        </div>
        <p>{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function PreviewImage({ src, alt = "" }: { src: string; alt?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ) : (
    <span className="homepage-preview-empty">Chưa có ảnh</span>
  );
}

function HeroPreview({
  slide,
  config,
}: {
  slide: HomepageHeroSlide;
  config: HomepageConfig["hero"];
}) {
  return (
    <div className="homepage-hero-preview">
      <div className="homepage-preview-copy">
        <span className="homepage-preview-pill">{slide.badge}</span>
        <small>{slide.promotionText}</small>
        <h3>{slide.title}</h3>
        <p>{slide.description}</p>
        <div className="homepage-preview-actions">
          <span>{config.primaryCtaLabel}</span>
          <em>{config.secondaryCtaLabel}</em>
        </div>
      </div>
      <div className="homepage-preview-product-image">
        <PreviewImage src={slide.image} alt={slide.imageAlt} />
      </div>
    </div>
  );
}

function SpotlightPreview({ item }: { item: HomepageSpotlight }) {
  return (
    <div className="homepage-spotlight-preview">
      <div>
        <span>{item.eyebrow}</span>
        <h3>{item.title}</h3>
        <strong>{item.price}</strong>
        <del>{item.oldPrice}</del>
        <small>{item.ctaLabel} →</small>
      </div>
      <div className="homepage-preview-product-image">
        <PreviewImage src={item.image} alt={item.imageAlt} />
      </div>
    </div>
  );
}

function PromoPreview({
  banner,
  large,
}: {
  banner: HomepagePromoBanner;
  large?: boolean;
}) {
  return (
    <div className={large ? "homepage-promo-preview is-large" : "homepage-promo-preview"}>
      <div>
        <span>{banner.eyebrow}</span>
        <h3>{banner.title}</h3>
        <p>{banner.description}</p>
        <small>{banner.ctaLabel}</small>
      </div>
      <div className="homepage-preview-product-image">
        <PreviewImage src={banner.image} alt={banner.imageAlt} />
      </div>
    </div>
  );
}

function CountdownPreview({ config }: { config: HomepageConfig["countdown"] }) {
  const deadline = new Date(config.deadline);
  const deadlineLabel = Number.isNaN(deadline.getTime())
    ? "Chưa đặt thời gian"
    : deadline.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

  return (
    <div className="homepage-countdown-preview">
      <div>
        <span>{config.eyebrow}</span>
        <h3>{config.title}</h3>
        <p>{config.description}</p>
        <div className="homepage-timer-preview">
          {["12 Ngày", "08 Giờ", "24 Phút", "36 Giây"].map((item) => (
            <small key={item}>{item}</small>
          ))}
        </div>
        <em>Kết thúc: {deadlineLabel}</em>
        <strong>{config.buttonLabel}</strong>
      </div>
      <div className="homepage-preview-product-image">
        <PreviewImage src={config.image} alt={config.imageAlt} />
      </div>
    </div>
  );
}

const HomepageManager = () => {
  const [config, setConfig] = useState<HomepageConfig>(() =>
    createDefaultHomepageConfig()
  );
  const [savedConfig, setSavedConfig] = useState<HomepageConfig | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [activeSection, setActiveSection] = useState<SectionKey>("hero");
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeSpotlight, setActiveSpotlight] = useState(0);
  const [activePromo, setActivePromo] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const isDirty = useMemo(
    () => Boolean(savedConfig) && JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig]
  );

  const slideIndex = Math.min(activeSlide, config.hero.slides.length - 1);
  const spotlightIndex = Math.min(
    activeSpotlight,
    config.hero.spotlights.length - 1
  );
  const promoIndex = Math.min(activePromo, config.promoBanner.banners.length - 1);
  const currentSlide = config.hero.slides[slideIndex];
  const currentSpotlight = config.hero.spotlights[spotlightIndex];
  const currentPromo = config.promoBanner.banners[promoIndex];

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [homepageResponse, productsResponse] = await Promise.all([
          fetch("/api/qreview/homepage", { cache: "no-store" }),
          fetch("/api/qreview/products", { cache: "no-store" }),
        ]);
        const [homepageData, productsData] = await Promise.all([
          homepageResponse.json(),
          productsResponse.json(),
        ]);

        if (!homepageResponse.ok) {
          throw new Error(homepageData?.error ?? "Không tải được cấu hình trang chủ.");
        }
        if (!productsResponse.ok) {
          throw new Error(productsData?.error ?? "Không tải được sản phẩm.");
        }

        if (!cancelled) {
          const loadedConfig = homepageData.config ?? createDefaultHomepageConfig();
          setConfig(cloneConfig(loadedConfig));
          setSavedConfig(cloneConfig(loadedConfig));
          setProducts(productsData.products ?? []);
          setUpdatedAt(homepageData.updatedAt ?? null);
          setSetupRequired(Boolean(homepageData.setupRequired));
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            type: "error",
            text:
              error instanceof Error
                ? error.message
                : "Không kết nối được tới máy chủ.",
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDirty) return;

    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [isDirty]);

  const updateHeroSlide = (index: number, patch: Partial<HomepageHeroSlide>) => {
    setConfig((current) => ({
      ...current,
      hero: {
        ...current.hero,
        slides: current.hero.slides.map((slide, position) =>
          position === index ? { ...slide, ...patch } : slide
        ),
      },
    }));
  };

  const selectHeroProduct = (index: number, product: CatalogProduct | null) => {
    if (!product) return updateHeroSlide(index, { productId: "" });

    updateHeroSlide(index, {
      productId: product.id,
      title: product.name,
      description: product.shortDesc || product.name,
      href: productHref(product),
      image: product.thumbnail || config.hero.slides[index].image,
      imageAlt: product.name,
    });
  };

  const addHeroSlide = () => {
    if (config.hero.slides.length >= MAX_HERO_SLIDES) return;
    const base = createDefaultHomepageConfig().hero.slides[0];
    const nextIndex = config.hero.slides.length;
    setConfig((current) => ({
      ...current,
      hero: {
        ...current.hero,
        slides: [
          ...current.hero.slides,
          {
            ...base,
            productId: "",
            badge: "Nội dung nổi bật",
            promotionText: "Ưu đãi mới",
            title: "Slide mới",
          },
        ],
      },
    }));
    setActiveSlide(nextIndex);
  };

  const removeHeroSlide = (index: number) => {
    if (config.hero.slides.length <= 1) return;
    setConfig((current) => ({
      ...current,
      hero: {
        ...current.hero,
        slides: current.hero.slides.filter((_, position) => position !== index),
      },
    }));
    setActiveSlide(Math.max(0, index - 1));
  };

  const updateSpotlight = (index: number, patch: Partial<HomepageSpotlight>) => {
    setConfig((current) => ({
      ...current,
      hero: {
        ...current.hero,
        spotlights: current.hero.spotlights.map((item, position) =>
          position === index ? { ...item, ...patch } : item
        ),
      },
    }));
  };

  const selectSpotlightProduct = (
    index: number,
    product: CatalogProduct | null
  ) => {
    if (!product) return updateSpotlight(index, { productId: "" });

    updateSpotlight(index, {
      productId: product.id,
      title: product.name,
      href: productHref(product),
      image: product.thumbnail || config.hero.spotlights[index].image,
      imageAlt: product.name,
      price: formatPrice(product.priceMin),
      oldPrice: formatPrice(product.priceMax),
    });
  };

  const addSpotlight = () => {
    if (config.hero.spotlights.length >= MAX_SPOTLIGHTS) return;
    const base = createDefaultHomepageConfig().hero.spotlights[0];
    const nextIndex = config.hero.spotlights.length;
    setConfig((current) => ({
      ...current,
      hero: {
        ...current.hero,
        spotlights: [
          ...current.hero.spotlights,
          { ...base, productId: "", eyebrow: "Sản phẩm nổi bật", title: "Thẻ mới" },
        ],
      },
    }));
    setActiveSpotlight(nextIndex);
  };

  const removeSpotlight = (index: number) => {
    if (config.hero.spotlights.length <= 1) return;
    setConfig((current) => ({
      ...current,
      hero: {
        ...current.hero,
        spotlights: current.hero.spotlights.filter(
          (_, position) => position !== index
        ),
      },
    }));
    setActiveSpotlight(Math.max(0, index - 1));
  };

  const updatePromoBanner = (
    index: number,
    patch: Partial<HomepagePromoBanner>
  ) => {
    setConfig((current) => ({
      ...current,
      promoBanner: {
        banners: current.promoBanner.banners.map((banner, position) =>
          position === index ? { ...banner, ...patch } : banner
        ),
      },
    }));
  };

  const selectPromoProduct = (
    index: number,
    product: CatalogProduct | null
  ) => {
    if (!product) return updatePromoBanner(index, { productId: "" });

    updatePromoBanner(index, {
      productId: product.id,
      eyebrow: product.name,
      description: product.shortDesc || product.name,
      href: productHref(product),
      image: product.thumbnail || config.promoBanner.banners[index].image,
      imageAlt: product.name,
    });
  };

  const selectCountdownProduct = (product: CatalogProduct | null) => {
    setConfig((current) => ({
      ...current,
      countdown: product
        ? {
            ...current.countdown,
            productId: product.id,
            title: product.name,
            description: product.shortDesc || product.name,
            href: productHref(product),
            image: product.thumbnail || current.countdown.image,
            imageAlt: product.name,
          }
        : { ...current.countdown, productId: "" },
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving || !isDirty) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/qreview/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ config }),
      });
      const data = await response.json();

      if (!response.ok) {
        setFeedback({
          type: "error",
          text: data?.error ?? "Không lưu được cấu hình trang chủ.",
        });
        return;
      }

      setConfig(cloneConfig(data.config));
      setSavedConfig(cloneConfig(data.config));
      setUpdatedAt(new Date().toISOString());
      setSetupRequired(false);
      setFeedback({
        type: "success",
        text: data?.message ?? "Đã cập nhật nội dung trang chủ.",
      });
    } catch {
      setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
    } finally {
      setIsSaving(false);
    }
  };

  const undoChanges = () => {
    if (!savedConfig) return;
    setConfig(cloneConfig(savedConfig));
    setFeedback(null);
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="Nội dung trang chủ" />
        <LoadingState />
      </>
    );
  }

  const siteUrl = qreviewSiteUrl("/");

  return (
    <>
      <PageHeader
        title="Nội dung trang chủ"
        description="Biên tập nội dung, hình ảnh và sản phẩm ngay trên bản xem trước của từng section."
        actions={
          <>
            {/*
              Khu quản trị nằm trong CRM, không còn chung tên miền với website
              nữa, nên phải trỏ tuyệt đối. Chưa cấu hình địa chỉ website thì ẩn
              nút đi thay vì mở ra một trang trắng.
            */}
            {siteUrl && (
              <a href={siteUrl} target="_blank" rel="noreferrer" className="admin-btn-secondary">
                <ExternalLink size={14} /> Xem trang thật
              </a>
            )}
            <button
              type="submit"
              form="homepage-form"
              disabled={isSaving || setupRequired || !isDirty}
              className="admin-btn-primary"
            >
              <Save size={14} /> {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </>
        }
      />

      {setupRequired && (
        <div className="admin-alert-danger mb-4" role="alert">
          Chưa có bảng lưu cấu hình. Chạy lệnh <code>node database/mysql/apply-20260811-homepage-settings.js</code> rồi tải lại trang.
        </div>
      )}
      <FeedbackBox feedback={feedback} />

      <form id="homepage-form" onSubmit={handleSubmit}>
        <div className="homepage-commandbar">
          <div className="homepage-section-tabs" role="tablist" aria-label="Section trang chủ">
            {SECTION_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveSection(tab.key)}
                  className={isActive ? "is-active" : ""}
                >
                  <Icon size={17} />
                  <span>
                    <strong>{tab.label}</strong>
                    <small>{tab.description}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="homepage-save-state">
            <span className={isDirty ? "is-dirty" : "is-saved"}>
              {isDirty ? <Sparkles size={14} /> : <CheckCircle2 size={14} />}
              {isDirty ? "Có thay đổi chưa lưu" : formatUpdatedAt(updatedAt)}
            </span>
            {isDirty && (
              <button type="button" onClick={undoChanges} className="admin-btn-secondary admin-btn-sm">
                <RotateCcw size={13} /> Hoàn tác
              </button>
            )}
          </div>
        </div>

        {activeSection === "hero" && currentSlide && currentSpotlight && (
          <div className="homepage-section-stack" role="tabpanel">
            <section className="admin-card homepage-section-card">
              <SectionHeading
                icon={GalleryHorizontalEnd}
                title="Carousel chính"
                description="Chọn một slide ở thanh bên dưới rồi chỉnh trên bản xem trước."
                badge={`${config.hero.slides.length}/${MAX_HERO_SLIDES} slide`}
                action={
                  <button type="button" onClick={addHeroSlide} disabled={config.hero.slides.length >= MAX_HERO_SLIDES} className="admin-btn-secondary admin-btn-sm">
                    <Plus size={13} /> Thêm slide
                  </button>
                }
              />

              <div className="homepage-item-rail">
                {config.hero.slides.map((slide, index) => (
                  <button
                    type="button"
                    key={`${slide.productId}-${index}`}
                    onClick={() => setActiveSlide(index)}
                    className={slideIndex === index ? "is-active" : ""}
                  >
                    <span className="homepage-item-thumb"><PreviewImage src={slide.image} /></span>
                    <span className="min-w-0 flex-1">
                      <strong>Slide {index + 1}</strong>
                      <small>{slide.title}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="homepage-editor-layout">
                <div className="homepage-preview-panel">
                  <div className="homepage-preview-title"><Monitor size={14} /> Xem trước gần đúng</div>
                  <HeroPreview slide={currentSlide} config={config.hero} />
                  <p>Ảnh và nội dung cập nhật ngay khi bạn nhập.</p>
                </div>

                <div className="homepage-form-panel">
                  <div className="homepage-form-panel-header">
                    <div><span>Đang sửa</span><h3>Slide {slideIndex + 1}</h3></div>
                    <button type="button" onClick={() => removeHeroSlide(slideIndex)} disabled={config.hero.slides.length <= 1} className="admin-action-danger">
                      <Trash2 size={13} /> Xoá slide
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ProductPicker id={`hero-product-${slideIndex}`} value={currentSlide.productId} products={products} onChange={(product) => selectHeroProduct(slideIndex, product)} />
                    <Field label="Nhãn nhỏ" htmlFor={`hero-badge-${slideIndex}`}>
                      <input id={`hero-badge-${slideIndex}`} value={currentSlide.badge} onChange={(event) => updateHeroSlide(slideIndex, { badge: event.target.value })} className="admin-input" />
                    </Field>
                    <Field label="Dòng khuyến mãi" htmlFor={`hero-promotion-${slideIndex}`}>
                      <input id={`hero-promotion-${slideIndex}`} value={currentSlide.promotionText} onChange={(event) => updateHeroSlide(slideIndex, { promotionText: event.target.value })} className="admin-input" />
                    </Field>
                    <Field label="Tiêu đề" htmlFor={`hero-title-${slideIndex}`} className="sm:col-span-2">
                      <input id={`hero-title-${slideIndex}`} value={currentSlide.title} onChange={(event) => updateHeroSlide(slideIndex, { title: event.target.value })} className="admin-input" />
                    </Field>
                    <Field label="Mô tả" htmlFor={`hero-description-${slideIndex}`} className="sm:col-span-2">
                      <textarea id={`hero-description-${slideIndex}`} value={currentSlide.description} onChange={(event) => updateHeroSlide(slideIndex, { description: event.target.value })} className="admin-textarea" rows={4} />
                    </Field>
                    <Field label="Link nút chính" htmlFor={`hero-href-${slideIndex}`} className="sm:col-span-2">
                      <input id={`hero-href-${slideIndex}`} value={currentSlide.href} onChange={(event) => updateHeroSlide(slideIndex, { href: event.target.value })} className="admin-input" />
                    </Field>
                    <ImageField id={`hero-image-${slideIndex}`} label="Ảnh slide" value={currentSlide.image} onChange={(image) => updateHeroSlide(slideIndex, { image })} />
                    <Field label="Mô tả ảnh (alt)" htmlFor={`hero-alt-${slideIndex}`} className="sm:col-span-2">
                      <input id={`hero-alt-${slideIndex}`} value={currentSlide.imageAlt} onChange={(event) => updateHeroSlide(slideIndex, { imageAlt: event.target.value })} className="admin-input" />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="homepage-inline-settings">
                <div><strong>Nhãn các nút dùng chung</strong><p>Áp dụng cho mọi slide trong carousel.</p></div>
                <Field label="Nút chính" htmlFor="hero-primary-cta">
                  <input id="hero-primary-cta" value={config.hero.primaryCtaLabel} onChange={(event) => setConfig((current) => ({ ...current, hero: { ...current.hero, primaryCtaLabel: event.target.value } }))} className="admin-input" />
                </Field>
                <Field label="Nút phụ" htmlFor="hero-secondary-cta">
                  <input id="hero-secondary-cta" value={config.hero.secondaryCtaLabel} onChange={(event) => setConfig((current) => ({ ...current, hero: { ...current.hero, secondaryCtaLabel: event.target.value } }))} className="admin-input" />
                </Field>
                <Field label="Link nút phụ" htmlFor="hero-secondary-href">
                  <input id="hero-secondary-href" value={config.hero.secondaryCtaHref} onChange={(event) => setConfig((current) => ({ ...current, hero: { ...current.hero, secondaryCtaHref: event.target.value } }))} className="admin-input" />
                </Field>
              </div>
            </section>

            <section className="admin-card homepage-section-card">
              <SectionHeading
                icon={Sparkles}
                title="Thẻ sản phẩm nổi bật"
                description="Các thẻ nhỏ nằm bên phải Hero trên màn hình lớn."
                badge={`${config.hero.spotlights.length}/${MAX_SPOTLIGHTS} thẻ`}
                action={
                  <button type="button" onClick={addSpotlight} disabled={config.hero.spotlights.length >= MAX_SPOTLIGHTS} className="admin-btn-secondary admin-btn-sm">
                    <Plus size={13} /> Thêm thẻ
                  </button>
                }
              />

              <div className="homepage-item-rail">
                {config.hero.spotlights.map((item, index) => (
                  <button type="button" key={`${item.productId}-${index}`} onClick={() => setActiveSpotlight(index)} className={spotlightIndex === index ? "is-active" : ""}>
                    <span className="homepage-item-thumb"><PreviewImage src={item.image} /></span>
                    <span className="min-w-0 flex-1"><strong>Thẻ {index + 1}</strong><small>{item.title}</small></span>
                  </button>
                ))}
              </div>

              <div className="homepage-editor-layout">
                <div className="homepage-preview-panel"><div className="homepage-preview-title"><Monitor size={14} /> Xem trước gần đúng</div><SpotlightPreview item={currentSpotlight} /></div>
                <div className="homepage-form-panel">
                  <div className="homepage-form-panel-header">
                    <div><span>Đang sửa</span><h3>Thẻ {spotlightIndex + 1}</h3></div>
                    <button type="button" onClick={() => removeSpotlight(spotlightIndex)} disabled={config.hero.spotlights.length <= 1} className="admin-action-danger"><Trash2 size={13} /> Xoá thẻ</button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ProductPicker id={`spotlight-product-${spotlightIndex}`} value={currentSpotlight.productId} products={products} onChange={(product) => selectSpotlightProduct(spotlightIndex, product)} />
                    <Field label="Nhãn nhỏ" htmlFor={`spotlight-eyebrow-${spotlightIndex}`}><input id={`spotlight-eyebrow-${spotlightIndex}`} value={currentSpotlight.eyebrow} onChange={(event) => updateSpotlight(spotlightIndex, { eyebrow: event.target.value })} className="admin-input" /></Field>
                    <Field label="Nhãn nút" htmlFor={`spotlight-cta-${spotlightIndex}`}><input id={`spotlight-cta-${spotlightIndex}`} value={currentSpotlight.ctaLabel} onChange={(event) => updateSpotlight(spotlightIndex, { ctaLabel: event.target.value })} className="admin-input" /></Field>
                    <Field label="Tiêu đề" htmlFor={`spotlight-title-${spotlightIndex}`} className="sm:col-span-2"><input id={`spotlight-title-${spotlightIndex}`} value={currentSpotlight.title} onChange={(event) => updateSpotlight(spotlightIndex, { title: event.target.value })} className="admin-input" /></Field>
                    <Field label="Giá hiện tại" htmlFor={`spotlight-price-${spotlightIndex}`}><input id={`spotlight-price-${spotlightIndex}`} value={currentSpotlight.price} onChange={(event) => updateSpotlight(spotlightIndex, { price: event.target.value })} className="admin-input" /></Field>
                    <Field label="Giá cũ" htmlFor={`spotlight-old-price-${spotlightIndex}`}><input id={`spotlight-old-price-${spotlightIndex}`} value={currentSpotlight.oldPrice} onChange={(event) => updateSpotlight(spotlightIndex, { oldPrice: event.target.value })} className="admin-input" /></Field>
                    <Field label="Link" htmlFor={`spotlight-href-${spotlightIndex}`} className="sm:col-span-2"><input id={`spotlight-href-${spotlightIndex}`} value={currentSpotlight.href} onChange={(event) => updateSpotlight(spotlightIndex, { href: event.target.value })} className="admin-input" /></Field>
                    <ImageField id={`spotlight-image-${spotlightIndex}`} label="Ảnh sản phẩm" value={currentSpotlight.image} onChange={(image) => updateSpotlight(spotlightIndex, { image })} />
                    <Field label="Mô tả ảnh (alt)" htmlFor={`spotlight-alt-${spotlightIndex}`} className="sm:col-span-2"><input id={`spotlight-alt-${spotlightIndex}`} value={currentSpotlight.imageAlt} onChange={(event) => updateSpotlight(spotlightIndex, { imageAlt: event.target.value })} className="admin-input" /></Field>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === "promo" && currentPromo && (
          <section className="admin-card homepage-section-card" role="tabpanel">
            <SectionHeading icon={BadgePercent} title="PromoBanner" description="Một banner lớn và hai banner nhỏ theo đúng bố cục trang chủ." badge="3 banner cố định" />

            <div className="homepage-promo-board">
              {config.promoBanner.banners.map((banner, index) => (
                <button type="button" key={index} onClick={() => setActivePromo(index)} className={`${promoIndex === index ? "is-active" : ""} ${index === 0 ? "is-large" : ""}`}>
                  <span className="homepage-card-order">{index === 0 ? "Banner lớn" : `Banner nhỏ ${index}`}</span>
                  <PromoPreview banner={banner} large={index === 0} />
                </button>
              ))}
            </div>

            <div className="homepage-editor-layout">
              <div className="homepage-preview-panel">
                <div className="homepage-preview-title"><Monitor size={14} /> Banner đang chọn</div>
                <PromoPreview banner={currentPromo} large={promoIndex === 0} />
                <p>{promoIndex === 0 ? "Banner lớn toàn chiều ngang." : `Banner nhỏ ${promoIndex} ở hàng hai.`}</p>
              </div>
              <div className="homepage-form-panel">
                <div className="homepage-form-panel-header"><div><span>Đang sửa</span><h3>{promoIndex === 0 ? "Banner lớn" : `Banner nhỏ ${promoIndex}`}</h3></div></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProductPicker id={`promo-product-${promoIndex}`} value={currentPromo.productId} products={products} onChange={(product) => selectPromoProduct(promoIndex, product)} />
                  <Field label="Dòng nhỏ" htmlFor={`promo-eyebrow-${promoIndex}`}><input id={`promo-eyebrow-${promoIndex}`} value={currentPromo.eyebrow} onChange={(event) => updatePromoBanner(promoIndex, { eyebrow: event.target.value })} className="admin-input" /></Field>
                  <Field label="Tiêu đề khuyến mãi" htmlFor={`promo-title-${promoIndex}`}><input id={`promo-title-${promoIndex}`} value={currentPromo.title} onChange={(event) => updatePromoBanner(promoIndex, { title: event.target.value })} className="admin-input" /></Field>
                  <Field label="Mô tả" htmlFor={`promo-description-${promoIndex}`} className="sm:col-span-2"><textarea id={`promo-description-${promoIndex}`} rows={4} value={currentPromo.description} onChange={(event) => updatePromoBanner(promoIndex, { description: event.target.value })} className="admin-textarea" /></Field>
                  <Field label="Nhãn nút" htmlFor={`promo-cta-${promoIndex}`}><input id={`promo-cta-${promoIndex}`} value={currentPromo.ctaLabel} onChange={(event) => updatePromoBanner(promoIndex, { ctaLabel: event.target.value })} className="admin-input" /></Field>
                  <Field label="Link nút" htmlFor={`promo-href-${promoIndex}`}><input id={`promo-href-${promoIndex}`} value={currentPromo.href} onChange={(event) => updatePromoBanner(promoIndex, { href: event.target.value })} className="admin-input" /></Field>
                  <ImageField id={`promo-image-${promoIndex}`} label="Ảnh banner" value={currentPromo.image} onChange={(image) => updatePromoBanner(promoIndex, { image })} />
                  <Field label="Mô tả ảnh (alt)" htmlFor={`promo-alt-${promoIndex}`} className="sm:col-span-2"><input id={`promo-alt-${promoIndex}`} value={currentPromo.imageAlt} onChange={(event) => updatePromoBanner(promoIndex, { imageAlt: event.target.value })} className="admin-input" /></Field>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeSection === "countdown" && (
          <section className="admin-card homepage-section-card" role="tabpanel">
            <SectionHeading icon={Timer} title="CountDown" description="Banner ưu đãi có thời gian kết thúc và một sản phẩm chính." badge="1 banner" />
            <div className="homepage-editor-layout">
              <div className="homepage-preview-panel">
                <div className="homepage-preview-title"><Monitor size={14} /> Xem trước gần đúng</div>
                <CountdownPreview config={config.countdown} />
                <p>Đồng hồ trong preview là minh hoạ; trang thật dùng thời gian còn lại chính xác.</p>
              </div>
              <div className="homepage-form-panel">
                <div className="homepage-form-panel-header"><div><span>Đang sửa</span><h3>Banner đếm ngược</h3></div></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProductPicker id="countdown-product" value={config.countdown.productId} products={products} onChange={selectCountdownProduct} />
                  <Field label="Dòng nhỏ" htmlFor="countdown-eyebrow"><input id="countdown-eyebrow" value={config.countdown.eyebrow} onChange={(event) => setConfig((current) => ({ ...current, countdown: { ...current.countdown, eyebrow: event.target.value } }))} className="admin-input" /></Field>
                  <Field label="Hạn đếm ngược" htmlFor="countdown-deadline" required><input id="countdown-deadline" type="datetime-local" required value={toDateTimeLocal(config.countdown.deadline)} onChange={(event) => { const date = new Date(event.target.value); if (!Number.isNaN(date.getTime())) setConfig((current) => ({ ...current, countdown: { ...current.countdown, deadline: date.toISOString() } })); }} className="admin-input" /></Field>
                  <Field label="Tiêu đề" htmlFor="countdown-title" className="sm:col-span-2"><input id="countdown-title" value={config.countdown.title} onChange={(event) => setConfig((current) => ({ ...current, countdown: { ...current.countdown, title: event.target.value } }))} className="admin-input" /></Field>
                  <Field label="Mô tả" htmlFor="countdown-description" className="sm:col-span-2"><textarea id="countdown-description" rows={4} value={config.countdown.description} onChange={(event) => setConfig((current) => ({ ...current, countdown: { ...current.countdown, description: event.target.value } }))} className="admin-textarea" /></Field>
                  <Field label="Nhãn nút" htmlFor="countdown-button"><input id="countdown-button" value={config.countdown.buttonLabel} onChange={(event) => setConfig((current) => ({ ...current, countdown: { ...current.countdown, buttonLabel: event.target.value } }))} className="admin-input" /></Field>
                  <Field label="Link nút" htmlFor="countdown-href"><input id="countdown-href" value={config.countdown.href} onChange={(event) => setConfig((current) => ({ ...current, countdown: { ...current.countdown, href: event.target.value } }))} className="admin-input" /></Field>
                  <ImageField id="countdown-image" label="Ảnh sản phẩm" value={config.countdown.image} onChange={(image) => setConfig((current) => ({ ...current, countdown: { ...current.countdown, image } }))} />
                  <Field label="Mô tả ảnh (alt)" htmlFor="countdown-alt" className="sm:col-span-2"><input id="countdown-alt" value={config.countdown.imageAlt} onChange={(event) => setConfig((current) => ({ ...current, countdown: { ...current.countdown, imageAlt: event.target.value } }))} className="admin-input" /></Field>
                  <ImageField id="countdown-background" label="Ảnh nền trang trí" value={config.countdown.backgroundImage} onChange={(backgroundImage) => setConfig((current) => ({ ...current, countdown: { ...current.countdown, backgroundImage } }))} />
                </div>
              </div>
            </div>
          </section>
        )}

        {isDirty && (
          <div className="homepage-floating-save">
            <div><Sparkles size={16} /><span><strong>Bạn có thay đổi chưa lưu</strong><small>Kiểm tra preview rồi lưu để cập nhật trang chủ.</small></span></div>
            <button type="button" onClick={undoChanges} className="admin-btn-secondary"><RotateCcw size={14} /> Hoàn tác</button>
            <button type="submit" disabled={isSaving || setupRequired} className="admin-btn-primary"><Save size={14} /> {isSaving ? "Đang lưu..." : "Lưu thay đổi"}</button>
          </div>
        )}
      </form>
    </>
  );
};

export default HomepageManager;

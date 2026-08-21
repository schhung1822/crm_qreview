export type HomepageHeroSlide = {
  productId: string;
  badge: string;
  promotionText: string;
  title: string;
  description: string;
  href: string;
  image: string;
  imageAlt: string;
};

export type HomepageSpotlight = {
  productId: string;
  eyebrow: string;
  title: string;
  href: string;
  image: string;
  imageAlt: string;
  price: string;
  oldPrice: string;
  ctaLabel: string;
};

export type HomepagePromoBanner = {
  productId: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  image: string;
  imageAlt: string;
};

export type HomepageConfig = {
  hero: {
    slides: HomepageHeroSlide[];
    spotlights: HomepageSpotlight[];
    primaryCtaLabel: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
  };
  promoBanner: {
    banners: HomepagePromoBanner[];
  };
  countdown: {
    productId: string;
    eyebrow: string;
    title: string;
    description: string;
    deadline: string;
    buttonLabel: string;
    href: string;
    image: string;
    imageAlt: string;
    backgroundImage: string;
  };
};

/**
 * Noi dung cu cua trang chu duoc giu lam mac dinh. Neu chua chay migration
 * hoac admin chua bam luu lan dau, trang khach van hien day du nhu truoc.
 */
export const DEFAULT_HOMEPAGE_CONFIG: HomepageConfig = {
  hero: {
    primaryCtaLabel: "Xem chi tiết",
    secondaryCtaLabel: "Khám phá thêm",
    secondaryCtaHref: "/san-pham",
    slides: [
      {
        productId: "",
        badge: "Đáng chú ý tuần này",
        promotionText: "Giảm đến 30%",
        title: "Xiaomi 17 & Xiaomi 17 Pro",
        description:
          "Hiệu năng Snapdragon 8 Elite Gen 5, pin 7.000 mAh và cụm ba camera 50 MP cho trải nghiệm flagship toàn diện.",
        href: "/shop-details/xiaomi17-xiaomi17pro",
        image: "/images/hero/hero-1.png",
        imageAlt: "Xiaomi 17 và Xiaomi 17 Pro màu tím",
      },
      {
        productId: "",
        badge: "Bùng nổ mọi cuộc vui",
        promotionText: "Ưu đãi 15%",
        title: "Loa Xiaomi SoundParty",
        description:
          "Công suất 50 W mạnh mẽ, Bass Boost, Bluetooth 5.4 và hiệu ứng LED 3D sống động trong một thiết kế dễ mang theo.",
        href: "/shop-details/loa-xiaomi-sound-outdoor",
        image: "/images/hero/hero-2.png",
        imageAlt: "Loa Xiaomi SoundParty màu đen cam",
      },
    ],
    spotlights: [
      {
        productId: "",
        eyebrow: "Flagship mới",
        title: "Xiaomi 17 & Xiaomi 17 Pro",
        href: "/shop-details/xiaomi17-xiaomi17pro",
        image: "/images/hero/hero-1.png",
        imageAlt: "Xiaomi 17 và Xiaomi 17 Pro",
        price: "22.500.000₫",
        oldPrice: "27.000.000₫",
        ctaLabel: "Xem sản phẩm",
      },
      {
        productId: "",
        eyebrow: "Âm thanh nổi bật",
        title: "Loa Xiaomi SoundParty",
        href: "/shop-details/loa-xiaomi-sound-outdoor",
        image: "/images/hero/hero-2.png",
        imageAlt: "Loa Xiaomi SoundParty",
        price: "1.990.000₫",
        oldPrice: "2.299.000₫",
        ctaLabel: "Xem sản phẩm",
      },
    ],
  },
  promoBanner: {
    banners: [
      {
        productId: "",
        eyebrow: "Xiaomi 17 Giảm sâu",
        title: "GIẢM GIÁ ĐẾN 30%",
        description:
          "Xiaomi 17 nổi bật ở chip Snapdragon 8 Elite Gen 5 mạnh mẽ, dung lượng pin 7000 mAh, màn hình LTPO AMOLED 6,3″ sáng rõ 3 500 nit và cụm 3 camera 50 MP chất lượng cao cho ảnh/video sắc nét.",
        ctaLabel: "Xem ngay",
        href: "#",
        image: "/images/promo/xiaomi_17.png",
        imageAlt: "Xiaomi 17",
      },
      {
        productId: "",
        eyebrow: "Xe đạp tập thể thao",
        title: "Tập luyện tại nhà",
        description: "Giảm giá đồng loạt 20%",
        ctaLabel: "Xem ngay",
        href: "#",
        image: "/images/promo/xe_dap.png",
        imageAlt: "Xe đạp tập thể thao",
      },
      {
        productId: "",
        eyebrow: "Xiaomi Watch Ultra",
        title: "Giảm tới 40%",
        description:
          "Vỏ bằng titan chất lượng hàng không vũ trụ đạt được sự cân bằng hoàn hảo về mọi mặt.",
        ctaLabel: "Xem ngay",
        href: "#",
        image: "/images/promo/xiaomi_watch.webp",
        imageAlt: "Xiaomi Watch Ultra",
      },
    ],
  },
  countdown: {
    productId: "",
    eyebrow: "Đừng quên!!",
    title: "Nâng cao trải nghiệm âm thanh của bạn",
    description: "Loa Bluetooth Xiaomi Sound Party NS7-GL",
    deadline: "2026-12-31T23:59:59+07:00",
    buttonLabel: "XEM NGAY!",
    href: "/shop-details/loa-xiaomi-sound-outdoor",
    image: "/images/countdown/countdown.png",
    imageAlt: "Loa Bluetooth Xiaomi Sound Party",
    backgroundImage: "/images/countdown/countdown-bg.png",
  },
};

/** Tao ban sao de form client khong sua truc tiep hang so mac dinh. */
export function createDefaultHomepageConfig(): HomepageConfig {
  return JSON.parse(JSON.stringify(DEFAULT_HOMEPAGE_CONFIG)) as HomepageConfig;
}

import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import type { CSSProperties } from 'react';
import { getBranding } from '@/lib/store/branding';
import { getSessionUserId, SESSION_COOKIE } from '@/lib/auth/session';
import { PLAN_ORDER, type Plan, type PlanId } from '@/lib/billing/plans';
import { readPlans } from '@/lib/billing/plans-store';
import { currencyCode } from '@/lib/i18n/currency';
import { siteOrigin } from '@/lib/site-url';
import { localeNames } from '@/i18n/config';
import './home.css';
import { HomeLangSwitcher } from './HomeLangSwitcher';
import { LandingMotion } from './LandingMotion';
import { FeatureIcon, StepIcon } from './landing-art';
import { WorkflowDemo } from './WorkflowDemo';
import { getHomeStrings, pickHomeLocale } from './home-strings';
import { landingPalette } from './landing-color';

// Trang chủ marketing công khai (SEO/AEO/GEO). Render động: đọc cookie/header để chọn ngôn ngữ +
// lấy thương hiệu cấu hình runtime. Đây là trang duy nhất ở "/" (login vẫn ở /login).
export const dynamic = 'force-dynamic';

const INTEGRATIONS = ['WordPress', 'Wix', 'Shopify', 'Haravan', 'Sapo', 'Google Sheet'];

type BillingHomeText = {
  title: string;
  subtitle: string;
  freePrice: string;
  contact: string;
  perMonth: string;
  register: string;
  unlimited: string;
  plan: Record<PlanId, string>;
  feat: {
    articles: string;
    socialReports: string;
    socialReportsFbOnly: string;
    seats: string;
    biz: string;
    approval: string;
    brandVoice: string;
    api: string;
    factCheck: string;
    humanize: string;
    whiteLabel: string;
  };
};

const BILLING_HOME: Record<string, BillingHomeText> = {
  vi: {
    title: 'Th\u00f4ng tin c\u00e1c g\u00f3i c\u01b0\u1edbc',
    subtitle: 'D\u1eef li\u1ec7u g\u00f3i \u0111\u01b0\u1ee3c \u0111\u1ed3ng b\u1ed9 v\u1edbi trang Billing: b\u00e0i AI, b\u00e1o c\u00e1o Social, s\u1ed1 biz, nh\u00e2n vi\u00ean v\u00e0 c\u00e1c t\u00ednh n\u0103ng n\u00e2ng cao.',
    freePrice: 'Mi\u1ec5n ph\u00ed',
    contact: 'Li\u00ean h\u1ec7',
    perMonth: '/th\u00e1ng',
    register: '\u0110\u0103ng k\u00fd ngay',
    unlimited: 'Kh\u00f4ng gi\u1edbi h\u1ea1n',
    plan: { free: 'Free', starter: 'Starter', pro: 'Pro', agency: 'Agency', enterprise: 'Enterprise' },
    feat: {
      articles: '{n} b\u00e0i AI/th\u00e1ng',
      socialReports: '{n} b\u00e1o c\u00e1o Social/th\u00e1ng (t\u1ea5t c\u1ea3 k\u00eanh)',
      socialReportsFbOnly: '{n} b\u00e1o c\u00e1o Social/th\u00e1ng (ch\u1ec9 Facebook)',
      seats: '{n} nh\u00e2n vi\u00ean',
      biz: '{n} biz',
      approval: 'Duy\u1ec7t b\u00e0i',
      brandVoice: 'Gi\u1ecdng th\u01b0\u01a1ng hi\u1ec7u',
      api: 'API/Webhook',
      factCheck: 'Ki\u1ec3m ch\u1ee9ng s\u1ef1 ki\u1ec7n',
      humanize: 'Nh\u00e2n h\u00f3a v\u0103n phong',
      whiteLabel: 'White-label + b\u00e1o c\u00e1o kh\u00e1ch',
    },
  },
  en: {
    title: 'Flexible plans for every stage of growth',
    subtitle: 'Plan details are synced with Billing: AI articles, Social reports, bizes, seats and advanced features.',
    freePrice: 'Free',
    contact: 'Contact us',
    perMonth: '/month',
    register: 'Sign up now',
    unlimited: 'Unlimited',
    plan: { free: 'Free', starter: 'Starter', pro: 'Pro', agency: 'Agency', enterprise: 'Enterprise' },
    feat: {
      articles: '{n} AI articles/month',
      socialReports: '{n} Social reports/month (all channels)',
      socialReportsFbOnly: '{n} Social reports/month (Facebook only)',
      seats: '{n} seats',
      biz: '{n} bizes',
      approval: 'Approval workflow',
      brandVoice: 'Brand voice',
      api: 'API/Webhook',
      factCheck: 'Fact checking',
      humanize: 'Humanized writing',
      whiteLabel: 'White-label + client reports',
    },
  },
};

function billingHomeText(locale: string): BillingHomeText {
  return BILLING_HOME[locale] ?? BILLING_HOME.en;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

function planLimit(n: number, nf: Intl.NumberFormat, text: BillingHomeText): string {
  return n >= 999999 ? text.unlimited : nf.format(n);
}

function planPrice(plan: Plan, locale: string, nf: Intl.NumberFormat, text: BillingHomeText): string {
  if (plan.id === 'free') return text.freePrice;
  if (plan.id === 'enterprise') return text.contact;
  if (currencyCode(locale) === 'VND') return `${nf.format(plan.priceVndMonthly)} VND`;
  return `$${plan.priceUsdMonthly}`;
}

function planFeatures(plan: Plan, nf: Intl.NumberFormat, text: BillingHomeText): string[] {
  const f = plan.features;
  const lim = (n: number) => planLimit(n, nf, text);
  return [
    fill(text.feat.articles, { n: lim(plan.articlesPerMonth) }),
    f.socialAllChannels
      ? fill(text.feat.socialReports, { n: lim(plan.socialReportsPerMonth) })
      : fill(text.feat.socialReportsFbOnly, { n: lim(plan.socialReportsPerMonth) }),
    fill(text.feat.seats, { n: lim(plan.maxSeats) }),
    fill(text.feat.biz, { n: lim(plan.maxBiz) }),
    f.approval ? text.feat.approval : null,
    f.brandVoice ? text.feat.brandVoice : null,
    f.api ? text.feat.api : null,
    f.factCheck ? text.feat.factCheck : null,
    f.humanize ? text.feat.humanize : null,
    f.whiteLabel ? text.feat.whiteLabel : null,
  ].filter(Boolean) as string[];
}

function localeFromRequest(searchLang?: string | string[]): ReturnType<typeof pickHomeLocale> {
  const cookieLang = cookies().get('NEXT_LOCALE')?.value;
  const accept = headers().get('accept-language') ?? undefined;
  return pickHomeLocale(searchLang, cookieLang, accept);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { lang?: string | string[] };
}): Promise<Metadata> {
  const locale = localeFromRequest(searchParams?.lang);
  const s = getHomeStrings(locale);
  const b = await getBranding();
  const origin = siteOrigin();
  const path = locale === 'vi' ? '/' : `/?lang=${locale}`;
  const languages: Record<string, string> = { 'x-default': `${origin}/` };
  for (const l of Object.keys(localeNames)) languages[l] = `${origin}/?lang=${l}`;
  // Tiêu đề & mô tả lấy ĐÚNG từ "Thông tin hệ thống" (branding), không ghép thêm chuỗi marketing.
  const title = b.title;
  const description = b.description;
  return {
    title,
    description,
    alternates: { canonical: `${origin}${path}`, languages },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${origin}${path}`,
      siteName: b.title,
      locale,
      images: b.ogImage || b.logoDuongBan ? [{ url: b.ogImage || b.logoDuongBan }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: b.ogImage || b.logoDuongBan ? [b.ogImage || b.logoDuongBan] : undefined,
    },
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { lang?: string | string[] };
}) {
  const locale = localeFromRequest(searchParams?.lang);
  const s = getHomeStrings(locale);
  const b = await getBranding();
  const origin = siteOrigin();
  const plans = await readPlans();
  const priceText = billingHomeText(locale);
  const nf = new Intl.NumberFormat(locale);
  const billingPath = `/${locale}/billing`;
  const loggedIn = Boolean(await getSessionUserId(cookies().get(SESSION_COOKIE)?.value));
  const billingHref = loggedIn ? billingPath : `/login?next=${encodeURIComponent(billingPath)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: b.title,
        description: b.description,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: `${origin}/`,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: s.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  // Bảng màu trang chủ: màu riêng colorHome (fallback colorPrimary) + màu gradient colorHomeGradient.
  const pal = landingPalette({ home: b.colorHome, primary: b.colorPrimary, gradient: b.colorHomeGradient });
  const rootStyle = {
    '--lp-accent': pal.accent,
    '--lp-accent-2': pal.accent2,
    '--lp-accent-ink': pal.accentInk,
    '--lp-grad-1': pal.grad1,
    '--lp-grad-2': pal.grad2,
  } as CSSProperties;

  return (
    <div className="lp" style={rootStyle}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a href="#lp-main" className="lp-skip">
        {s.skipToContent}
      </a>

      {/* Header */}
      <header className="lp-header">
        <div className="lp-container lp-header__row">
          <a href="/" className="lp-brand" aria-label={b.title}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.logoDuongBan} alt={b.title} className="lp-brand__logo" />
          </a>
          <div className="lp-header__actions">
            <HomeLangSwitcher current={locale} label={s.langLabel} />
            <a href="/login" className="lp-btn lp-btn--primary lp-btn--sm">
              {s.login}
            </a>
          </div>
        </div>
      </header>

      <main id="lp-main">
        {/* Hero */}
        <section className="lp-hero">
          <span className="lp-hero__blob lp-hero__blob--1" aria-hidden="true" />
          <span className="lp-hero__blob lp-hero__blob--2" aria-hidden="true" />
          <div className="lp-container">
            <div className="lp-hero__grid">
              <div className="lp-hero__text lp-reveal">
                <span className="lp-badge">{s.heroBadge}</span>
                <h1 className="lp-hero__title">{s.heroTitle}</h1>
                <p className="lp-hero__subtitle">{s.heroSubtitle}</p>
                <div className="lp-hero__cta">
                  <a href="/login" className="lp-btn lp-btn--primary lp-btn--lg">
                    {s.heroCtaPrimary}
                  </a>
                  <a href="#features" className="lp-btn lp-btn--ghost lp-btn--lg">
                    {s.heroCtaSecondary}
                  </a>
                </div>
                <p className="lp-hero__note">{s.heroNote}</p>
              </div>
              <div className="lp-hero__art lp-reveal">
                <WorkflowDemo locale={locale} />
              </div>
            </div>
            <div className="lp-integrations lp-reveal">
              <span className="lp-integrations__label">{s.integrationsLabel}</span>
              {INTEGRATIONS.map((name) => (
                <span className="lp-chip" key={name}>
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="lp-section">
          <div className="lp-container">
            <h2 className="lp-h2 lp-reveal">{s.problemTitle}</h2>
            <div className="lp-grid lp-grid--3">
              {s.problems.map((p, i) => (
                <article className="lp-card lp-reveal" key={i}>
                  <span className="lp-prob__icon" aria-hidden="true">
                    !
                  </span>
                  <h3 className="lp-card__title">{p.title}</h3>
                  <p className="lp-card__desc">{p.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="lp-section lp-section--alt" id="features">
          <div className="lp-container">
            <h2 className="lp-h2 lp-reveal">{s.featuresTitle}</h2>
            <p className="lp-lead lp-reveal">{s.featuresSubtitle}</p>
            <div className="lp-grid lp-grid--3">
              {s.features.map((f, i) => (
                <article className="lp-card lp-feature lp-reveal" key={i}>
                  <span className="lp-feature__mark" aria-hidden="true">
                    <FeatureIcon i={i} />
                  </span>
                  <h3 className="lp-card__title">{f.title}</h3>
                  <p className="lp-card__desc">{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works - quy trình làm việc */}
        <section className="lp-section">
          <div className="lp-container">
            <h2 className="lp-h2 lp-reveal">{s.howTitle}</h2>
            <div className="lp-flow">
              <span className="lp-flow__line" aria-hidden="true" />
              {s.steps.map((st, i) => (
                <div className="lp-flow__item lp-reveal" key={i}>
                  <span className="lp-flow__icon">
                    <StepIcon i={i} />
                    <span className="lp-flow__num" aria-hidden="true">
                      {i + 1}
                    </span>
                  </span>
                  <h3 className="lp-card__title">{st.title}</h3>
                  <p className="lp-card__desc">{st.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Audience */}
        <section className="lp-section lp-section--alt">
          <div className="lp-container">
            <h2 className="lp-h2 lp-reveal">{s.audienceTitle}</h2>
            <div className="lp-grid lp-grid--4">
              {s.audience.map((a, i) => (
                <article className="lp-card lp-reveal" key={i}>
                  <h3 className="lp-card__title">{a.title}</h3>
                  <p className="lp-card__desc">{a.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Savings */}
        <section className="lp-section">
          <div className="lp-container">
            <h2 className="lp-h2 lp-reveal">{s.savingsTitle}</h2>
            <p className="lp-lead lp-reveal">{s.savingsSubtitle}</p>
            <div className="lp-grid lp-grid--4">
              {s.savings.map((sv, i) => (
                <div className="lp-stat lp-reveal" key={i}>
                  <div className="lp-stat__value">{sv.value}</div>
                  <div className="lp-stat__label">{sv.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="lp-section lp-section--alt" id="pricing">
          <div className="lp-container container-pricing">
            <h2 className="lp-h2 lp-reveal">{priceText.title}</h2>
            <p className="lp-lead lp-reveal">{priceText.subtitle}</p>
            <div className="lp-pricing lp-reveal">
              {PLAN_ORDER.map((id) => {
                const plan = plans[id];
                const features = planFeatures(plan, nf, priceText).slice(0, 7);
                return (
                  <article className={`lp-price-card${id === 'pro' ? ' lp-price-card--featured' : ''}`} key={id}>
                    <div className="lp-price-card__body">
                      <h3 className="lp-price-card__name">{priceText.plan[id]}</h3>
                      <div className="lp-price-card__price">
                        <span>{planPrice(plan, locale, nf, priceText)}</span>
                        {id !== 'free' && id !== 'enterprise' ? <small>{priceText.perMonth}</small> : null}
                      </div>
                      <ul className="lp-price-card__features">
                        {features.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                    <a href={billingHref} className="lp-btn lp-btn--primary lp-btn--sm lp-price-card__cta">
                      {priceText.register}
                    </a>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-section">
          <div className="lp-container lp-container--narrow">
            <h2 className="lp-h2 lp-reveal">{s.faqTitle}</h2>
            <div className="lp-faq">
              {s.faqs.map((f, i) => (
                <details className="lp-faq__item lp-reveal" key={i}>
                  <summary className="lp-faq__q">{f.q}</summary>
                  <p className="lp-faq__a">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="lp-cta">
          <div className="lp-container lp-cta__inner">
            <h2 className="lp-cta__title">{s.ctaTitle}</h2>
            <p className="lp-cta__subtitle">{s.ctaSubtitle}</p>
            <a href="/login" className="lp-btn lp-btn--primary lp-btn--lg">
              {s.ctaButton}
            </a>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer__row">
          <p className="lp-footer__tagline">{s.footerTagline}</p>
          <p className="lp-footer__meta">
            {b.sourceText ? (
              <a href={b.sourceUrl || '#'} target="_blank" rel="noreferrer" className="lp-footer__src">
                {b.sourceText}
              </a>
            ) : null}
            <span className="lp-footer__rights">{s.footerRights}</span>
          </p>
        </div>
      </footer>

      <LandingMotion />
    </div>
  );
}

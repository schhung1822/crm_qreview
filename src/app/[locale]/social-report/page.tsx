'use client';

// Báo cáo Social - trang quản lý: wizard tạo báo cáo theo kênh (Facebook/TikTok/YouTube/
// Tổng thể), theo dõi tiến trình từng bước, danh sách báo cáo phân loại theo kênh.
// Tiến trình chạy kiểu client-driven: lặp POST /step tới khi collected/done/error.
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  ChoiceList,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  ProgressBar,
  Select,
  Tabs,
  Text,
  TextField,
  Toast,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HelpLabel, InfoHint } from '@/components/InfoHint';
import { SocialAnalyzeModal } from '@/components/SocialAnalyzeModal';
import { AiWorking } from '@/components/ui';
import { localeNames, locales } from '@/i18n/config';
import { platformIconSvg, UPCOMING_LOGO_SVG } from '@/lib/social/report-html';
import type {
  SocialChannelKind,
  SocialPlatform,
  SocialReportSummary,
} from '@/lib/social/types';
import { ANALYZE_ACTIONS } from '@/lib/social/types';

const TICK_MS = 4000;

// Payload cho tick ĐẦU TIÊN của vòng lặp (thử lại / bắt đầu phân tích với AI đã chọn).
interface RunOpts {
  retry?: boolean;
  analyze?: { provider: string; model?: string };
}

// Icon nền tảng = LOGO CHÍNH THỨC (nguồn duy nhất ở report-html.ts, dùng chung với báo cáo).
function PlatformIcon({ kind, size = 16 }: { kind: SocialChannelKind; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: platformIconSvg(kind, size + 10) }}
    />
  );
}

// Icon kênh SẮP RA MẮT (Zalo/Messenger) - logo chính thức từ report-html.
function UpcomingIcon({ kind, size = 16 }: { kind: 'zalo' | 'messenger'; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: UPCOMING_LOGO_SVG[kind](size + 10) }}
    />
  );
}

// Chip các nền tảng của 1 báo cáo (icon nhỏ xếp cạnh nhau).
function ChannelChips({ kinds }: { kinds: SocialChannelKind[] }) {
  return (
    <InlineStack gap="100" blockAlign="center">
      {kinds.map((k) => (
        <PlatformIcon key={k} kind={k} size={10} />
      ))}
    </InlineStack>
  );
}

// Cụm logo của card gộp nhiều nền tảng: LƯỚI 3 CỘT cố định (hàng ngang, mỗi hàng 3 logo)
// - InlineStack tự wrap theo bề rộng nên xếp lộn xộn (user yêu cầu 07-2026).
function IconGrid({ kinds }: { kinds: SocialChannelKind[] }) {
  return (
    <div
      aria-hidden
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, max-content)',
        gap: 3,
        flexShrink: 0,
        alignItems: 'center',
      }}
    >
      {kinds.map((k) => (
        <PlatformIcon key={k} kind={k} size={9} />
      ))}
    </div>
  );
}

type WizardStep = 'channel' | 'subtype' | 'form';
type OverallMode = 'keyword' | 'links';
// Nhóm card gộp: bấm vào hỏi tiếp loại báo cáo (shop/sản phẩm; social/e-commerce với Tổng thể).
type EcomGroup = 'shopee' | 'tiktokshop' | 'lazada' | 'overall';

// Khu vực TikTok Shop (đồng bộ TTS_REGIONS phía server - giao vùng 3 nguồn dữ liệu hỗ trợ).
const TTS_REGION_OPTIONS = ['VN', 'US', 'JP', 'ID', 'MY', 'PH', 'SG', 'TH', 'MX'];
// Khu vực tổng thể e-commerce (giao vùng CẢ 3 SÀN Shopee + TikTok Shop + Lazada hỗ trợ).
const ECOM_REGION_OPTIONS = ['VN', 'TH', 'PH', 'MY', 'SG', 'ID'];

export default function SocialReportPage() {
  const t = useTranslations('socialReport');
  const locale = useLocale();
  const router = useRouter();

  const [reports, setReports] = useState<SocialReportSummary[] | null>(null);
  const [hasApify, setHasApify] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<'all' | SocialPlatform>('all');
  const [toast, setToast] = useState('');
  const [toastErr, setToastErr] = useState(false);

  // ── Wizard tạo báo cáo ──
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('channel');
  const [platform, setPlatform] = useState<SocialPlatform>('facebook');
  const [ecomGroup, setEcomGroup] = useState<EcomGroup>('shopee'); // nhóm đang hỏi shop/sản phẩm
  const [overallMode, setOverallMode] = useState<OverallMode>('keyword');
  const [keyword, setKeyword] = useState('');
  const [fbUrl, setFbUrl] = useState('');
  const [ttUrl, setTtUrl] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [grUrl, setGrUrl] = useState(''); // URL nhóm Facebook công khai
  const [fbpUrl, setFbpUrl] = useState(''); // URL Facebook cá nhân (profile công khai)
  const [groupSort, setGroupSort] = useState<'top' | 'new'>('top');
  const [igUrl, setIgUrl] = useState(''); // Instagram profile / @handle
  const [thrUrl, setThrUrl] = useState(''); // Threads profile / @handle
  const [spUrl, setSpUrl] = useState(''); // URL sản phẩm Shopee
  const [shopUrl, setShopUrl] = useState(''); // URL/username shop Shopee
  const [ttspUrl, setTtspUrl] = useState(''); // link sản phẩm TikTok Shop
  const [ttshopName, setTtshopName] = useState(''); // TÊN shop TikTok Shop
  const [ttsRegion, setTtsRegion] = useState('VN'); // khu vực TikTok Shop / tổng thể e-commerce
  const [lzUrl, setLzUrl] = useState(''); // link sản phẩm Lazada
  const [lzShopUrl, setLzShopUrl] = useState(''); // link shop Lazada
  const [reportName, setReportName] = useState(''); // tên báo cáo tự đặt (kênh e-commerce - tuỳ chọn)
  const [reviewsLimit, setReviewsLimit] = useState('30'); // số đánh giá thu (Shopee/TikTok Shop)
  const [outLocale, setOutLocale] = useState(locale);
  const [postsLimit, setPostsLimit] = useState('10');
  const [includeReels, setIncludeReels] = useState(true);
  const [includeAds, setIncludeAds] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [analyzeId, setAnalyzeId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const running = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch('/api/social-report');
    if (res.ok) setReports((await res.json()).reports as SocialReportSummary[]);
    else setReports([]);
  }, []);

  useEffect(() => {
    void load();
    void (async () => {
      // Apify dùng POOL nhiều key: có ít nhất 1 key trong pool HOẶC đang dùng key môi trường/cũ.
      const res = await fetch('/api/integration-keys/apify');
      if (!res.ok) return setHasApify(false);
      const body = (await res.json()) as { keys?: unknown[]; usingFallback?: boolean };
      setHasApify((body.keys?.length ?? 0) > 0 || !!body.usingFallback);
    })();
  }, [load]);

  // Vòng lặp chạy 1 báo cáo: POST /step → nếu còn running thì hẹn tick tiếp.
  const runLoop = useCallback(
    (id: string, opts?: RunOpts) => {
      if (running.current.has(id)) return;
      running.current.add(id);
      const tick = async (first: RunOpts | undefined) => {
        try {
          const res = await fetch(`/api/social-report/${id}/step`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(first ?? {}),
          });
          if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error);
          const body = (await res.json()) as { report: SocialReportSummary };
          setReports((rs) => (rs ?? []).map((r) => (r.id === id ? body.report : r)));
          if (body.report.status === 'running') {
            setTimeout(() => void tick(undefined), TICK_MS);
            return;
          }
          running.current.delete(id);
          if (body.report.status === 'collected') setToast(t('collectedToast'));
          if (body.report.status === 'done') setToast(t('doneToast'));
          if (body.report.status === 'error') {
            setToastErr(true);
            setToast(body.report.error ?? t('errorToast'));
          }
        } catch (e) {
          running.current.delete(id);
          setToastErr(true);
          setToast(e instanceof Error && e.message ? e.message : t('errorToast'));
          void load();
        }
      };
      void tick(opts);
    },
    [load, t],
  );

  // Tự nối lại vòng lặp cho báo cáo đang chạy (vd sau reload trang).
  useEffect(() => {
    for (const r of reports ?? []) if (r.status === 'running') runLoop(r.id);
  }, [reports, runLoop]);

  const openWizard = () => {
    setWizardStep('channel');
    setCreateError('');
    setWizardOpen(true);
  };

  const create = useCallback(async () => {
    setCreating(true);
    setCreateError('');
    try {
      const isEcom = ['shopee', 'shopeeshop', 'tiktokshop', 'tiktokshopshop', 'lazada', 'lazadashop'].includes(platform);
      const options = {
        postsLimit: Number(postsLimit),
        reelsLimit: Number(postsLimit),
        adsLimit: Number(postsLimit),
        // Kênh e-commerce: commentsLimit = số ĐÁNH GIÁ thu về (user chọn); kênh khác giữ 30.
        commentsLimit: isEcom ? Number(reviewsLimit) : 30,
        includeReels,
        includeAds,
        includeComments,
        groupSort,
        ttsRegion,
      };
      let body: Record<string, unknown>;
      if (platform === 'ecom') {
        // Tổng thể E-COMMERCE: chỉ cần keyword - 3 kênh sàn sinh tự động phía server.
        body = { platform, locale: outLocale, options, keyword: keyword.trim() };
      } else if (platform === 'fbgroup' || isEcom) {
        const url =
          platform === 'fbgroup'
            ? grUrl
            : platform === 'shopee'
              ? spUrl
              : platform === 'shopeeshop'
                ? shopUrl
                : platform === 'tiktokshop'
                  ? ttspUrl
                  : platform === 'tiktokshopshop'
                    ? ttshopName
                    : platform === 'lazada'
                      ? lzUrl
                      : lzShopUrl;
        body = {
          platform,
          locale: outLocale,
          options,
          channels: [{ kind: platform, url: url.trim() }],
          // Tên tự đặt (kênh e-commerce): thay cho tên sản phẩm/shop dài dòng trong danh sách.
          ...(platform !== 'fbgroup' && reportName.trim() ? { title: reportName.trim() } : {}),
        };
      } else if (platform === 'overall') {
        body =
          overallMode === 'keyword'
            ? { platform, locale: outLocale, options, keyword: keyword.trim() }
            : {
                platform,
                locale: outLocale,
                options,
                channels: [
                  fbUrl.trim() ? { kind: 'facebook', url: fbUrl.trim() } : null,
                  igUrl.trim() ? { kind: 'instagram', url: igUrl.trim() } : null,
                  thrUrl.trim() ? { kind: 'threads', url: thrUrl.trim() } : null,
                  ttUrl.trim() ? { kind: 'tiktok', url: ttUrl.trim() } : null,
                  ytUrl.trim() ? { kind: 'youtube', url: ytUrl.trim() } : null,
                ].filter(Boolean),
              };
      } else {
        const url =
          platform === 'facebook'
            ? fbUrl
            : platform === 'fbprofile'
              ? fbpUrl
              : platform === 'instagram'
                ? igUrl
                : platform === 'threads'
                  ? thrUrl
                  : platform === 'tiktok'
                    ? ttUrl
                    : ytUrl;
        body = {
          platform,
          locale: outLocale,
          options,
          channels: [{ kind: platform, url: url.trim() }],
        };
      }
      const res = await fetch('/api/social-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !d.id) {
        setCreateError(d.error ?? t('createError'));
        return;
      }
      setWizardOpen(false);
      setKeyword('');
      setFbUrl('');
      setTtUrl('');
      setYtUrl('');
      setGrUrl('');
      setFbpUrl('');
      setIgUrl('');
      setThrUrl('');
      setSpUrl('');
      setShopUrl('');
      setTtspUrl('');
      setTtshopName('');
      setLzUrl('');
      setLzShopUrl('');
      setReportName('');
      await load();
      runLoop(d.id);
      setToast(t('createdToast'));
    } finally {
      setCreating(false);
    }
  }, [platform, overallMode, keyword, fbUrl, ttUrl, ytUrl, grUrl, fbpUrl, igUrl, thrUrl, spUrl, shopUrl, ttspUrl, ttshopName, lzUrl, lzShopUrl, ttsRegion, reportName, reviewsLimit, groupSort, outLocale, postsLimit, includeReels, includeAds, includeComments, load, runLoop, t]);

  const remove = useCallback(async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/social-report/${deleteId}`, { method: 'DELETE' });
      setDeleteId(null);
      setToast(t('deletedToast'));
      await load();
    } finally {
      setDeleting(false);
    }
  }, [deleteId, load, t]);

  const statusBadge = (r: SocialReportSummary) => {
    if (r.status === 'done') return <Badge tone="success">{t('statusDone')}</Badge>;
    if (r.status === 'collected') return <Badge tone="attention">{t('statusCollected')}</Badge>;
    if (r.status === 'error') return <Badge tone="critical">{t('statusError')}</Badge>;
    return <Badge tone="info">{t('statusRunning')}</Badge>;
  };

  const stepLabel = (r: SocialReportSummary): string => {
    if (!r.action) return '';
    const base = t(`steps.${r.action}`);
    return r.actionChannel ? `${base} (${PLATFORM_LABEL[r.actionChannel]})` : base;
  };

  const limitOptions = ['5', '10', '15', '20', '30'].map((v) => ({ label: v, value: v }));
  const langOptions = locales.map((l) => ({
    label: (localeNames as Record<string, { native: string }>)[l]?.native ?? l,
    value: l,
  }));

  // Tab lọc GỘP theo nền tảng: 'shopee' gồm cả báo cáo sản phẩm + shop Shopee;
  // 'tiktokshop' gồm cả sản phẩm + shop TikTok Shop (khỏi 2 tab trùng tên).
  const FILTERS: Array<'all' | SocialPlatform> = [
    'all', 'facebook', 'fbgroup', 'fbprofile', 'instagram', 'threads', 'tiktok', 'youtube',
    'shopee', 'tiktokshop', 'lazada', 'overall',
  ];
  const FILTER_GROUP: Partial<Record<SocialPlatform, SocialPlatform[]>> = {
    shopee: ['shopee', 'shopeeshop'],
    tiktokshop: ['tiktokshop', 'tiktokshopshop'],
    lazada: ['lazada', 'lazadashop'],
    overall: ['overall', 'ecom'], // tab Tổng thể gồm cả social lẫn e-commerce
  };
  const filtered = (reports ?? []).filter(
    (r) =>
      filter === 'all' ||
      (FILTER_GROUP[filter as SocialPlatform] ?? [filter]).includes(r.platform),
  );
  const tabs = FILTERS.map((f) => ({
    id: f,
    content:
      f === 'all'
        ? t('filterAll')
        : f === 'overall'
          ? t('channelOverall')
          : f === 'fbgroup'
            ? t('channelFbgroup')
            : f === 'fbprofile'
              ? t('channelFbprofile')
              : PLATFORM_LABEL[f as SocialChannelKind],
  }));

  // ── Lựa chọn kênh trong wizard ──
  // Shopee và TikTok Shop mỗi bên GỘP 1 card (group) - bấm vào popup hỏi tiếp tạo báo cáo
  // cho SHOP hay SẢN PHẨM (bước 'subtype') rồi mới vào form.
  const channelOptions: Array<{
    key: SocialPlatform | EcomGroup | 'zalo' | 'messenger';
    group?: EcomGroup;
    disabled?: boolean; // kênh sắp ra mắt - hiện tag Coming soon, không bấm được
    label: string;
    desc: string;
    icon: React.ReactNode;
  }> = [
    { key: 'facebook', label: t('channelFacebook'), desc: t('channelFacebookDesc'), icon: <PlatformIcon kind="facebook" /> },
    { key: 'fbgroup', label: t('channelFbgroup'), desc: t('channelFbgroupDesc'), icon: <PlatformIcon kind="fbgroup" /> },
    { key: 'fbprofile', label: t('channelFbprofile'), desc: t('channelFbprofileDesc'), icon: <PlatformIcon kind="fbprofile" /> },
    { key: 'instagram', label: t('channelInstagram'), desc: t('channelInstagramDesc'), icon: <PlatformIcon kind="instagram" /> },
    { key: 'threads', label: t('channelThreads'), desc: t('channelThreadsDesc'), icon: <PlatformIcon kind="threads" /> },
    { key: 'tiktok', label: t('channelTiktok'), desc: t('channelTiktokDesc'), icon: <PlatformIcon kind="tiktok" /> },
    { key: 'youtube', label: t('channelYoutube'), desc: t('channelYoutubeDesc'), icon: <PlatformIcon kind="youtube" /> },
    { key: 'shopee', group: 'shopee', label: t('channelShopeeGroup'), desc: t('channelShopeeGroupDesc'), icon: <PlatformIcon kind="shopee" /> },
    { key: 'tiktokshop', group: 'tiktokshop', label: t('channelTiktokshopGroup'), desc: t('channelTiktokshopGroupDesc'), icon: <PlatformIcon kind="tiktokshop" /> },
    { key: 'lazada', group: 'lazada', label: t('channelLazadaGroup'), desc: t('channelLazadaGroupDesc'), icon: <PlatformIcon kind="lazada" /> },
    {
      key: 'overall',
      group: 'overall',
      label: t('channelOverall'),
      desc: t('channelOverallGroupDesc'),
      icon: <IconGrid kinds={['facebook', 'tiktok', 'shopee']} />,
    },
    // Kênh SẮP RA MẮT (user yêu cầu hiện sẵn card + tag Coming soon, chưa bấm được).
    { key: 'zalo', disabled: true, label: 'Zalo', desc: t('channelZaloDesc'), icon: <UpcomingIcon kind="zalo" /> },
    { key: 'messenger', disabled: true, label: 'Messenger', desc: t('channelMessengerDesc'), icon: <UpcomingIcon kind="messenger" /> },
  ];

  // Lựa chọn của popup theo nhóm: shop/sản phẩm (sàn) hoặc social/e-commerce (Tổng thể).
  const subtypeOptions: Array<{
    platform: SocialPlatform;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }> =
    ecomGroup === 'shopee'
      ? [
          { platform: 'shopee', label: t('channelShopee'), desc: t('channelShopeeDesc'), icon: <PlatformIcon kind="shopee" /> },
          { platform: 'shopeeshop', label: t('channelShopeeShop'), desc: t('channelShopeeShopDesc'), icon: <PlatformIcon kind="shopeeshop" /> },
        ]
      : ecomGroup === 'tiktokshop'
        ? [
            { platform: 'tiktokshop', label: t('channelTiktokshopProduct'), desc: t('channelTiktokshopProductDesc'), icon: <PlatformIcon kind="tiktokshop" /> },
            { platform: 'tiktokshopshop', label: t('channelTiktokshopShop'), desc: t('channelTiktokshopShopDesc'), icon: <PlatformIcon kind="tiktokshopshop" /> },
          ]
        : ecomGroup === 'lazada'
          ? [
              { platform: 'lazada', label: t('channelLazadaProduct'), desc: t('channelLazadaProductDesc'), icon: <PlatformIcon kind="lazada" /> },
              { platform: 'lazadashop', label: t('channelLazadaShop'), desc: t('channelLazadaShopDesc'), icon: <PlatformIcon kind="lazadashop" /> },
            ]
          : [
              {
                platform: 'overall',
                label: t('channelOverallSocial'),
                desc: t('channelOverallDesc'),
                // Đủ logo 5 nền tảng social tham gia báo cáo tổng thể (user yêu cầu),
                // xếp lưới 3 cột.
                icon: <IconGrid kinds={['facebook', 'instagram', 'threads', 'tiktok', 'youtube']} />,
              },
              {
                platform: 'ecom',
                label: t('channelOverallEcom'),
                desc: t('channelOverallEcomDesc'),
                icon: <IconGrid kinds={['shopee', 'tiktokshop', 'lazada']} />,
              },
            ];

  const URL_BY_PLATFORM: Record<Exclude<SocialPlatform, 'overall' | 'ecom'>, string> = {
    facebook: fbUrl,
    fbgroup: grUrl,
    fbprofile: fbpUrl,
    instagram: igUrl,
    threads: thrUrl,
    tiktok: ttUrl,
    youtube: ytUrl,
    shopee: spUrl,
    shopeeshop: shopUrl,
    tiktokshop: ttspUrl,
    tiktokshopshop: ttshopName,
    lazada: lzUrl,
    lazadashop: lzShopUrl,
  };
  const canCreate =
    platform === 'ecom'
      ? !!keyword.trim()
      : platform === 'overall'
        ? overallMode === 'keyword'
          ? !!keyword.trim()
          : !!(fbUrl.trim() || igUrl.trim() || thrUrl.trim() || ttUrl.trim() || ytUrl.trim())
        : !!URL_BY_PLATFORM[platform].trim();

  return (
    <Page
      title={t('title')}
      subtitle={t('subtitle')}
      titleMetadata={<InfoHint content={t('titleHelp')} label={t('title')} />}
      primaryAction={{
        content: t('create'),
        onAction: openWizard,
        disabled: hasApify === false,
      }}
    >
      <BlockStack gap="400">
        {hasApify === false ? (
          <Banner
            title={t('needApify')}
            tone="warning"
            action={{ content: t('goSettings'), url: `/${locale}/settings` }}
          >
            <p>{t('needApifyDesc')}</p>
          </Banner>
        ) : null}

        <Card padding="0">
          <Tabs
            tabs={tabs}
            selected={FILTERS.indexOf(filter)}
            onSelect={(i) => setFilter(FILTERS[i])}
          />
          <Box padding="400">
            <BlockStack gap="300">
              {reports === null ? (
                <Text as="p" tone="subdued">
                  {t('loading')}
                </Text>
              ) : filtered.length === 0 ? (
                <Text as="p" tone="subdued">
                  {t('empty')}
                </Text>
              ) : (
                <BlockStack gap="300">
                  {filtered.map((r) => {
                    const pct = r.stepCount ? Math.round((r.stepIndex / r.stepCount) * 100) : 5;
                    const analyzing = r.action?.startsWith('analyze');
                    return (
                      <Box key={r.id} borderColor="border" borderWidth="025" borderRadius="200" padding="300">
                        <BlockStack gap="200">
                          <InlineStack gap="200" align="space-between" blockAlign="center" wrap>
                            <InlineStack gap="200" blockAlign="center" wrap>
                              {/* Cấu trúc: [logo] [LOẠI báo cáo] [tên] - dễ phân biệt fanpage/nhóm/nick/shop/sản phẩm. */}
                              <ChannelChips kinds={r.channelKinds} />
                              <Badge tone="info">{t(`type.${r.platform}`)}</Badge>
                              <Text as="span" fontWeight="semibold">
                                {r.title}
                              </Text>
                              {statusBadge(r)}
                            </InlineStack>
                            <InlineStack gap="200" wrap>
                              {r.status === 'error' ? (
                                <>
                                  <Button size="slim" onClick={() => runLoop(r.id, { retry: true })}>
                                    {t('retry')}
                                  </Button>
                                  {/* Lỗi ở pha PHÂN TÍCH (đã thu xong dữ liệu) → cho chọn LẠI AI/model
                                      để phân tích lại, thay vì khóa cứng AI cũ. */}
                                  {r.action && ANALYZE_ACTIONS.includes(r.action) ? (
                                    <Button size="slim" variant="primary" onClick={() => setAnalyzeId(r.id)}>
                                      {t('analyze')}
                                    </Button>
                                  ) : null}
                                </>
                              ) : null}
                              {r.status === 'collected' ? (
                                <Button size="slim" variant="primary" onClick={() => setAnalyzeId(r.id)}>
                                  {t('analyze')}
                                </Button>
                              ) : null}
                              {r.status === 'done' || r.status === 'collected' ? (
                                <Button
                                  size="slim"
                                  variant={r.status === 'done' ? 'primary' : 'secondary'}
                                  onClick={() => router.push(`/${locale}/social-report/${r.id}`)}
                                >
                                  {t('open')}
                                </Button>
                              ) : null}
                              <Button
                                size="slim"
                                tone="critical"
                                variant="secondary"
                                onClick={() => setDeleteId(r.id)}
                              >
                                {t('delete')}
                              </Button>
                            </InlineStack>
                          </InlineStack>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {new Date(r.createdAt).toLocaleString(locale)} ·{' '}
                            {(localeNames as Record<string, { native: string }>)[r.locale]?.native ?? r.locale}
                          </Text>
                          {r.status === 'running' ? (
                            analyzing ? (
                              <AiWorking text={`${stepLabel(r)}…`} progress="indeterminate" />
                            ) : (
                              <BlockStack gap="100">
                                <ProgressBar progress={pct} size="small" />
                                <Text as="p" tone="subdued" variant="bodySm">
                                  {stepLabel(r)}…
                                </Text>
                              </BlockStack>
                            )
                          ) : null}
                          {r.status === 'error' && r.error ? (
                            <Text as="p" tone="critical" variant="bodySm">
                              {r.error}
                            </Text>
                          ) : null}
                        </BlockStack>
                      </Box>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>

      {/* ── Wizard tạo báo cáo: bước 1 chọn kênh → bước 2 nhập nội dung phù hợp ── */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={
          wizardStep === 'channel'
            ? t('chooseChannel')
            : wizardStep === 'subtype'
              ? t('chooseReportType')
              : t('createTitle')
        }
        primaryAction={
          wizardStep === 'form'
            ? { content: t('create'), onAction: () => void create(), loading: creating, disabled: !canCreate }
            : undefined
        }
        secondaryActions={
          wizardStep === 'form'
            ? [
                {
                  content: t('back'),
                  // Kênh e-commerce đi qua popup shop/sản phẩm → quay lại đúng bước đó.
                  onAction: () =>
                    setWizardStep(
                      ['shopee', 'shopeeshop', 'tiktokshop', 'tiktokshopshop', 'lazada', 'lazadashop', 'overall', 'ecom'].includes(platform)
                        ? 'subtype'
                        : 'channel',
                    ),
                },
                { content: t('cancel'), onAction: () => setWizardOpen(false) },
              ]
            : wizardStep === 'subtype'
              ? [
                  { content: t('back'), onAction: () => setWizardStep('channel') },
                  { content: t('cancel'), onAction: () => setWizardOpen(false) },
                ]
              : [{ content: t('cancel'), onAction: () => setWizardOpen(false) }]
        }
      >
        <Modal.Section>
          {wizardStep === 'channel' ? (
            <BlockStack gap="200">
              {channelOptions.map((o) => {
                const pick = () => {
                  if (o.disabled) return; // sắp ra mắt - chưa chọn được
                  if (o.group) {
                    setEcomGroup(o.group);
                    setWizardStep('subtype');
                  } else {
                    setPlatform(o.key as SocialPlatform);
                    setWizardStep('form');
                  }
                };
                return (
                  <div
                    key={o.key}
                    role={o.disabled ? undefined : 'button'}
                    tabIndex={o.disabled ? -1 : 0}
                    aria-disabled={o.disabled || undefined}
                    onClick={pick}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') pick();
                    }}
                    style={{ cursor: o.disabled ? 'default' : 'pointer', opacity: o.disabled ? 0.65 : 1 }}
                  >
                    <Box borderColor="border" borderWidth="025" borderRadius="300" padding="300">
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        {o.icon}
                        <BlockStack gap="050">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" fontWeight="semibold">
                              {o.label}
                            </Text>
                            {o.disabled ? <Badge tone="attention">{t('channelComingSoon')}</Badge> : null}
                          </InlineStack>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {o.desc}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </Box>
                  </div>
                );
              })}
            </BlockStack>
          ) : wizardStep === 'subtype' ? (
            <BlockStack gap="200">
              {subtypeOptions.map((o) => (
                <div
                  key={o.platform}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setPlatform(o.platform);
                    setWizardStep('form');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setPlatform(o.platform);
                      setWizardStep('form');
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <Box borderColor="border" borderWidth="025" borderRadius="300" padding="300">
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      {o.icon}
                      <BlockStack gap="050">
                        <Text as="span" fontWeight="semibold">
                          {o.label}
                        </Text>
                        <Text as="span" tone="subdued" variant="bodySm">
                          {o.desc}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </Box>
                </div>
              ))}
            </BlockStack>
          ) : (
            <BlockStack gap="300">
              {createError ? (
                <Banner tone="critical">
                  <p>{createError}</p>
                </Banner>
              ) : null}

              {platform === 'ecom' ? (
                <TextField
                  autoComplete="off"
                  label={<HelpLabel label={t('ecomKeyword')} help={t('ecomKeywordHelp')} />}
                  value={keyword}
                  onChange={setKeyword}
                  placeholder={t('ecomKeywordPlaceholder')}
                />
              ) : platform === 'overall' ? (
                <>
                  <ChoiceList
                    title={t('overallMode')}
                    choices={[
                      { label: t('overallModeKeyword'), value: 'keyword', helpText: t('overallModeKeywordDesc') },
                      { label: t('overallModeLinks'), value: 'links', helpText: t('overallModeLinksDesc') },
                    ]}
                    selected={[overallMode]}
                    onChange={(v) => setOverallMode((v[0] as OverallMode) ?? 'keyword')}
                  />
                  {overallMode === 'keyword' ? (
                    <TextField
                      autoComplete="off"
                      label={<HelpLabel label={t('keyword')} help={t('keywordHelp')} />}
                      value={keyword}
                      onChange={setKeyword}
                      placeholder={t('keywordPlaceholder')}
                    />
                  ) : (
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued" variant="bodySm">
                        {t('linksNote')}
                      </Text>
                      <TextField autoComplete="off" label="Facebook" value={fbUrl} onChange={setFbUrl} placeholder="https://www.facebook.com/tenfanpage" prefix={<PlatformIcon kind="facebook" size={10} />} />
                      <TextField autoComplete="off" label="Instagram" value={igUrl} onChange={setIgUrl} placeholder="https://www.instagram.com/username" prefix={<PlatformIcon kind="instagram" size={10} />} />
                      <TextField autoComplete="off" label="Threads" value={thrUrl} onChange={setThrUrl} placeholder="https://www.threads.net/@username" prefix={<PlatformIcon kind="threads" size={10} />} />
                      <TextField autoComplete="off" label="TikTok" value={ttUrl} onChange={setTtUrl} placeholder="https://www.tiktok.com/@username" prefix={<PlatformIcon kind="tiktok" size={10} />} />
                      <TextField autoComplete="off" label="YouTube" value={ytUrl} onChange={setYtUrl} placeholder="https://www.youtube.com/@channel" prefix={<PlatformIcon kind="youtube" size={10} />} />
                    </BlockStack>
                  )}
                </>
              ) : platform === 'facebook' ? (
                <TextField
                  autoComplete="off"
                  label={<HelpLabel label={t('pageUrl')} help={t('pageUrlHelp')} />}
                  value={fbUrl}
                  onChange={setFbUrl}
                  placeholder="https://www.facebook.com/tenfanpage"
                />
              ) : platform === 'fbgroup' ? (
                <>
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('groupUrl')} help={t('groupUrlHelp')} />}
                    value={grUrl}
                    onChange={setGrUrl}
                    placeholder="https://www.facebook.com/groups/tennhom"
                  />
                  <Select
                    label={<HelpLabel label={t('groupSort')} help={t('groupSortHelp')} />}
                    options={[
                      { label: t('groupSortTop'), value: 'top' },
                      { label: t('groupSortNew'), value: 'new' },
                    ]}
                    value={groupSort}
                    onChange={(v) => setGroupSort(v === 'new' ? 'new' : 'top')}
                  />
                </>
              ) : platform === 'fbprofile' ? (
                <TextField
                  autoComplete="off"
                  label={<HelpLabel label={t('profileUrl')} help={t('profileUrlHelp')} />}
                  value={fbpUrl}
                  onChange={setFbpUrl}
                  placeholder="https://www.facebook.com/tennick"
                />
              ) : platform === 'instagram' ? (
                <TextField
                  autoComplete="off"
                  label={<HelpLabel label={t('instagramUrl')} help={t('instagramUrlHelp')} />}
                  value={igUrl}
                  onChange={setIgUrl}
                  placeholder="https://www.instagram.com/username"
                />
              ) : platform === 'threads' ? (
                <TextField
                  autoComplete="off"
                  label={<HelpLabel label={t('threadsUrl')} help={t('threadsUrlHelp')} />}
                  value={thrUrl}
                  onChange={setThrUrl}
                  placeholder="https://www.threads.net/@username"
                />
              ) : platform === 'shopee' ? (
                <>
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('shopeeUrl')} help={t('shopeeUrlHelp')} />}
                    value={spUrl}
                    onChange={setSpUrl}
                    placeholder="https://shopee.vn/ten-san-pham-i.123456.7890123"
                  />
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('reportName')} help={t('reportNameHelp')} />}
                    value={reportName}
                    onChange={setReportName}
                    placeholder={t('reportNamePlaceholder')}
                    maxLength={120}
                  />
                </>
              ) : platform === 'shopeeshop' ? (
                <>
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('shopUrl')} help={t('shopUrlHelp')} />}
                    value={shopUrl}
                    onChange={setShopUrl}
                    placeholder="https://shopee.vn/tenshop"
                  />
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('reportName')} help={t('reportNameHelp')} />}
                    value={reportName}
                    onChange={setReportName}
                    placeholder={t('reportNamePlaceholder')}
                    maxLength={120}
                  />
                </>
              ) : platform === 'tiktokshop' ? (
                <>
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('ttsProductUrl')} help={t('ttsProductUrlHelp')} />}
                    value={ttspUrl}
                    onChange={setTtspUrl}
                    placeholder="https://www.tiktok.com/view/product/1729..."
                  />
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('reportName')} help={t('reportNameHelp')} />}
                    value={reportName}
                    onChange={setReportName}
                    placeholder={t('reportNamePlaceholder')}
                    maxLength={120}
                  />
                </>
              ) : platform === 'tiktokshopshop' ? (
                <>
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('ttsShopName')} help={t('ttsShopNameHelp')} />}
                    value={ttshopName}
                    onChange={setTtshopName}
                    placeholder={t('ttsShopNamePlaceholder')}
                    maxLength={80}
                  />
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('reportName')} help={t('reportNameHelp')} />}
                    value={reportName}
                    onChange={setReportName}
                    placeholder={t('reportNamePlaceholder')}
                    maxLength={120}
                  />
                </>
              ) : platform === 'lazada' ? (
                <>
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('lazadaUrl')} help={t('lazadaUrlHelp')} />}
                    value={lzUrl}
                    onChange={setLzUrl}
                    placeholder="https://www.lazada.vn/products/ten-san-pham-i123456789.html"
                  />
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('reportName')} help={t('reportNameHelp')} />}
                    value={reportName}
                    onChange={setReportName}
                    placeholder={t('reportNamePlaceholder')}
                    maxLength={120}
                  />
                </>
              ) : platform === 'lazadashop' ? (
                <>
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('lazadaShopUrl')} help={t('lazadaShopUrlHelp')} />}
                    value={lzShopUrl}
                    onChange={setLzShopUrl}
                    placeholder="https://www.lazada.vn/shop/tenshop"
                  />
                  <TextField
                    autoComplete="off"
                    label={<HelpLabel label={t('reportName')} help={t('reportNameHelp')} />}
                    value={reportName}
                    onChange={setReportName}
                    placeholder={t('reportNamePlaceholder')}
                    maxLength={120}
                  />
                </>
              ) : platform === 'tiktok' ? (
                <TextField
                  autoComplete="off"
                  label={<HelpLabel label={t('tiktokUrl')} help={t('tiktokUrlHelp')} />}
                  value={ttUrl}
                  onChange={setTtUrl}
                  placeholder="https://www.tiktok.com/@username"
                />
              ) : (
                <TextField
                  autoComplete="off"
                  label={<HelpLabel label={t('youtubeUrl')} help={t('youtubeUrlHelp')} />}
                  value={ytUrl}
                  onChange={setYtUrl}
                  placeholder="https://www.youtube.com/@channel"
                />
              )}

              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                <Select
                  label={<HelpLabel label={t('language')} help={t('languageHelp')} />}
                  options={langOptions}
                  value={outLocale}
                  onChange={setOutLocale}
                />
                {platform === 'shopee' || platform === 'tiktokshop' || platform === 'lazada' ? (
                  <Select
                    label={<HelpLabel label={t('reviewsLimit')} help={t('reviewsLimitHelp')} />}
                    options={['20', '30', '50', '100'].map((v) => ({ label: v, value: v }))}
                    value={reviewsLimit}
                    onChange={setReviewsLimit}
                  />
                ) : (
                  <Select
                    label={
                      <HelpLabel
                        label={t(
                          platform === 'shopeeshop' || platform === 'tiktokshopshop' || platform === 'lazadashop'
                            ? 'productsLimit'
                            : platform === 'ecom'
                              ? 'ecomProductsLimit'
                              : 'postsLimit',
                        )}
                        help={t(
                          platform === 'shopeeshop' || platform === 'tiktokshopshop' || platform === 'lazadashop'
                            ? 'productsLimitHelp'
                            : platform === 'ecom'
                              ? 'ecomProductsLimitHelp'
                              : 'postsLimitHelp',
                        )}
                      />
                    }
                    options={
                      platform === 'shopeeshop' || platform === 'tiktokshopshop' || platform === 'lazadashop'
                        ? ['10', '20', '30', '40'].map((v) => ({ label: v, value: v }))
                        : platform === 'ecom'
                          ? ['10', '20'].map((v) => ({ label: v, value: v }))
                          : limitOptions
                    }
                    value={postsLimit}
                    onChange={setPostsLimit}
                  />
                )}
                {platform === 'shopeeshop' || platform === 'tiktokshopshop' || platform === 'lazadashop' ? (
                  <Select
                    label={<HelpLabel label={t('reviewsLimit')} help={t('reviewsLimitHelp')} />}
                    options={['20', '30', '50', '100'].map((v) => ({ label: v, value: v }))}
                    value={reviewsLimit}
                    onChange={setReviewsLimit}
                  />
                ) : null}
                {platform === 'tiktokshop' || platform === 'tiktokshopshop' || platform === 'ecom' ? (
                  <Select
                    label={<HelpLabel label={t(platform === 'ecom' ? 'ecomRegion' : 'ttsRegion')} help={t(platform === 'ecom' ? 'ecomRegionHelp' : 'ttsRegionHelp')} />}
                    options={(platform === 'ecom' ? ECOM_REGION_OPTIONS : TTS_REGION_OPTIONS).map((v) => ({ label: v, value: v }))}
                    value={ttsRegion}
                    onChange={setTtsRegion}
                  />
                ) : null}
              </InlineGrid>
              {platform === 'facebook' || platform === 'instagram' ? (
                <Checkbox
                  label={<HelpLabel label={t('includeReels')} help={t('includeReelsHelp')} />}
                  checked={includeReels}
                  onChange={setIncludeReels}
                />
              ) : null}
              {platform === 'facebook' ? (
                <Checkbox
                  label={<HelpLabel label={t('includeAds')} help={t('includeAdsHelp')} />}
                  checked={includeAds}
                  onChange={setIncludeAds}
                />
              ) : null}
              {(platform === 'overall' && overallMode === 'keyword') ||
              ['shopee', 'shopeeshop', 'tiktokshop', 'tiktokshopshop', 'lazada', 'lazadashop', 'ecom'].includes(platform) ? null : (
                <Checkbox
                  label={<HelpLabel label={t('includeComments')} help={t('includeCommentsHelp')} />}
                  checked={includeComments}
                  onChange={setIncludeComments}
                />
              )}
              <Text as="p" tone="subdued" variant="bodySm">
                {t('costNote')}
              </Text>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      <SocialAnalyzeModal
        open={analyzeId !== null}
        onClose={() => setAnalyzeId(null)}
        onStart={(provider, model) => {
          const id = analyzeId;
          setAnalyzeId(null);
          if (!id) return;
          // Cập nhật lạc quan: hiện animation AI ngay tại hàng vừa bấm, không chờ round-trip.
          setReports((rs) =>
            (rs ?? []).map((r) =>
              r.id === id ? { ...r, status: 'running' as const, action: 'analyzeBrand' as const } : r,
            ),
          );
          runLoop(id, { analyze: { provider, model } });
        }}
      />

      <Modal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title={t('deleteTitle')}
        primaryAction={{
          content: t('delete'),
          destructive: true,
          onAction: () => void remove(),
          loading: deleting,
        }}
        secondaryActions={[{ content: t('cancel'), onAction: () => setDeleteId(null) }]}
      >
        <Modal.Section>
          <Text as="p">{t('deleteConfirm')}</Text>
        </Modal.Section>
      </Modal>

      {toast ? (
        <Toast
          content={toast}
          error={toastErr}
          onDismiss={() => {
            setToast('');
            setToastErr(false);
          }}
        />
      ) : null}
    </Page>
  );
}

// Tên thương hiệu nền tảng - không dịch.
const PLATFORM_LABEL: Record<SocialChannelKind, string> = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  fbgroup: 'Facebook Group',
  fbprofile: 'Facebook cá nhân',
  instagram: 'Instagram',
  threads: 'Threads',
  shopee: 'Shopee',
  shopeeshop: 'Shopee Shop',
  tiktokshop: 'TikTok Shop',
  tiktokshopshop: 'TikTok Shop (Shop)',
  lazada: 'Lazada',
  lazadashop: 'Lazada (Shop)',
};

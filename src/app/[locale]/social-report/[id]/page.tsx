'use client';

// Trang XEM một Báo cáo Social: thân báo cáo dựng từ buildSocialReportBody (chính là nội
// dung sẽ xuất PDF/.doc/Drive → xem gì xuất nấy). Kèm hành động: In/Lưu PDF, tải .doc,
// lưu Google Drive, xóa.
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Collapsible,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Text,
  TextField,
  Toast,
} from '@shopify/polaris';
import { ImageAiPicker, type ImgProvider } from '@/components/ImageAiPicker';
import { useLocale, useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SocialAnalyzeModal } from '@/components/SocialAnalyzeModal';
import { SocialStyleModal } from '@/components/SocialStyleModal';
import { AiWorking } from '@/components/ui';
import {
  buildSocialReportBody,
  buildSocialReportHtml,
  socialReportFileName,
  type SocialReportBrand,
  type SocialReportLabels,
  type SocialReportTheme,
} from '@/lib/social/report-html';
import type { SocialReportRecord } from '@/lib/social/types';

// Các khóa nhãn mà report-html cần (nguồn: socialReport.view trong messages).
const LABEL_KEYS = [
  'reportSubtitle', 'generatedAt', 'followers', 'likes', 'category', 'rating', 'intro',
  'organicPosts', 'post', 'ad', 'type_reel', 'type_video', 'type_image', 'type_event',
  'type_text', 'type_other', 'views', 'reactions', 'commentsCount', 'shares', 'time',
  'description', 'none', 'transcript', 'adsTitle', 'adContent', 'metricsTitle', 'totalLikes',
  'totalFollowers', 'lfRatio', 'formatDist', 'avgEngagement', 'avgReactions', 'avgComments',
  'avgShares', 'postFrequency', 'perDay', 'adFormatDist', 'ctaDist', 'positioning',
  'brandVoice', 'targetAudience', 'contentPillars', 'contentFormulas', 'hooks', 'leading',
  'ctas', 'adStrategy', 'adFormulas', 'adAngles', 'funnel', 'tofu', 'mofu', 'bofu',
  'strategySummary', 'swot', 'strengths', 'weaknesses', 'suggestions', 'avoid', 'learnFrom',
  'contentIdeas', 'ideaReason', 'effectiveness', 'relatedPosts',
  // V2 đa kênh + bố cục theo nền tảng
  'totalMetricsTitle', 'compareTitle', 'compareChannels', 'bestFormats', 'allocation',
  'keywordLabel', 'searchResults', 'avgViews', 'hearts', 'subscribers', 'videos',
  'totalViews', 'ytLikes', 'avgHearts', 'avgYtLikes', 'metricsTitleChannel', 'videosTitle',
  'videoItem',
  // Báo cáo NHÓM Facebook (bài + bình luận theo bài, chỉ số nhóm, phân tích cộng đồng)
  'members', 'author', 'postComments', 'groupPostsTitle', 'metricsTitleGroup', 'groupPosts',
  'topContributors', 'contributorPosts', 'contributorEngagement', 'groupOverview', 'hotTopics',
  'groupFormats', 'engagementDrivers', 'memberProfile', 'memberNeedsPains', 'memberNeeds',
  'painPoints', 'memberQuestions', 'memberLanguage', 'groupSummaryTitle', 'opportunities',
  'engagementGuide', 'engagementTips',
  // Báo cáo FACEBOOK CÁ NHÂN (nhãn riêng cho phần "người theo dõi/tương tác").
  'profileOverview', 'followerProfile', 'followerLanguage', 'profileSummaryTitle',
  'profileOpportunities', 'profileEngagementGuide',
  // Instagram/Threads
  'reposts', 'avgReposts',
  // Báo cáo SẢN PHẨM Shopee (info + đánh giá theo khía cạnh + phân tích e-commerce)
  'productTitle', 'priceLabel', 'discountLabel', 'soldLabel', 'stockLabel', 'ratingLabel',
  'reviewsTotal', 'shopLabel', 'attributesLabel', 'variantsLabel', 'review', 'reviewsTitle',
  'variantBought', 'sellerReply', 'metricsTitleProduct', 'ratingCollected', 'reviewsCollected',
  'withMedia', 'sellerReplies', 'ratingDist', 'topVariants', 'productOverview', 'listingReview',
  'listingStrengths', 'listingGaps', 'pricingPosition', 'reviewSentiment', 'praisesComplaints',
  'praises', 'complaints', 'customerNeeds', 'buyerLanguage', 'shopeeSummaryTitle', 'improvements',
  'buyerFaq',
  // Báo cáo SHOP Shopee (info shop + danh mục + đánh giá theo sản phẩm + phân tích shop)
  'shopInfoTitle', 'itemCountLabel', 'responseRate', 'shopLocation', 'productsTitle',
  'productsCollected', 'priceRange', 'priceAvg', 'withDiscount', 'topRated', 'metricsTitleShop',
  'ofProduct', 'shopOverview', 'priceStrategy', 'catalogReview', 'strongProducts', 'catalogGaps',
  'shopSummaryTitle',
  // Shop TikTok Shop (số liệu shop từ nguồn analytics)
  'shopTotalSold', 'shopGmv',
  // Tổng thể E-COMMERCE (nghiên cứu thị trường 3 sàn)
  'ecomOverview', 'ecomPlatforms', 'ecomPricing', 'ecomDemand', 'ecomCompetitionOverview',
  'ecomCompetitors', 'ecomStrategies', 'ecomSummaryTitle', 'ecomOppRisks', 'ecomRisks',
  'ecomEntryPlan',
  // Biểu đồ báo cáo tổng thể (social + e-commerce)
  'socialChartsTitle', 'ecomChartsTitle', 'chartFollowers', 'chartEngagement', 'chartViews',
  'chartPriceAvg', 'chartTopSold', 'chartRatingAvg', 'chartTrend', 'chart30d', 'chartSoldNote',
  'channelChartsTitle', 'chartTimeline', 'chartTopPosts', 'chartWeekday', 'chartPriceBuckets',
  'unitViews', 'unitEngagement', 'unitPosts', 'unitSold', 'unitProducts', 'unitReviews',
  'unitFollowers',
] as const;

export default function SocialReportViewPage() {
  const t = useTranslations('socialReport');
  const tv = useTranslations('socialReport.view');
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [report, setReport] = useState<SocialReportRecord | null>(null);
  const [brand, setBrand] = useState<SocialReportBrand | undefined>(undefined); // logo + nguồn (Thông tin hệ thống)
  const [theme, setTheme] = useState<SocialReportTheme | undefined>(undefined); // màu riêng Báo cáo Social
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState('');
  const [toastErr, setToastErr] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveLink, setDriveLink] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(''); // link chia sẻ công khai /share/<token>
  const [prettyUrl, setPrettyUrl] = useState(''); // link rút gọn dạng blog /bao-cao-... (đăng MXH)
  const [shareBusy, setShareBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false); // đã có link → thu gọn card, bấm mở rộng để xem
  const [sharePw, setSharePw] = useState(''); // ô nhập mật khẩu khóa link
  const [sharePwBusy, setSharePwBusy] = useState(false);
  // Ảnh bìa AI cho link chia sẻ (Open Graph).
  const [coverPrompt, setCoverPrompt] = useState('');
  const [coverSD, setCoverSD] = useState(true); // dùng System design (Cài đặt ảnh AI)
  const [coverProvider, setCoverProvider] = useState<ImgProvider>('');
  const [coverModel, setCoverModel] = useState('');
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverPreview, setCoverPreview] = useState(false); // modal xem ảnh bìa cỡ lớn
  // Giới hạn theo gói (từ server): viewLocked = ẩn phân tích sâu; exportLocked = chặn xuất file.
  const [gated, setGated] = useState<{ viewLocked: boolean; exportLocked: boolean }>({
    viewLocked: false,
    exportLocked: false,
  });

  const labels: SocialReportLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of LABEL_KEYS) out[k] = tv(k);
    return out;
  }, [tv]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/social-report/${id}`);
    if (!res.ok) return setNotFound(true);
    const body = (await res.json()) as {
      report: SocialReportRecord;
      gated?: { viewLocked: boolean; exportLocked: boolean };
      branding?: SocialReportBrand;
      socialTheme?: SocialReportTheme;
    };
    setReport(body.report);
    setGated(body.gated ?? { viewLocked: false, exportLocked: false });
    setBrand(body.branding);
    setTheme(body.socialTheme);
    // Link chia sẻ (nếu đã bật) — dựng URL tuyệt đối từ origin hiện tại + token lưu trong record.
    setShareUrl(body.report.share ? `${window.location.origin}/share/${body.report.share.token}` : '');
    setPrettyUrl(body.report.share?.slug ? `${window.location.origin}/${body.report.share.slug}` : '');
    // Đã có link chia sẻ → mặc định THU GỌN card (đỡ chiếm chỗ); chưa có → mở để người dùng tạo.
    setShareOpen(!body.report.share);
  }, [id]);

  const enableShare = useCallback(async () => {
    setShareBusy(true);
    try {
      const res = await fetch(`/api/social-report/${id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable' }),
      });
      const d = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.ok && d?.url) {
        setShareUrl(d.url);
        setToast(t('share.created'));
      } else {
        setToast(d?.error ?? t('share.error'));
        setToastErr(true);
      }
      await load();
    } finally {
      setShareBusy(false);
    }
  }, [id, t, load]);

  const disableShare = useCallback(async () => {
    setShareBusy(true);
    try {
      await fetch(`/api/social-report/${id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable' }),
      });
      setShareUrl('');
      setPrettyUrl('');
      setToast(t('share.revoked'));
      await load();
    } finally {
      setShareBusy(false);
    }
  }, [id, t, load]);

  // Tạo ảnh bìa AI cho link chia sẻ (lưu vào report.shareCover).
  const genCover = useCallback(async () => {
    setCoverBusy(true);
    try {
      const res = await fetch(`/api/social-report/${id}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: coverPrompt.trim() || undefined,
          useSystemDesign: coverSD,
          provider: coverProvider || undefined,
          model: coverProvider ? coverModel || undefined : undefined,
        }),
      });
      const d = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.ok && d?.url) {
        setReport((r) => (r ? { ...r, shareCover: d.url } : r));
        setToast(t('share.coverCreated'));
      } else {
        setToast(d?.error ?? t('share.coverError'));
        setToastErr(true);
      }
    } finally {
      setCoverBusy(false);
    }
  }, [id, coverPrompt, coverSD, coverProvider, coverModel, t]);

  const removeCover = useCallback(async () => {
    setCoverBusy(true);
    try {
      await fetch(`/api/social-report/${id}/cover`, { method: 'DELETE' });
      setReport((r) => (r ? { ...r, shareCover: undefined } : r));
    } finally {
      setCoverBusy(false);
    }
  }, [id]);

  // Tải ảnh bìa TỪ NGOÀI: đọc file → data URI → server nén + chuyển JPEG (giữ nguyên cơ chế AI riêng).
  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const uploadCover = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        setToast(t('share.coverUploadTooBig'));
        setToastErr(true);
        return;
      }
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
      }).catch(() => '');
      if (!dataUri) return;
      setCoverBusy(true);
      try {
        const res = await fetch(`/api/social-report/${id}/cover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUri }),
        });
        const d = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
        if (res.ok && d?.url) {
          setReport((r) => (r ? { ...r, shareCover: d.url } : r));
          setToast(t('share.coverCreated'));
        } else {
          setToast(d?.error ?? t('share.coverError'));
          setToastErr(true);
        }
      } finally {
        setCoverBusy(false);
      }
    },
    [id, t],
  );

  // Đặt/đổi/gỡ mật khẩu khóa link chia sẻ. remove=true → gỡ khóa (công khai).
  const saveSharePassword = useCallback(
    async (remove: boolean) => {
      setSharePwBusy(true);
      try {
        const res = await fetch(`/api/social-report/${id}/share/password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: remove ? '' : sharePw }),
        });
        const d = (await res.json().catch(() => null)) as { locked?: boolean; error?: string } | null;
        if (res.ok) {
          setReport((r) => (r && r.share ? { ...r, share: { ...r.share, locked: !!d?.locked } } : r));
          setSharePw('');
          setToast(remove ? t('share.passwordRemoved') : t('share.passwordSet'));
        } else {
          setToast(d?.error ?? t('share.updateFailed'));
          setToastErr(true);
        }
      } finally {
        setSharePwBusy(false);
      }
    },
    [id, sharePw, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Báo cáo đang chạy → tiếp tục vòng lặp step ngay tại trang này.
  useEffect(() => {
    if (!report || report.status !== 'running') return;
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/social-report/${id}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (stop) return;
      if (!res.ok) return void load();
      const body = (await res.json()) as { report: { status: string } };
      if (body.report.status === 'running') setTimeout(() => void tick(), 4000);
      else void load();
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [report?.status, id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // 'collected' = mới có dữ liệu thô; 'done' = kèm phân tích AI. Cả hai đều xem/xuất được.
  // Trang xem dùng chế độ THU GỌN: mỗi mục là khối bấm-để-mở (mặc định đóng).
  const bodyHtml = useMemo(
    () =>
      report && (report.status === 'done' || report.status === 'collected')
        ? buildSocialReportBody(report, labels, { collapsible: true, theme })
        : '',
    [report, labels, theme],
  );

  // Bắt đầu pha phân tích với AI/model đã chọn → effect vòng lặp step sẽ tự chạy tiếp.
  const startAnalysis = useCallback(
    async (provider: string, model?: string) => {
      setAnalyzeOpen(false);
      await fetch(`/api/social-report/${id}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyze: { provider, model } }),
      });
      await load();
    },
    [id, load],
  );

  // In → người dùng chọn "Save as PDF" trong hộp thoại in của trình duyệt.
  // Chờ lâu hơn một nhịp để logo thương hiệu kịp tải trước khi mở hộp thoại in.
  const exportPdf = useCallback(() => {
    if (!report) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(buildSocialReportHtml(report, labels, { brand, theme, print: true }));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  }, [report, labels, brand, theme]);

  const exportDoc = useCallback(() => {
    if (!report) return;
    const blob = new Blob([buildSocialReportHtml(report, labels, { brand, theme })], {
      type: 'application/msword',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = socialReportFileName(report, 'doc');
    a.click();
    URL.revokeObjectURL(a.href);
  }, [report, labels, brand, theme]);

  const exportDrive = useCallback(async () => {
    setDriveBusy(true);
    setDriveLink('');
    try {
      const res = await fetch(`/api/social-report/${id}/export-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        needsConnect?: boolean;
        webViewLink?: string;
        error?: string;
      };
      if (body.needsConnect) {
        setToastErr(true);
        setToast(t('driveNotConnected'));
        return;
      }
      if (!res.ok || !body.ok) {
        setToastErr(true);
        setToast(body.error ?? t('errorToast'));
        return;
      }
      if (body.webViewLink) setDriveLink(body.webViewLink);
      setToast(t('savedDrive'));
    } finally {
      setDriveBusy(false);
    }
  }, [id, labels, t]);

  const remove = useCallback(async () => {
    setDeleting(true);
    try {
      await fetch(`/api/social-report/${id}`, { method: 'DELETE' });
      router.push(`/${locale}/social-report`);
    } finally {
      setDeleting(false);
    }
  }, [id, locale, router]);

  if (notFound) {
    return (
      <Page title={t('title')} backAction={{ url: `/${locale}/social-report` }}>
        <Banner tone="critical">
          <p>{t('notFound')}</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title={report?.title ?? t('title')}
      titleMetadata={report ? <Badge tone="info">{t(`type.${report.platform}`)}</Badge> : undefined}
      subtitle={report ? new Date(report.createdAt).toLocaleString(locale) : undefined}
      backAction={{ url: `/${locale}/social-report` }}
      primaryAction={
        report?.status === 'collected'
          ? { content: t('analyze'), onAction: () => setAnalyzeOpen(true) }
          : undefined
      }
      secondaryActions={
        report?.status === 'done' || report?.status === 'collected'
          ? [
              ...(report.status === 'done'
                ? [{ content: t('analyzeAgain'), onAction: () => setAnalyzeOpen(true) }]
                : []),
              // Style thương hiệu rút từ BÀI ĐĂNG → không áp dụng cho báo cáo sản phẩm/shop
              // (Shopee + TikTok Shop).
              ...(!['shopee', 'shopeeshop', 'tiktokshop', 'tiktokshopshop', 'lazada', 'lazadashop', 'ecom'].includes(report.platform)
                ? [{ content: t('style.button'), onAction: () => setStyleOpen(true) }]
                : []),
              // Gói FREE không được xuất file → ẩn các nút xuất (đã chốt thêm ở server).
              ...(!gated.exportLocked
                ? [
                    { content: t('exportPdf'), onAction: exportPdf },
                    { content: t('exportDoc'), onAction: exportDoc },
                    { content: t('exportDrive'), onAction: () => void exportDrive(), loading: driveBusy } as never,
                  ]
                : []),
              { content: t('delete'), destructive: true, onAction: () => setDeleteOpen(true) },
            ]
          : [{ content: t('delete'), destructive: true, onAction: () => setDeleteOpen(true) }]
      }
    >
      <BlockStack gap="400">
        {report === null ? (
          <Card>
            <Text as="p" tone="subdued">
              {t('loading')}
            </Text>
          </Card>
        ) : report.status === 'running' ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                {t('statusRunning')}
              </Text>
              {/* Animation AI đang chạy (gradient + chấm nảy) ngay tại chỗ, kèm tên bước. */}
              <AiWorking
                text={`${t(`steps.${report.plan[report.stepIndex]?.action ?? 'posts'}`)}…`}
                progress="indeterminate"
              />
            </BlockStack>
          </Card>
        ) : report.status === 'error' ? (
          <Banner tone="critical" title={t('statusError')}>
            <p>{report.error}</p>
          </Banner>
        ) : (
          <>
            {report.status === 'collected' ? (
              <Banner
                tone="info"
                title={t('statusCollected')}
                action={{ content: t('analyze'), onAction: () => setAnalyzeOpen(true) }}
              >
                <p>{t('collectedBanner')}</p>
              </Banner>
            ) : null}
            {report.warnings.length ? (
              <Banner tone="warning" title={t('warningsTitle')}>
                <p>{t('warningsDesc')}</p>
              </Banner>
            ) : null}
            {driveLink ? (
              <Banner tone="success" title={t('savedDrive')}>
                <p>
                  <a href={driveLink} target="_blank" rel="noopener noreferrer">
                    {t('openDrive')}
                  </a>
                </p>
              </Banner>
            ) : null}
            {/* Chia sẻ công khai: link chỉ-xem như một bài blog. Nội dung công khai vẫn theo GÓI
                của chủ (server áp gating ở trang /share). */}
            <Card>
              <BlockStack gap="200">
                {/* Header: tiêu đề + trạng thái (khi thu gọn) + nút mở rộng/thu gọn */}
                <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                  <InlineStack gap="200" blockAlign="center" wrap>
                    <Text as="h2" variant="headingMd">
                      {t('share.title')}
                    </Text>
                    {shareUrl ? (
                      report?.share?.locked ? (
                        <Badge tone="attention">{t('share.lockedBadge')}</Badge>
                      ) : (
                        <Badge tone="success">{t('share.publicBadge')}</Badge>
                      )
                    ) : null}
                  </InlineStack>
                  <Button
                    variant="plain"
                    disclosure={shareOpen ? 'up' : 'down'}
                    ariaExpanded={shareOpen}
                    ariaControls="share-collapse"
                    onClick={() => setShareOpen((o) => !o)}
                  >
                    {shareOpen ? t('share.collapse') : t('share.expand')}
                  </Button>
                </InlineStack>
                <Collapsible open={shareOpen} id="share-collapse" transition={{ duration: '150ms' }}>
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">
                      {t('share.desc')}
                    </Text>
                    {shareUrl ? (
                  <BlockStack gap="200">
                    {prettyUrl ? (
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {t('share.socialLinkTitle')}
                        </Text>
                        <TextField
                          label={t('share.shortLinkLabel')}
                          labelHidden
                          value={prettyUrl}
                          readOnly
                          autoComplete="off"
                          connectedRight={
                            <Button
                              onClick={() =>
                                void navigator.clipboard
                                  .writeText(prettyUrl)
                                  .then(() => setToast(t('share.copied')))
                                  .catch(() => setToast(prettyUrl))
                              }
                            >
                              {t('share.copy')}
                            </Button>
                          }
                        />
                        <Text as="span" tone="subdued" variant="bodySm">
                          {t('share.manageHint')}
                        </Text>
                      </BlockStack>
                    ) : null}
                    {/* Link gốc /share/<token> ĐƯỢC ẨN — chỉ dùng link rút gọn ở trên để chia sẻ. */}
                    <InlineStack gap="200" wrap>
                      <Button url={prettyUrl || shareUrl} external variant="plain">
                        {t('share.open')}
                      </Button>
                      <Button tone="critical" variant="plain" loading={shareBusy} onClick={() => void disableShare()}>
                        {t('share.revoke')}
                      </Button>
                    </InlineStack>

                    {/* Bảo mật: công khai hoặc khóa bằng mật khẩu */}
                    <Box paddingBlockStart="200" borderColor="border" borderBlockStartWidth="025">
                      <BlockStack gap="200">
                        <InlineStack gap="150" blockAlign="center" wrap>
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            {t('share.security')}
                          </Text>
                          {report?.share?.locked ? (
                            <Badge tone="attention">{t('share.lockedBadge')}</Badge>
                          ) : (
                            <Badge tone="success">{t('share.publicBadge')}</Badge>
                          )}
                        </InlineStack>
                        <InlineStack gap="200" wrap blockAlign="end">
                          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                            <TextField
                              label={t('share.passwordLabel')}
                              labelHidden
                              type="password"
                              value={sharePw}
                              onChange={setSharePw}
                              autoComplete="off"
                              placeholder={
                                report?.share?.locked
                                  ? t('share.pwPlaceholderChange')
                                  : t('share.pwPlaceholderSet')
                              }
                            />
                          </div>
                          <Button
                            loading={sharePwBusy}
                            disabled={!sharePw.trim()}
                            onClick={() => void saveSharePassword(false)}
                          >
                            {report?.share?.locked ? t('share.changePassword') : t('share.lockWithPassword')}
                          </Button>
                          {report?.share?.locked ? (
                            <Button
                              variant="plain"
                              tone="critical"
                              loading={sharePwBusy}
                              onClick={() => void saveSharePassword(true)}
                            >
                              {t('share.unlock')}
                            </Button>
                          ) : null}
                        </InlineStack>
                        <Text as="span" tone="subdued" variant="bodySm">
                          {t('share.lockHint')}
                        </Text>
                      </BlockStack>
                    </Box>
                  </BlockStack>
                ) : (
                  <InlineStack>
                    <Button onClick={() => void enableShare()} loading={shareBusy}>
                      {t('share.create')}
                    </Button>
                  </InlineStack>
                )}

                {/* Ảnh bìa AI cho link chia sẻ (Open Graph) */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    {t('share.coverTitle')}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {t('share.coverDesc')}
                  </Text>
                  {/* Desktop: ảnh bên trái, cấu hình lấp bên phải (hết khoảng trống). Mobile: xếp dọc. */}
                  <InlineGrid columns={{ xs: 1, md: report?.shareCover ? '5fr 6fr' : 1 }} gap="400">
                    {report?.shareCover ? (
                      <BlockStack gap="200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={report.shareCover}
                          alt=""
                          style={{
                            width: '100%',
                            height: 'auto',
                            aspectRatio: '3 / 2',
                            objectFit: 'cover',
                            borderRadius: 8,
                            border: '1px solid #e3e7ee',
                            display: 'block',
                          }}
                        />
                        <InlineStack gap="200" wrap>
                          <Button variant="plain" onClick={() => setCoverPreview(true)}>
                            {t('share.coverView')}
                          </Button>
                          <Button variant="plain" tone="critical" loading={coverBusy} onClick={() => void removeCover()}>
                            {t('share.coverRemove')}
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    ) : null}
                    <BlockStack gap="300">
                      <TextField
                        label={t('share.coverPromptLabel')}
                        value={coverPrompt}
                        onChange={setCoverPrompt}
                        autoComplete="off"
                        multiline={report?.shareCover ? 4 : 2}
                        placeholder={t('share.coverPromptPlaceholder')}
                      />
                      <Checkbox label={t('share.coverUseSD')} checked={coverSD} onChange={setCoverSD} />
                      <ImageAiPicker
                        provider={coverProvider}
                        model={coverModel}
                        onChange={(p, m) => {
                          setCoverProvider(p);
                          setCoverModel(m);
                        }}
                      />
                      <InlineGrid columns={{ xs: 2 }} gap="200">
                        <Button variant="primary" fullWidth loading={coverBusy} onClick={() => void genCover()}>
                          {report?.shareCover ? t('share.coverRegenerate') : t('share.coverGenerate')}
                        </Button>
                        <Button fullWidth loading={coverBusy} onClick={() => coverFileRef.current?.click()}>
                          {t('share.coverUpload')}
                        </Button>
                      </InlineGrid>
                      <input
                        ref={coverFileRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          void uploadCover(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </BlockStack>
                  </InlineGrid>
                    </BlockStack>
                  </BlockStack>
                </Collapsible>
              </BlockStack>
            </Card>
            <Card>
              {/* Nội dung được escape toàn bộ trong buildSocialReportBody (không chèn HTML thô từ dữ liệu). */}
              <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </Card>
            {/* Gói FREE: phần phân tích sâu bị khóa (server không gửi nội dung) → thẻ nâng cấp. */}
            {gated.viewLocked ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    {t('locked.title')}
                  </Text>
                  <Text as="p" tone="subdued">
                    {t('locked.desc')}
                  </Text>
                  <InlineStack>
                    <Button url={`/${locale}/billing`} variant="primary">
                      {t('locked.cta')}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            ) : null}
          </>
        )}
      </BlockStack>

      <SocialAnalyzeModal
        open={analyzeOpen}
        onClose={() => setAnalyzeOpen(false)}
        onStart={(provider, model) => void startAnalysis(provider, model)}
      />

      {report ? (
        <SocialStyleModal
          open={styleOpen}
          onClose={() => setStyleOpen(false)}
          reportId={id}
          brand={report.title}
          style={report.style}
          onGenerated={(style) => setReport((r) => (r ? { ...r, style } : r))}
        />
      ) : null}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('deleteTitle')}
        primaryAction={{
          content: t('delete'),
          destructive: true,
          onAction: () => void remove(),
          loading: deleting,
        }}
        secondaryActions={[{ content: t('cancel'), onAction: () => setDeleteOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p">{t('deleteConfirm')}</Text>
        </Modal.Section>
      </Modal>

      {/* Xem ảnh bìa chia sẻ cỡ lớn */}
      {coverPreview && report?.shareCover ? (
        <Modal open onClose={() => setCoverPreview(false)} title={t('share.coverModalTitle')} size="large">
          <Modal.Section>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.shareCover}
              alt={t('share.coverModalTitle')}
              style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block' }}
            />
            <Box paddingBlockStart="300">
              <Text as="p" tone="subdued" variant="bodySm" breakWord>
                {report.shareCover}
              </Text>
            </Box>
          </Modal.Section>
        </Modal>
      ) : null}

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

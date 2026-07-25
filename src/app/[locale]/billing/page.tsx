'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  Icon,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  ProgressBar,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { CheckIcon } from '@shopify/polaris-icons';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  CYCLE_DISCOUNT,
  CYCLE_MONTHS,
  PLAN_ORDER,
  priceForMonths,
  type Plan,
  type PlanId,
} from '@/lib/billing/plans';
import { currencyCode } from '@/lib/i18n/currency';
import { SUB_STATUS_TONE, type SubStatus } from '@/lib/billing/order-ui';

// Đọc UTM từ URL, lưu localStorage để giữ khi điều hướng nội bộ. Trả object utm (có thể rỗng).
function readUtm(): Record<string, string> {
  try {
    const q = new URLSearchParams(window.location.search);
    const keys = ['source', 'medium', 'campaign', 'content', 'term'];
    const fromUrl: Record<string, string> = {};
    for (const k of keys) {
      const v = q.get(`utm_${k}`);
      if (v) fromUrl[k] = v.slice(0, 120);
    }
    if (Object.keys(fromUrl).length) {
      window.localStorage.setItem('utm', JSON.stringify(fromUrl));
      return fromUrl;
    }
    const saved = window.localStorage.getItem('utm');
    return saved ? (JSON.parse(saved) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

interface Me {
  planId: PlanId;
  plan?: Plan;
  sub: {
    status: string;
    trialEndsAt?: string;
    currentPeriodEnd?: string;
    billingCycle: string;
    overageArticles: number;
    unlimitedArticles?: boolean;
  } | null;
  quota: { articlesUsed: number; articlesCap: number; over: boolean } | null;
  lastPayment?: { paidAt?: string | null; plan?: string | null; months?: number | null; total: number; currency: string } | null;
  isSuperadmin: boolean;
}

export default function BillingPage() {
  const t = useTranslations('billing');
  const locale = useLocale();
  const [me, setMe] = useState<Me | null>(null);
  const isVnd = currencyCode(locale) === 'VND';
  // Bắt đầu = null (đang tải) → KHÔNG hiện giá mặc định có thể lệch với giá admin đã cấu hình.
  const [plans, setPlans] = useState<Record<PlanId, Plan> | null>(null);

  // ─── Tự phục vụ: chọn gói → tạo đơn → hiện QR Sepay ───
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null);
  const [months, setMonths] = useState<number>(1);
  const [coupon, setCoupon] = useState('');
  const [phone, setPhone] = useState('');
  const [utm, setUtm] = useState<Record<string, string>>({});
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [pay, setPay] = useState<{
    enabled: boolean;
    qrUrl?: string;
    content?: string;
    bankCode?: string;
    bankAccount?: string;
    accountHolder?: string;
    amount?: number;
    listPrice?: number;
    prorationCredit?: number;
  } | null>(null);

  function openCheckout(id: PlanId) {
    setCheckoutPlan(id);
    setMonths(1);
    setCoupon('');
    setPhone('');
    setPay(null);
    setOrderId(null);
    setPaid(false);
    setCheckoutErr(null);
  }
  function closeCheckout() {
    setCheckoutPlan(null);
    setPay(null);
    setOrderId(null);
    setPaid(false);
  }
  // Sau khi thanh toán thành công: đóng popup + TẢI LẠI cả trang /billing để hiển thị đúng gói mới.
  function finishSuccess() {
    if (typeof window !== 'undefined') window.location.reload();
  }
  async function doCheckout() {
    if (!checkoutPlan) return;
    setCheckoutBusy(true);
    setCheckoutErr(null);
    try {
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: checkoutPlan,
          months,
          couponCode: coupon.trim() || undefined,
          phone: phone.trim() || undefined,
          utm: Object.keys(utm).length ? utm : undefined,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setOrderId(d.order?.id ?? null);
        if (d.paid) {
          // Đơn 0đ (mã giảm 100%) tự kích hoạt → hiện màn hình thành công ngay.
          setPay({ enabled: false });
          setPaid(true);
          const me2 = await fetch('/api/billing/me');
          if (me2.ok) setMe(await me2.json());
        } else {
          setPay(d.pay);
          setPaid(false);
        }
      } else setCheckoutErr(d.error ?? t('checkoutErr'));
    } finally {
      setCheckoutBusy(false);
    }
  }

  // Trong lúc hiện QR: hỏi trạng thái đơn mỗi 4s. Khi đơn chuyển 'paid' (đã thanh toán / "paydone" -
  // webhook Sepay tự động HOẶC admin kích hoạt tay) → gói mới ĐÃ được kích hoạt cho biz ở server →
  // hiện popup thành công + làm mới gói hiện tại. Dừng poll khi đóng/đã trả.
  useEffect(() => {
    if (!checkoutPlan || !pay?.enabled || !orderId || paid) return;
    let active = true;
    const check = async () => {
      try {
        const r = await fetch(`/api/billing/order-status?id=${encodeURIComponent(orderId)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (active && d.paid) {
          setPaid(true);
          const me2 = await fetch('/api/billing/me');
          if (active && me2.ok) setMe(await me2.json());
        }
      } catch {
        /* bỏ qua lỗi mạng tạm thời, lần poll sau thử lại */
      }
    };
    const iv = setInterval(check, 4000);
    void check();
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [checkoutPlan, pay?.enabled, orderId, paid]);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/billing/me');
      if (res.ok) setMe(await res.json());
      const pr = await fetch('/api/billing/plans');
      // Chỉ đặt khi có dữ liệu thật; lỗi mạng → giữ trạng thái trước (không tụt về giá mặc định).
      if (pr.ok) {
        const pj = await pr.json().catch(() => null);
        if (pj?.plans) setPlans(pj.plans);
      }
    })();
  }, []);

  useEffect(() => {
    setUtm(readUtm());
  }, []);

  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const price = (p: Plan) => {
    if (p.id === 'free') return t('freePrice');
    if (p.id === 'enterprise') return t('contact');
    const v = isVnd ? p.priceVndMonthly : p.priceUsdMonthly;
    return isVnd ? `${nf.format(v)}đ` : `$${v}`;
  };
  const lim = (n: number) => (n >= 999999 ? '∞' : nf.format(n));
  const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
  };
  // 1 dòng "nhãn — giá trị" trong thẻ chi tiết gói.
  const detailRow = (label: string, value: string) => (
    <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
      <Text as="span" tone="subdued" variant="bodySm">
        {label}
      </Text>
      <Text as="span" variant="bodySm" fontWeight="medium">
        {value}
      </Text>
    </InlineStack>
  );

  const featureLines = (p: Plan) => {
    const f = p.features;
    return [
      t('feat.articles', { n: lim(p.articlesPerMonth) }),
      // Báo cáo Social: gói không bật đủ kênh → ghi rõ chỉ fanpage Facebook.
      f.socialAllChannels
        ? t('feat.socialReports', { n: lim(p.socialReportsPerMonth) })
        : t('feat.socialReportsFbOnly', { n: lim(p.socialReportsPerMonth) }),
      t('feat.seats', { n: lim(p.maxSeats) }),
      t('feat.biz', { n: lim(p.maxBiz) }),
      f.approval ? t('feat.approval') : null,
      f.brandVoice ? t('feat.brandVoice') : null,
      f.api ? t('feat.api') : null,
      f.factCheck ? t('feat.factCheck') : null,
      f.humanize ? t('feat.humanize') : null,
      f.whiteLabel ? t('feat.whiteLabel') : null,
    ].filter(Boolean) as string[];
  };

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="500">
        {/* Gói hiện tại + usage */}
        {me == null ? (
          <Box padding="400">
            <Spinner size="small" />
          </Box>
        ) : (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingSm">
                    {t('currentPlan')}:
                  </Text>
                  <Badge tone="success">{t(`plan.${me.planId}`)}</Badge>
                  {me.sub?.status === 'trialing' ? (
                    <Badge tone="attention">
                      {me.sub.trialEndsAt
                        ? t('trialEnds', { date: new Date(me.sub.trialEndsAt).toLocaleDateString() })
                        : t('trial')}
                    </Badge>
                  ) : null}
                </InlineStack>
                {me.isSuperadmin ? (
                  <Button url={`/${locale}/admin`} variant="plain">
                    {t('adminLink')}
                  </Button>
                ) : null}
              </InlineStack>

              {me.quota ? (
                <BlockStack gap="150">
                  <ProgressBar
                    progress={
                      me.quota.articlesCap < 0
                        ? 0
                        : Math.min(100, Math.round((me.quota.articlesUsed / Math.max(1, me.quota.articlesCap)) * 100))
                    }
                    tone={me.quota.over ? 'critical' : 'primary'}
                    size="small"
                  />
                  <Text as="span" variant="bodySm" tone={me.quota.over ? 'critical' : 'subdued'}>
                    {me.quota.articlesCap < 0
                      ? t('usageUnlimited', { used: nf.format(me.quota.articlesUsed) })
                      : t('usage', {
                          used: nf.format(me.quota.articlesUsed),
                          cap: nf.format(me.quota.articlesCap),
                        })}
                  </Text>
                </BlockStack>
              ) : null}
            </BlockStack>
          </Card>
        )}

        {/* Chi tiết gói cước hiện tại: trạng thái, chu kỳ, ngày thanh toán/hết hạn, tài nguyên. */}
        {me && me.sub ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                {t('detailsTitle')}
              </Text>
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {t('statusLabel')}
                    </Text>
                    <Badge tone={SUB_STATUS_TONE[me.sub.status as SubStatus]}>
                      {t(`status_${me.sub.status}`)}
                    </Badge>
                  </InlineStack>
                  {me.planId !== 'free' && me.planId !== 'enterprise'
                    ? detailRow(t('cycleLabel'), t(`cycle_${me.sub.billingCycle}`))
                    : null}
                  {me.lastPayment?.paidAt
                    ? detailRow(t('lastPaymentAt'), fmtDate(me.lastPayment.paidAt))
                    : null}
                  {detailRow(
                    t('expiresAt'),
                    me.planId === 'free' || me.planId === 'enterprise'
                      ? t('noExpiry')
                      : me.sub.status === 'trialing'
                        ? fmtDate(me.sub.trialEndsAt)
                        : fmtDate(me.sub.currentPeriodEnd),
                  )}
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingXs" tone="subdued">
                    {t('resourcesTitle')}
                  </Text>
                  {me.quota
                    ? detailRow(
                        t('resArticles'),
                        me.quota.articlesCap < 0
                          ? '∞'
                          : `${nf.format(me.quota.articlesUsed)} / ${nf.format(me.quota.articlesCap)}`,
                      )
                    : null}
                  {me.plan ? detailRow(t('resSocial'), lim(me.plan.socialReportsPerMonth)) : null}
                  {me.plan ? detailRow(t('resBiz'), lim(me.plan.maxBiz)) : null}
                  {me.plan ? detailRow(t('resSeats'), lim(me.plan.maxSeats)) : null}
                  {me.plan ? detailRow(t('resCms'), lim(me.plan.maxCmsConnections)) : null}
                  {me.sub.overageArticles > 0
                    ? detailRow(t('resOverage'), `+${nf.format(me.sub.overageArticles)}`)
                    : null}
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>
        ) : null}

        {/* Bảng gói - .plan-grid ép mỗi thẻ cao 100% để nút "Nâng cấp" ghim đáy & THẲNG HÀNG. */}
        {plans == null ? (
          <Box padding="400">
            <Spinner size="small" />
          </Box>
        ) : (
        <div className="plan-grid">
        <InlineGrid columns={{ xs: 1, sm: 2, lg: 5 }} gap="300">
          {(() => {
            // Gói hiện tại còn hiệu lực & ĐANG TRẢ PHÍ (active, không phải free) → ẨN nút nâng cấp ở các
            // gói THẤP hơn (không cho "hạ" khi còn hạn); nút chỉ hiện lại khi gói hết hạn (planId tụt về
            // free hoặc trạng thái khác 'active').
            const planRank = (pid: PlanId) => PLAN_ORDER.indexOf(pid);
            const currentPaidActive = me?.sub?.status === 'active' && me.planId !== 'free';
            const currentRank = me ? planRank(me.planId) : -1;
            return PLAN_ORDER.map((id) => {
            const p = plans[id];
            const current = me?.planId === id;
            const lowerLocked = currentPaidActive && planRank(id) < currentRank;
            // Thẻ tự dựng (không dùng Polaris Card) để kiểm soát chiều cao: flex-column + __foot
            // margin-top:auto → nút "Nâng cấp" luôn ghim đáy & THẲNG HÀNG.
            return (
              <div key={id} className={`plan-card${current ? ' plan-card--current' : ''}`}>
                <div className="plan-card__body">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      {t(`plan.${id}`)}
                    </Text>
                    <Text as="span" variant="headingLg">
                      {price(p)}
                      {id !== 'free' && id !== 'enterprise' ? (
                        <Text as="span" variant="bodySm" tone="subdued">
                          {' '}
                          {t('perMonth')}
                        </Text>
                      ) : null}
                    </Text>
                    {current ? <Badge tone="success">{t('yourPlan')}</Badge> : null}
                    <Divider />
                    <BlockStack gap="100">
                      {featureLines(p).map((line, i) => (
                        <Text as="span" variant="bodySm" key={i}>
                          • {line}
                        </Text>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </div>
                {(id === 'starter' || id === 'pro' || id === 'agency') && !current ? (
                  <div className="plan-card__foot">
                    {lowerLocked ? (
                      <Text as="span" variant="bodySm" tone="subdued" alignment="center">
                        {t('lowerPlanLocked')}
                      </Text>
                    ) : (
                      <Button variant="primary" fullWidth onClick={() => openCheckout(id)}>
                        {t('upgrade')}
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            );
            });
          })()}
        </InlineGrid>
        </div>
        )}

        {/* Modal thanh toán tự phục vụ: chọn chu kỳ/coupon → tạo đơn → QR Sepay + chuyển khoản. */}
        <Modal
          open={!!checkoutPlan}
          onClose={paid ? finishSuccess : closeCheckout}
          title={checkoutPlan ? t('checkoutTitle', { plan: t(`plan.${checkoutPlan}`) }) : ''}
          secondaryActions={[{ content: t('close'), onAction: paid ? finishSuccess : closeCheckout }]}
        >
          <Modal.Section>
            {checkoutErr ? (
              <Box paddingBlockEnd="300">
                <Banner tone="critical">{checkoutErr}</Banner>
              </Box>
            ) : null}
            {!pay ? (
              <BlockStack gap="300">
                {me?.sub?.status === 'active' && me.planId !== 'free' ? (
                  <Banner tone="info">{t('prorationHint')}</Banner>
                ) : null}
                <Select
                  label={t('cycleLabel')}
                  options={CYCLE_MONTHS.map((m) => {
                    const pr = priceForMonths(
                      checkoutPlan && plans ? plans[checkoutPlan].priceVndMonthly : 0,
                      m,
                    );
                    const off = Math.round((CYCLE_DISCOUNT[m] ?? 0) * 100);
                    return {
                      label: `${t('monthsLabel', { n: m })} · ${nf.format(pr)}đ${off ? ` · -${off}%` : ''}`,
                      value: String(m),
                    };
                  })}
                  value={String(months)}
                  onChange={(v) => setMonths(Number(v))}
                />
                <TextField
                  label={t('phoneLabel')}
                  type="tel"
                  value={phone}
                  onChange={setPhone}
                  autoComplete="off"
                  placeholder={t('phonePlaceholder')}
                />
                <TextField
                  label={t('couponLabel')}
                  value={coupon}
                  onChange={(v) => setCoupon(v.toUpperCase())}
                  autoComplete="off"
                  placeholder={t('couponPlaceholder')}
                />
                <Button variant="primary" loading={checkoutBusy} onClick={() => void doCheckout()}>
                  {t('createOrder')}
                </Button>
                <Text as="p" tone="subdued" variant="bodySm">
                  {t('checkoutHint')}
                </Text>
              </BlockStack>
            ) : paid ? (
              /* Đã nhận tiền (webhook Sepay) hoặc admin kích hoạt tay → báo thành công. */
              <Box paddingBlock="400">
                <BlockStack gap="400" inlineAlign="center">
                  {/* Icon SVG (Polaris) trong vòng tròn nền xanh — KHÔNG dùng emoji (theo UI guideline). */}
                  <span
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: '50%',
                      background: 'var(--p-color-bg-fill-success-secondary, #d7f0e0)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-hidden
                  >
                    <span style={{ display: 'inline-flex', transform: 'scale(1.9)' }}>
                      <Icon source={CheckIcon} tone="success" />
                    </span>
                  </span>
                  <BlockStack gap="150" inlineAlign="center">
                    <Text as="p" variant="headingLg" alignment="center">
                      {t('paySuccessTitle')}
                    </Text>
                    <Text as="p" tone="subdued" alignment="center">
                      {t('paySuccessBody')}
                    </Text>
                    {checkoutPlan ? (
                      <Badge tone="success">{t(`plan.${checkoutPlan}`)}</Badge>
                    ) : null}
                  </BlockStack>
                  <Button variant="primary" size="large" fullWidth onClick={finishSuccess}>
                    {t('paySuccessClose')}
                  </Button>
                </BlockStack>
              </Box>
            ) : pay.enabled ? (
              /* Căn CÂN ĐỐI & CHÍNH GIỮA: QR + thông tin chuyển khoản. */
              <BlockStack gap="300" inlineAlign="center">
                {pay.prorationCredit ? (
                  <Text as="span" tone="subdued" variant="bodySm" alignment="center">
                    <s>{(pay.listPrice ?? 0).toLocaleString('vi-VN')}đ</s>
                  </Text>
                ) : null}
                <Text as="p" variant="headingMd" alignment="center">
                  {t('payAmount', { amount: (pay.amount ?? 0).toLocaleString('vi-VN') })}
                </Text>
                {pay.prorationCredit ? (
                  <Text as="span" tone="success" variant="bodySm" alignment="center">
                    {t('prorationCredit', { amount: pay.prorationCredit.toLocaleString('vi-VN') })}
                  </Text>
                ) : null}
                {pay.qrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pay.qrUrl}
                    alt="QR"
                    style={{ width: 240, maxWidth: '100%', border: '1px solid #e1e1e1', borderRadius: 8 }}
                  />
                ) : null}
                <div style={{ textAlign: 'center' }}>
                  <BlockStack gap="100" inlineAlign="center">
                    <Text as="span" variant="bodySm">
                      {t('payBankLabel')}: <b>{pay.bankCode}</b>
                    </Text>
                    <Text as="span" variant="bodySm">
                      {t('payAccountLabel')}: <b>{pay.bankAccount}</b>
                    </Text>
                    <Text as="span" variant="bodySm">
                      {t('payHolderLabel')}: <b>{pay.accountHolder}</b>
                    </Text>
                    <Text as="span" variant="bodySm">
                      {t('payContentLabel')}: <b>{pay.content}</b>
                    </Text>
                  </BlockStack>
                </div>
                <Banner tone="info">{t('payInstruction')}</Banner>
                {/* Tự động: đang chờ nhận tiền, trang sẽ tự báo khi thành công (không cần tải lại). */}
                <InlineStack gap="150" blockAlign="center">
                  <Spinner size="small" />
                  <Text as="span" tone="subdued" variant="bodySm">
                    {t('payWaiting')}
                  </Text>
                </InlineStack>
              </BlockStack>
            ) : (
              <Banner tone="warning">{t('paymentDisabled')}</Banner>
            )}
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}

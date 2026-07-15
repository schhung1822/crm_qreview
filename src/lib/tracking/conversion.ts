// Gửi sự kiện MUA HÀNG lên Conversion API (server-to-server): NHIỀU pixel Facebook (Conversions
// API) + NHIỀU pixel TikTok (Events API 2.0) + GA4 (Measurement Protocol). Gọi khi đơn chuyển
// 'paid' (webhook Sepay HOẶC admin kích hoạt tay). Fire-and-forget: KHÔNG ném lỗi ra luồng thanh
// toán - chỉ log.
import { createHash } from 'node:crypto';
import { safeFetch } from '../security/safe-fetch';
import { getTrackingConfig, type FbPixel, type TrackingConfig, type TtPixel } from '../store/tracking-config';

const FB_API = 'https://graph.facebook.com/v19.0';
const TT_API = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const GA4_API = 'https://www.google-analytics.com/mp/collect';
const TIMEOUT = 10_000;

export interface PurchaseEvent {
  eventId: string; // = order.id → chống trùng với pixel client (dedup)
  email?: string;
  phone?: string;
  value: number;
  currency: string;
  contentId?: string; // gói (plan) hoặc mã sản phẩm
  clientId?: string; // GA4 client_id (nếu bắt được từ trình duyệt); không có thì suy ra từ eventId
  sourceUrl?: string;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const normEmail = (e?: string) => (e ? e.trim().toLowerCase() : '');
const normPhone = (p?: string) => (p ? p.replace(/[^\d]/g, '') : '');

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
}
export interface NamedResult extends SendResult {
  label: string;
}

// ── Facebook Conversions API (1 pixel) ─────────────────────────────────────────────────────────
async function sendFacebook(p: FbPixel, ev: PurchaseEvent): Promise<SendResult> {
  if (!p.enabled || !p.pixelId || !p.accessToken) return { ok: false, error: 'not-configured' };
  const email = normEmail(ev.email);
  const phone = normPhone(ev.phone);
  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_id: ev.eventId,
        ...(ev.sourceUrl ? { event_source_url: ev.sourceUrl } : {}),
        user_data: {
          ...(email ? { em: [sha256(email)] } : {}),
          ...(phone ? { ph: [sha256(phone)] } : {}),
        },
        custom_data: {
          currency: ev.currency,
          value: ev.value,
          order_id: ev.eventId,
          ...(ev.contentId ? { content_type: 'product', contents: [{ id: ev.contentId, quantity: 1 }] } : {}),
        },
      },
    ],
    ...(p.testCode ? { test_event_code: p.testCode } : {}),
  };
  try {
    const url = `${FB_API}/${encodeURIComponent(p.pixelId)}/events?access_token=${encodeURIComponent(p.accessToken)}`;
    const res = await safeFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT,
    });
    if (!res.ok) {
      const txt = (await res.text().catch(() => '')).slice(0, 300);
      return { ok: false, status: res.status, error: txt || `HTTP ${res.status}` };
    }
    await res.body?.cancel().catch(() => {});
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch error' };
  }
}

// ── TikTok Events API 2.0 (1 pixel) ────────────────────────────────────────────────────────────
async function sendTiktok(p: TtPixel, ev: PurchaseEvent): Promise<SendResult> {
  if (!p.enabled || !p.pixelCode || !p.accessToken) return { ok: false, error: 'not-configured' };
  const email = normEmail(ev.email);
  const phone = normPhone(ev.phone);
  const body = {
    event_source: 'web',
    event_source_id: p.pixelCode,
    ...(p.testCode ? { test_event_code: p.testCode } : {}),
    data: [
      {
        event: 'CompletePayment',
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        ...(ev.sourceUrl ? { page: { url: ev.sourceUrl } } : {}),
        user: {
          ...(email ? { email: sha256(email) } : {}),
          ...(phone ? { phone: sha256(phone) } : {}),
        },
        properties: {
          currency: ev.currency,
          value: ev.value,
          content_type: 'product',
          ...(ev.contentId ? { contents: [{ content_id: ev.contentId, price: ev.value, quantity: 1 }] } : {}),
        },
      },
    ],
  };
  try {
    const res = await safeFetch(TT_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Access-Token': p.accessToken },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT,
    });
    const json = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
    if (!res.ok || (json && typeof json.code === 'number' && json.code !== 0)) {
      return { ok: false, status: res.status, error: json?.message || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch error' };
  }
}

// ── GA4 Measurement Protocol ───────────────────────────────────────────────────────────────────
async function sendGa4(cfg: TrackingConfig, ev: PurchaseEvent): Promise<SendResult> {
  if (!cfg.ga4Enabled || !cfg.ga4MeasurementId || !cfg.ga4ApiSecret) return { ok: false, error: 'not-configured' };
  // client_id: dùng của trình duyệt nếu có; không thì suy ra ổn định từ eventId (không ghép được
  // session người dùng nhưng vẫn ghi nhận doanh thu chuyển đổi).
  const clientId = ev.clientId || `${parseInt(sha256(ev.eventId).slice(0, 8), 16)}.${Math.floor(Date.now() / 1000)}`;
  const body = {
    client_id: clientId,
    events: [
      {
        name: 'purchase',
        params: {
          currency: ev.currency,
          value: ev.value,
          transaction_id: ev.eventId,
          ...(ev.contentId ? { items: [{ item_id: ev.contentId, quantity: 1, price: ev.value }] } : {}),
        },
      },
    ],
  };
  try {
    const url = `${GA4_API}?measurement_id=${encodeURIComponent(cfg.ga4MeasurementId)}&api_secret=${encodeURIComponent(cfg.ga4ApiSecret)}`;
    const res = await safeFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT,
    });
    // GA4 MP trả 204 khi nhận (kể cả khi tham số sai - MP không báo lỗi chi tiết ở endpoint prod).
    await res.body?.cancel().catch(() => {});
    if (res.status !== 204 && !res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch error' };
  }
}

// Gửi tới TẤT CẢ pixel/kênh đang bật. Trả kết quả từng kênh (dùng cho nút "gửi test").
export async function sendPurchaseEvent(
  ev: PurchaseEvent,
): Promise<{ fb: NamedResult[]; tt: NamedResult[]; ga4: NamedResult }> {
  const cfg = await getTrackingConfig();
  const [fb, tt, ga4] = await Promise.all([
    Promise.all(cfg.fb.map(async (p) => ({ label: p.pixelId || p.id, ...(await sendFacebook(p, ev)) }))),
    Promise.all(cfg.tt.map(async (p) => ({ label: p.pixelCode || p.id, ...(await sendTiktok(p, ev)) }))),
    sendGa4(cfg, ev).then((r) => ({ label: cfg.ga4MeasurementId || 'GA4', ...r })),
  ]);
  return { fb, tt, ga4 };
}

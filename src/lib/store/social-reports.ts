// Kho Báo cáo Social - lưu file .data/biz/<bizId>/social-reports.json. CÔ LẬP THEO BIZ.
// Server-only. Báo cáo có thể nặng (bài đăng + transcript + phân tích) → danh sách
// quản lý chỉ trả bản tóm tắt; bản đầy đủ lấy theo id.
// V2 đa kênh: bản ghi V1 (1 fanpage, field data/step/pageUrl) được MIGRATE khi đọc.
import { randomBytes } from 'node:crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import type {
  SocialChannelKind,
  SocialPlatform,
  SocialReportOptions,
  SocialReportRecord,
  SocialReportSummary,
} from '../social/types';
import { buildPlan, emptyChannel, toSummary } from '../social/types';

const NAME = 'social-reports.json';
const MAX_REPORTS = 100; // vượt → tự cắt báo cáo cũ nhất (tránh file phình vô hạn)

// ── Migrate bản ghi V1 (trước khi có đa kênh) → V2 ──
interface LegacyV1 {
  id: string;
  pageUrl?: string;
  pageName?: string;
  locale?: string;
  status?: string;
  step?: string;
  error?: string;
  warnings?: string[];
  options?: SocialReportOptions;
  data?: {
    page?: SocialReportRecord['channels'][number]['page'];
    posts?: SocialReportRecord['channels'][number]['posts'];
    reels?: SocialReportRecord['channels'][number]['reels'];
    ads?: SocialReportRecord['channels'][number]['ads'];
    comments?: SocialReportRecord['channels'][number]['comments'];
  };
  metrics?: SocialReportRecord['metrics'];
  analysis?: SocialReportRecord['analysis'];
  ai?: SocialReportRecord['ai'];
  createdAt?: string;
  updatedAt?: string;
}

function migrate(raw: unknown): SocialReportRecord {
  const r = raw as SocialReportRecord & LegacyV1;
  if (Array.isArray(r.channels) && Array.isArray(r.plan)) return r; // đã là V2
  const options: SocialReportOptions = r.options ?? {
    postsLimit: 10,
    reelsLimit: 10,
    adsLimit: 10,
    commentsLimit: 30,
    includeReels: true,
    includeAds: true,
    includeComments: true,
  };
  const ch = emptyChannel('facebook', r.pageUrl ?? '');
  ch.page = r.data?.page;
  ch.posts = r.data?.posts ?? [];
  ch.reels = r.data?.reels ?? [];
  ch.ads = r.data?.ads ?? [];
  ch.comments = r.data?.comments ?? [];
  ch.metrics = r.metrics;
  const plan = buildPlan({ platform: 'facebook', channels: [{ kind: 'facebook' }], options });
  // Bản ghi cũ đang chạy dở không map được sang plan mới → dừng với thông báo rõ.
  const wasMidRun = r.status === 'running';
  const status = wasMidRun ? 'error' : ((r.status ?? 'error') as SocialReportRecord['status']);
  return {
    id: r.id,
    platform: 'facebook',
    title: r.pageName ?? r.pageUrl ?? r.id,
    locale: r.locale ?? 'vi',
    status,
    plan,
    stepIndex: status === 'done' ? plan.length : plan.findIndex((s) => s.action === 'analyzeBrand'),
    ai: r.ai,
    error: wasMidRun
      ? 'Báo cáo tạo ở phiên bản cũ bị dừng giữa chừng - hãy tạo báo cáo mới.'
      : r.error,
    warnings: r.warnings ?? [],
    options,
    channels: [ch],
    metrics: r.metrics,
    analysis: r.analysis ?? {},
    createdAt: r.createdAt ?? new Date().toISOString(),
    updatedAt: r.updatedAt ?? new Date().toISOString(),
  };
}

async function readAll(): Promise<SocialReportRecord[]> {
  const rows = await readJson<unknown[]>(bizFile(NAME), []);
  return rows.map(migrate);
}

function genId(): string {
  return 'sr_' + randomBytes(9).toString('hex');
}

export async function listSocialReports(): Promise<SocialReportSummary[]> {
  const rows = await readAll();
  return rows.map(toSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSocialReport(id: string): Promise<SocialReportRecord | null> {
  return (await readAll()).find((r) => r.id === id) ?? null;
}

export interface CreateSocialReportInput {
  platform: SocialPlatform;
  locale: string;
  options: SocialReportOptions;
  channels: Array<{ kind: SocialChannelKind; url: string }>;
  keyword?: string;
  title?: string; // tên tự đặt (tuỳ chọn) - giữ nguyên, không bị ghi đè khi thu thập
}

export async function createSocialReport(input: CreateSocialReportInput): Promise<SocialReportRecord> {
  const now = new Date().toISOString();
  const customTitle = !!input.title?.trim();
  const title = customTitle
    ? input.title!.trim()
    : input.platform === 'overall' || input.platform === 'ecom'
      ? (input.keyword?.trim() || input.channels.map((c) => c.kind).join(' + '))
      : input.channels[0]?.url || input.keyword?.trim() || input.platform; // taobao theo TÊN: url rỗng → tạm dùng keyword
  const record: SocialReportRecord = {
    id: genId(),
    platform: input.platform,
    title,
    customTitle: customTitle || undefined,
    keyword: input.keyword?.trim() || undefined,
    locale: input.locale,
    status: 'running',
    plan: buildPlan(input),
    stepIndex: 0,
    warnings: [],
    options: input.options,
    channels: input.channels.map((c) => emptyChannel(c.kind, c.url)),
    analysis: {},
    createdAt: now,
    updatedAt: now,
  };
  return mutateJson<unknown[], SocialReportRecord>(bizFile(NAME), [], (rows) => {
    const next = [...rows, record].slice(-MAX_REPORTS);
    return [next, record];
  });
}

// Cập nhật báo cáo bằng mutator (đọc-sửa-ghi dưới khóa file → an toàn khi poll song song).
export async function updateSocialReport(
  id: string,
  fn: (r: SocialReportRecord) => void,
): Promise<SocialReportRecord | null> {
  return mutateJson<unknown[], SocialReportRecord | null>(bizFile(NAME), [], (rows) => {
    const idx = rows.findIndex((x) => (x as { id?: string }).id === id);
    if (idx === -1) return [rows, null];
    const row = migrate(rows[idx]);
    fn(row);
    row.updatedAt = new Date().toISOString();
    rows[idx] = row;
    return [rows, row];
  });
}

export async function deleteSocialReport(id: string): Promise<boolean> {
  return mutateJson<unknown[], boolean>(bizFile(NAME), [], (rows) => {
    const next = rows.filter((r) => (r as { id?: string }).id !== id);
    return [next, next.length !== rows.length];
  });
}

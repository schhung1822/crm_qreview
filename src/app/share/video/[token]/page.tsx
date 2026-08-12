// Trang CÔNG KHAI hiển thị PHÂN TÍCH KỊCH BẢN qua link chia sẻ — bài blog CHỈ-XEM, các mục THU GỌN
// (bấm để mở, dùng <details> HTML gốc). Ngoài [locale] → không redirect login, không AppFrame.
// Tuân thủ gói CHỦ: mất quyền videoScriptAnalysis → khóa nội dung. noindex để không lộ token.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ShareGate } from '@/components/ShareGate';
import { runWithBiz } from '@/lib/biz/context';
import { locales } from '@/i18n/config';
import { GATE, pickGateLocale } from '@/lib/share/gate-strings';
import { resolveScriptOgFields } from '@/lib/script-analysis/share-og';
import type { ScriptAnalysisRecord } from '@/lib/script-analysis/types';
import { videoEmbed } from '@/lib/script-analysis/embed';
import { getScriptAnalysis } from '@/lib/store/script-analyses';
import { checkShareAccess, resolveShare, shareAccessCookieName } from '@/lib/store/script-shares';
import { getBranding } from '@/lib/store/branding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN_RE = /^[a-f0-9]{64}$/;

// Metadata động → dán link chia sẻ vào Facebook/Zalo/Slack hiện Tiêu đề + Mô tả + Ảnh bìa.
// GIỮ noindex (token bí mật). Khóa → không lộ tóm tắt ra thẻ mô tả.
export async function generateMetadata(
  props: {
    params: Promise<{ token: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const noindex = { index: false, follow: false } as const;
  if (!TOKEN_RE.test(params.token)) return { robots: noindex };
  const s = await resolveShare(params.token);
  if (!s) return { robots: noindex };
  const rec = await runWithBiz({ userId: s.ownerId, bizId: s.bizId }, () => getScriptAnalysis(s.analysisId));
  if (!rec || rec.status !== 'done' || !rec.analysis) return { robots: noindex };
  const b = await getBranding();
  const { title, description, image } = resolveScriptOgFields(rec, b);
  const desc = s.locked ? GATE[pickGateLocale(rec.locale)].metaLocked : description;
  const images = image ? [image] : undefined;
  return {
    title,
    description: desc,
    robots: noindex,
    openGraph: { title, description: desc, type: 'article', siteName: b.sourceText || undefined, images },
    twitter: { card: 'summary_large_image', title, description: desc, images },
  };
}
type Labels = Record<string, string>;

const UI: Record<string, { viewOnly: string; unavailable: string }> = {
  vi: { viewOnly: 'Chỉ xem', unavailable: 'Nội dung này hiện không khả dụng.' },
  en: { viewOnly: 'View only', unavailable: 'This content is currently unavailable.' },
  zh: { viewOnly: '仅查看', unavailable: '此内容当前不可用。' },
  ja: { viewOnly: '閲覧のみ', unavailable: 'このコンテンツは現在利用できません。' },
  ko: { viewOnly: '보기 전용', unavailable: '이 콘텐츠는 현재 사용할 수 없습니다.' },
  fr: { viewOnly: 'Lecture seule', unavailable: 'Ce contenu est actuellement indisponible.' },
  de: { viewOnly: 'Nur ansehen', unavailable: 'Dieser Inhalt ist derzeit nicht verfügbar.' },
  id: { viewOnly: 'Hanya lihat', unavailable: 'Konten ini saat ini tidak tersedia.' },
  hi: { viewOnly: 'केवल देखें', unavailable: 'यह सामग्री फ़िलहाल उपलब्ध नहीं है।' },
  th: { viewOnly: 'ดูอย่างเดียว', unavailable: 'เนื้อหานี้ยังไม่พร้อมใช้งานในขณะนี้' },
};
const PLATFORM_LABEL: Record<string, string> = { tiktok: 'TIKTOK', youtube: 'YOUTUBE', facebook: 'FACEBOOK' };

function localeKey(loc: string): string {
  return (locales as readonly string[]).includes(loc) ? loc : 'vi';
}

async function loadLabels(locale: string): Promise<Labels> {
  const safe = localeKey(locale);
  try {
    const m = (await import(`@/messages/${safe}.json`)) as { default?: unknown };
    const root = (m.default ?? m) as { scriptAnalysis?: Record<string, string> };
    return root.scriptAnalysis ?? {};
  } catch {
    return {};
  }
}

async function load(
  token: string,
): Promise<{ rec: ScriptAnalysisRecord; available: boolean; locked: boolean } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const s = await resolveShare(token);
  if (!s) return null;
  const rec = await runWithBiz({ userId: s.ownerId, bizId: s.bizId }, () => getScriptAnalysis(s.analysisId));
  if (!rec || rec.status !== 'done' || !rec.analysis) return null;
  // Tuân thủ gói CHỦ: mất quyền → ẩn nội dung (không lộ kết quả của gói trả phí).
  return { rec, available: true, locked: s.locked };
}

const CSS = `
.va{font-family:var(--font-inter),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f6f9;min-height:100vh;padding:24px 16px 64px;color:#1a1f2b;-webkit-font-smoothing:antialiased;}
.va-wrap{max-width:820px;margin:0 auto;background:#fff;border:1px solid #e3e7ee;border-radius:14px;padding:28px 32px 40px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
.va-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;}
.va-logo{height:26px;width:auto;}
.va-badge{font-size:12px;font-weight:600;color:#0061ff;background:#e7effe;padding:4px 10px;border-radius:20px;white-space:nowrap;}
.va-plat{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;color:#5b6675;background:#eef1f5;padding:3px 8px;border-radius:5px;margin-bottom:8px;}
.va-title{font-size:24px;line-height:1.28;margin:0 0 4px;font-weight:700;letter-spacing:-.01em;text-wrap:balance;}
.va-author{font-size:13px;color:#7a8493;margin:0 0 16px;}
.va-stats{display:flex;flex-wrap:wrap;gap:22px;padding:14px 16px;background:#f7f9fc;border:1px solid #eaeef4;border-radius:10px;margin:0 0 20px;}
.va-stat b{display:block;font-size:19px;font-weight:700;line-height:1.1;}
.va-stat span{font-size:12px;color:#7a8493;}
.va-sum{font-size:15.5px;line-height:1.65;margin:0 0 12px;}
.va-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px;}
.va-chip{font-size:12px;color:#3a4453;background:#eef1f5;padding:3px 10px;border-radius:20px;}
.va details{border-top:1px solid #eef1f5;padding:2px 0;}
.va details>summary{list-style:none;cursor:pointer;padding:13px 2px;font-weight:650;font-size:15px;display:flex;align-items:center;justify-content:space-between;}
.va details>summary::-webkit-details-marker{display:none;}
.va details>summary::after{content:"+";color:#9aa5b4;font-weight:400;font-size:20px;line-height:1;}
.va details[open]>summary::after{content:"–";}
.va-secbody{padding:2px 2px 16px;font-size:14.5px;line-height:1.65;color:#333b47;}
.va-secbody p{margin:0 0 8px;}
.va-secbody ul{margin:0;padding-left:20px;}
.va-secbody li{margin-bottom:5px;}
.va-hook{font-weight:600;}
.va-tlwrap{display:flex;gap:22px;align-items:flex-start;}
.va-tllist{flex:1 1 0;min-width:0;}
.va-embed{flex:none;width:min(280px,44%);position:sticky;top:16px;}
.va-embed.wide{width:min(420px,54%);}
.va-embed__box{position:relative;width:100%;background:#000;border-radius:10px;overflow:hidden;border:1px solid #e3e7ee;}
.va-embed__box iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}
@media(max-width:640px){.va-tlwrap{flex-direction:column;}.va-embed,.va-embed.wide{width:100%;position:static;}}
.va-tl{display:flex;gap:14px;align-items:flex-start;padding:6px 0;border-bottom:1px dashed #eef1f5;}
.va-tl b{flex:none;min-width:86px;font-variant-numeric:tabular-nums;font-size:13px;}
.va-ts{white-space:pre-wrap;color:#5b6675;font-size:13.5px;line-height:1.6;}
.va-foot{margin-top:28px;padding-top:16px;border-top:1px solid #eef1f5;font-size:13px;}
.va-foot a{color:#5b6675;text-decoration:none;}
.va-foot a:hover{text-decoration:underline;}
.va-note{font-size:14px;color:#8a6d00;background:#fff7e0;border:1px solid #f0e0a8;padding:12px 14px;border-radius:8px;}
@media (max-width:640px){.va-wrap{padding:20px 16px 32px;}.va-title{font-size:21px;}}
`;

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details>
      <summary>{title}</summary>
      <div className="va-secbody">{children}</div>
    </details>
  );
}

export default async function VideoSharePage(
  props: {
    params: Promise<{ token: string }>;
    searchParams?: Promise<{ e?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const data = await load(params.token);
  if (!data) notFound();
  const { rec, available, locked } = data;

  // KHÓA bằng mật khẩu: chưa mở khóa (cookie hợp lệ) → hiện màn nhập, KHÔNG dựng nội dung.
  if (locked && !checkShareAccess(params.token, (await cookies()).get(shareAccessCookieName(params.token))?.value)) {
    return (
      <ShareGate
        locale={rec.locale}
        action={`/api/share/video/${params.token}/unlock`}
        err={searchParams?.e === '1'}
        rate={searchParams?.e === 'rate'}
      />
    );
  }

  const b = await getBranding();
  const ui = UI[localeKey(rec.locale)] ?? UI.vi;

  const header = (
    <header className="va-head">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="va-logo" src={b.logoDuongBan} alt={b.sourceText} />
      <span className="va-badge">{ui.viewOnly}</span>
    </header>
  );

  if (!available) {
    return (
      <main className="va">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="va-wrap">
          {header}
          <p className="va-note">{ui.unavailable}</p>
        </div>
      </main>
    );
  }

  const L = await loadLabels(rec.locale);
  const a = rec.analysis!;
  const m = rec.metrics;
  const emb = videoEmbed(rec.url, rec.platform); // video nhúng cạnh timeline (null nếu không suy được)
  const fmt = (n: number) =>
    new Intl.NumberFormat(localeKey(rec.locale), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const stat = (label: string, v?: number) =>
    v === undefined ? null : (
      <div className="va-stat" key={label}>
        <b>{fmt(v)}</b>
        <span>{label}</span>
      </div>
    );

  return (
    <main className="va">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="va-wrap">
        {header}
        <span className="va-plat">{PLATFORM_LABEL[rec.platform] ?? rec.platform}</span>
        <h1 className="va-title">{rec.title || rec.url}</h1>
        {m?.author ? <p className="va-author">{m.author}</p> : null}

        {m && [m.views, m.likes, m.comments, m.shares, m.saves].some((v) => v !== undefined) ? (
          <div className="va-stats">
            {stat(L.statViews ?? 'Views', m.views)}
            {stat(L.statLikes ?? 'Likes', m.likes)}
            {stat(L.statComments ?? 'Comments', m.comments)}
            {stat(L.statShares ?? 'Shares', m.shares)}
            {stat(L.statSaves ?? 'Saves', m.saves)}
          </div>
        ) : null}

        {a.summary ? <p className="va-sum">{a.summary}</p> : null}
        <div className="va-chips">
          {a.contentType ? <span className="va-chip">{a.contentType}</span> : null}
          {a.tone ? <span className="va-chip">{`${L.tone ?? 'Tone'}: ${a.tone}`}</span> : null}
          {a.pacing ? <span className="va-chip">{`${L.pacing ?? 'Pacing'}: ${a.pacing}`}</span> : null}
          {a.targetAudience ? <span className="va-chip">{a.targetAudience}</span> : null}
        </div>

        <div>
          {a.hookText ? (
            <Sec title={L.hook ?? 'Hook'}>
              <p className="va-hook">“{a.hookText}”</p>
              {a.hookWhy ? <p>{a.hookWhy}</p> : null}
            </Sec>
          ) : null}
          {a.intro ? <Sec title={L.intro ?? 'Intro'}><p>{a.intro}</p></Sec> : null}
          {a.formula ? <Sec title={L.formula ?? 'Formula'}><p>{a.formula}</p></Sec> : null}
          {a.timeline.length ? (
            <Sec title={L.timeline ?? 'Timeline'}>
              {/* [timeline] [video nhúng] — người xem có thể xem video ngay khi đọc bóc tách. */}
              <div className="va-tlwrap">
                <div className="va-tllist">
                  {a.timeline.map((s, i) => (
                    <div className="va-tl" key={i}>
                      <b>{s.from}{s.to ? `–${s.to}` : ''}</b>
                      <div>
                        <div>{s.segment}</div>
                        {s.purpose ? <div style={{ color: '#7a8493', fontSize: 13 }}>{s.purpose}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
                {emb ? (
                  <div className={`va-embed${emb.ratio === '16 / 9' ? ' wide' : ''}`}>
                    <div className="va-embed__box" style={{ aspectRatio: emb.ratio }}>
                      <iframe
                        src={emb.src}
                        title={rec.title || 'Video'}
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                        allowFullScreen
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </Sec>
          ) : null}
          {a.successReasons.length ? (
            <Sec title={L.successReasons ?? 'Why it works'}><ul>{a.successReasons.map((x, i) => <li key={i}>{x}</li>)}</ul></Sec>
          ) : null}
          {a.strengths.length ? (
            <Sec title={L.strengths ?? 'Strengths'}><ul>{a.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></Sec>
          ) : null}
          {a.improvements.length ? (
            <Sec title={L.improvements ?? 'Improvements'}><ul>{a.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul></Sec>
          ) : null}
          {a.takeaways.length ? (
            <Sec title={L.takeaways ?? 'Takeaways'}><ul>{a.takeaways.map((x, i) => <li key={i}>{x}</li>)}</ul></Sec>
          ) : null}
          {a.cta ? <Sec title={L.cta ?? 'CTA'}><p>{a.cta}</p></Sec> : null}
          {rec.transcript ? (
            <Sec title={L.showTranscript ?? 'Transcript'}><p className="va-ts">{rec.transcript}</p></Sec>
          ) : null}
        </div>

        <footer className="va-foot">
          <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer">{b.sourceText}</a>
        </footer>
      </div>
    </main>
  );
}

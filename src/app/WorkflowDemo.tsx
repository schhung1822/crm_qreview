'use client';

// Demo "nền tảng đang làm việc" trên trang chủ: tự chạy qua 5 giai đoạn của quy trình
// (Phân tích → Kế hoạch → Viết & tối ưu → Đi link → Đăng & báo cáo). Mỗi giai đoạn render một
// mini-UI thật, có animation vào. Tự chứa 10 ngôn ngữ (trang ngoài [locale]). Tôn trọng
// prefers-reduced-motion (không tự chạy, hiện tĩnh). Màu ăn theo --lp-accent* của trang chủ.
import { useEffect, useState, type CSSProperties } from 'react';
import type { Locale } from '@/i18n/config';

interface Stage {
  name: string;
  caption: string;
}
interface DemoStrings {
  heading: string;
  sub: string;
  live: string;
  replay: string;
  stages: Stage[];
  lbl: { engagement: string; keywords: string; score: string; related: string; published: string; share: string };
}

// vi + en đầy đủ; 8 ngôn ngữ còn lại nạp bên dưới (fallback en nếu thiếu).
const DEMO_STRINGS: Partial<Record<Locale, DemoStrings>> = {
  vi: {
    heading: 'Xem nền tảng làm việc',
    sub: 'Từ phân tích đến bài đăng — tự động trong một luồng.',
    live: 'Đang chạy',
    replay: 'Chạy lại',
    stages: [
      { name: 'Phân tích', caption: 'AI mổ xẻ social & shop sàn TMĐT' },
      { name: 'Lên kế hoạch', caption: 'Cụm từ khóa thành kế hoạch nội dung' },
      { name: 'Viết & tối ưu', caption: 'AI viết, chấm điểm SEO · AEO · GEO' },
      { name: 'Đi link', caption: 'Nối bài liên quan: internal + backlink' },
      { name: 'Đăng & báo cáo', caption: 'Xuất bản đa kênh, tạo link chia sẻ' },
    ],
    lbl: { engagement: 'Tương tác', keywords: 'Từ khóa', score: 'Điểm', related: 'Bài liên quan', published: 'Đã đăng', share: 'Link chia sẻ' },
  },
  en: {
    heading: 'Watch the platform work',
    sub: 'From analysis to published post — automated in one flow.',
    live: 'Live',
    replay: 'Replay',
    stages: [
      { name: 'Analyze', caption: 'AI dissects social & e-commerce shops' },
      { name: 'Plan', caption: 'Keyword clusters into a content plan' },
      { name: 'Write & optimize', caption: 'AI writes, scores SEO · AEO · GEO' },
      { name: 'Interlink', caption: 'Connect related posts: internal + backlinks' },
      { name: 'Publish & report', caption: 'Publish multi-channel, create share link' },
    ],
    lbl: { engagement: 'Engagement', keywords: 'Keywords', score: 'Score', related: 'Related posts', published: 'Published', share: 'Share link' },
  },
};

Object.assign(DEMO_STRINGS, {
  zh: {
    heading: '看平台如何运作',
    sub: '从分析到发布，一条流程全自动。',
    live: '运行中',
    replay: '重播',
    stages: [
      { name: '分析', caption: 'AI 解析社媒与电商店铺' },
      { name: '规划', caption: '关键词聚类生成内容计划' },
      { name: '撰写优化', caption: 'AI 撰写并评分 SEO · AEO · GEO' },
      { name: '内链外链', caption: '关联文章：internal link + backlink' },
      { name: '发布报告', caption: '多渠道发布，生成分享链接' },
    ],
    lbl: { engagement: '互动', keywords: '关键词', score: '评分', related: '相关文章', published: '已发布', share: '分享链接' },
  },
  ja: {
    heading: 'プラットフォームの動きを見る',
    sub: '分析から公開まで、ひとつの流れで自動化。',
    live: '稼働中',
    replay: '再生',
    stages: [
      { name: '分析', caption: 'AIがSNS・ECショップを解析' },
      { name: '計画', caption: 'キーワード群からコンテンツ計画へ' },
      { name: '作成・最適化', caption: 'AIが執筆しSEO · AEO · GEOを採点' },
      { name: 'リンク設計', caption: '関連記事を接続：internal link + backlink' },
      { name: '公開・レポート', caption: 'マルチチャネル公開、共有リンク作成' },
    ],
    lbl: { engagement: 'エンゲージメント', keywords: 'キーワード', score: 'スコア', related: '関連記事', published: '公開済み', share: '共有リンク' },
  },
  ko: {
    heading: '플랫폼 작동 보기',
    sub: '분석부터 발행까지, 하나의 흐름으로 자동화.',
    live: '실행 중',
    replay: '다시 재생',
    stages: [
      { name: '분석', caption: 'AI가 소셜·이커머스 샵 분석' },
      { name: '기획', caption: '키워드 클러스터로 콘텐츠 계획 수립' },
      { name: '작성·최적화', caption: 'AI 작성, SEO · AEO · GEO 점수화' },
      { name: '링크 연결', caption: '관련 글 연결: internal link + backlink' },
      { name: '발행·리포트', caption: '멀티채널 발행, 공유 링크 생성' },
    ],
    lbl: { engagement: '참여', keywords: '키워드', score: '점수', related: '관련 글', published: '발행됨', share: '공유 링크' },
  },
  fr: {
    heading: 'Voir la plateforme en action',
    sub: "De l'analyse à la publication, tout automatisé en un flux.",
    live: 'En direct',
    replay: 'Relancer',
    stages: [
      { name: 'Analyser', caption: "L'IA décortique réseaux sociaux et boutiques e-commerce" },
      { name: 'Planifier', caption: 'Grappes de mots-clés en plan de contenu' },
      { name: 'Rédiger & optimiser', caption: "L'IA rédige et note SEO · AEO · GEO" },
      { name: 'Maillage', caption: 'Relier les articles : internal link + backlink' },
      { name: 'Publier & analyser', caption: 'Publication multicanal, lien de partage' },
    ],
    lbl: { engagement: 'Engagement', keywords: 'Mots-clés', score: 'Score', related: 'Articles liés', published: 'Publié', share: 'Lien de partage' },
  },
  de: {
    heading: 'Die Plattform in Aktion',
    sub: 'Von der Analyse bis zum Beitrag, automatisiert in einem Flow.',
    live: 'Live',
    replay: 'Erneut abspielen',
    stages: [
      { name: 'Analysieren', caption: 'KI seziert Social Media und E-Commerce-Shops' },
      { name: 'Planen', caption: 'Keyword-Cluster werden zum Content-Plan' },
      { name: 'Schreiben & optimieren', caption: 'KI schreibt, bewertet SEO · AEO · GEO' },
      { name: 'Verlinken', caption: 'Verwandte Beiträge verbinden: internal link + backlink' },
      { name: 'Veröffentlichen & Report', caption: 'Multichannel veröffentlichen, Share-Link erstellen' },
    ],
    lbl: { engagement: 'Interaktion', keywords: 'Keywords', score: 'Score', related: 'Verwandte Beiträge', published: 'Veröffentlicht', share: 'Share-Link' },
  },
  id: {
    heading: 'Lihat platform bekerja',
    sub: 'Dari analisis hingga tayang, otomatis dalam satu alur.',
    live: 'Berjalan',
    replay: 'Putar ulang',
    stages: [
      { name: 'Analisis', caption: 'AI membedah social & toko e-commerce' },
      { name: 'Rencana', caption: 'Klaster kata kunci jadi rencana konten' },
      { name: 'Tulis & optimalkan', caption: 'AI menulis, menilai SEO · AEO · GEO' },
      { name: 'Tautkan', caption: 'Hubungkan artikel terkait: internal link + backlink' },
      { name: 'Terbit & laporan', caption: 'Terbit multikanal, buat link berbagi' },
    ],
    lbl: { engagement: 'Interaksi', keywords: 'Kata kunci', score: 'Skor', related: 'Artikel terkait', published: 'Terbit', share: 'Link berbagi' },
  },
  hi: {
    heading: 'प्लेटफ़ॉर्म को काम करते देखें',
    sub: 'विश्लेषण से पब्लिश तक, एक ही फ़्लो में ऑटोमेटेड।',
    live: 'लाइव',
    replay: 'फिर चलाएँ',
    stages: [
      { name: 'विश्लेषण', caption: 'AI सोशल और e-commerce शॉप खंगालता है' },
      { name: 'योजना', caption: 'कीवर्ड क्लस्टर से कंटेंट प्लान' },
      { name: 'लिखें और ऑप्टिमाइज़', caption: 'AI लिखे, SEO · AEO · GEO स्कोर करे' },
      { name: 'लिंकिंग', caption: 'संबंधित पोस्ट जोड़ें: internal link + backlink' },
      { name: 'पब्लिश और रिपोर्ट', caption: 'मल्टी-चैनल पब्लिश, शेयर लिंक बनाएँ' },
    ],
    lbl: { engagement: 'एंगेजमेंट', keywords: 'कीवर्ड', score: 'स्कोर', related: 'संबंधित पोस्ट', published: 'पब्लिश हुआ', share: 'शेयर लिंक' },
  },
  th: {
    heading: 'ดูแพลตฟอร์มทำงาน',
    sub: 'ตั้งแต่วิเคราะห์จนถึงเผยแพร่ อัตโนมัติในโฟลว์เดียว',
    live: 'กำลังทำงาน',
    replay: 'เล่นซ้ำ',
    stages: [
      { name: 'วิเคราะห์', caption: 'AI เจาะโซเชียลและร้าน e-commerce' },
      { name: 'วางแผน', caption: 'จัดกลุ่มคีย์เวิร์ดเป็นแผนคอนเทนต์' },
      { name: 'เขียนและปรับแต่ง', caption: 'AI เขียนและให้คะแนน SEO · AEO · GEO' },
      { name: 'เชื่อมลิงก์', caption: 'เชื่อมบทความ: internal link + backlink' },
      { name: 'เผยแพร่และรายงาน', caption: 'เผยแพร่หลายช่อง สร้างลิงก์แชร์' },
    ],
    lbl: { engagement: 'การมีส่วนร่วม', keywords: 'คีย์เวิร์ด', score: 'คะแนน', related: 'บทความที่เกี่ยวข้อง', published: 'เผยแพร่แล้ว', share: 'ลิงก์แชร์' },
  },
} satisfies Record<string, DemoStrings>);

const STAGE_COUNT = 5;
const STAGE_MS = 3000;

export function WorkflowDemo({ locale }: { locale: Locale }) {
  const t = DEMO_STRINGS[locale] ?? DEMO_STRINGS.en!;
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReady(true);
    if (reduced) {
      setPlaying(false);
      setStage(2);
    }
  }, []);

  useEffect(() => {
    if (!playing || !ready) return;
    const id = window.setInterval(() => setStage((s) => (s + 1) % STAGE_COUNT), STAGE_MS);
    return () => window.clearInterval(id);
  }, [playing, ready]);

  function jump(i: number) {
    setStage(i);
    setPlaying(false);
  }
  function replay() {
    setStage(0);
    setPlaying(true);
  }

  return (
    <div
      className="wd"
      onMouseEnter={() => setPlaying(false)}
      onMouseLeave={() => setPlaying(true)}
      role="group"
      aria-label={t.heading}
    >
      <div className="wd__glow" aria-hidden="true" />
      <div className="wd__head">
        <span className={`wd__live${playing ? ' is-on' : ''}`}>
          <i aria-hidden="true" />
          {playing ? t.live : t.replay}
        </span>
        <span className="wd__title">{t.heading}</span>
        <button type="button" className="wd__replay" onClick={replay} aria-label={t.replay}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path
              d="M4 12a8 8 0 1 0 2.5-5.8M6 3v4h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="wd__body">
        <div className="wd__rail" role="tablist" aria-label={t.heading}>
          {t.stages.map((st, i) => {
            const done = i < stage;
            const active = i === stage;
            return (
              <button
                type="button"
                key={i}
                className={`wd__step${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
                onClick={() => jump(i)}
                role="tab"
                aria-selected={active}
              >
                <span className="wd__step-dot" aria-hidden="true">
                  {done ? (
                    <svg viewBox="0 0 24 24" width="13" height="13">
                      <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="wd__step-txt">
                  <strong>{st.name}</strong>
                  <span>{st.caption}</span>
                </span>
                {active && playing ? <span className="wd__step-prog" style={{ animationDuration: `${STAGE_MS}ms` }} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        <div className="wd__stage" key={stage}>
          <StageView stage={stage} t={t} />
        </div>
      </div>
    </div>
  );
}

function StageView({ stage, t }: { stage: number; t: DemoStrings }) {
  if (stage === 0) return <StageAnalyze t={t} />;
  if (stage === 1) return <StagePlan t={t} />;
  if (stage === 2) return <StageWrite t={t} />;
  if (stage === 3) return <StageLink t={t} />;
  return <StagePublish t={t} />;
}

// 0 — Phân tích: quét các nền tảng, thanh tương tác chạy lên.
function StageAnalyze({ t }: { t: DemoStrings }) {
  const rows = [
    { k: 'Facebook', v: '8.4k', w: 82 },
    { k: 'TikTok', v: '21.7k', w: 96 },
    { k: 'Shopee', v: '3.1k', w: 54 },
    { k: 'YouTube', v: '5.9k', w: 68 },
  ];
  return (
    <div className="wd-panel wd-in">
      <div className="wd-win__bar" aria-hidden="true">
        <span className="wd-dot wd-dot--r" />
        <span className="wd-dot wd-dot--y" />
        <span className="wd-dot wd-dot--g" />
        <span className="wd-win__title">social · shop</span>
        <span className="wd-badge">{t.lbl.engagement}</span>
      </div>
      <div className="wd-metrics">
        {rows.map((r, i) => (
          <div className="wd-metric" key={r.k} style={{ '--d': `${i * 0.1}s` } as CSSProperties}>
            <span className="wd-metric__k">{r.k}</span>
            <span className="wd-metric__track">
              <span className="wd-metric__fill" style={{ '--w': `${r.w}%` } as CSSProperties} />
            </span>
            <span className="wd-metric__v">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 1 — Kế hoạch: cụm từ khóa → danh sách kế hoạch.
function StagePlan({ t }: { t: DemoStrings }) {
  const kws = ['seo cho ai', 'geo optimization', 'ai overviews', 'answer engine'];
  const items = ['Trụ: SEO vs AEO vs GEO', 'Cách được ChatGPT trích dẫn', 'Checklist tối ưu GEO 2026'];
  return (
    <div className="wd-panel wd-in">
      <span className="wd-eyebrow">{t.lbl.keywords}</span>
      <div className="wd-kw">
        {kws.map((k, i) => (
          <span className="wd-kw__chip" key={k} style={{ '--d': `${i * 0.08}s` } as CSSProperties}>
            {k}
          </span>
        ))}
      </div>
      <div className="wd-flowdown" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M12 4v14m0 0l5-5m-5 5l-5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <ul className="wd-plan">
        {items.map((it, i) => (
          <li className="wd-plan__item" key={it} style={{ '--d': `${0.25 + i * 0.12}s` } as CSSProperties}>
            <span className="wd-plan__check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="12" height="12">
                <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

// 2 — Viết & tối ưu: dòng bài "gõ" ra + 3 vòng điểm SEO/AEO/GEO.
function StageWrite({ t }: { t: DemoStrings }) {
  const lines = [92, 78, 96, 64, 88, 40];
  const rings = [
    { k: 'SEO', v: 94, o: 9.8 },
    { k: 'AEO', v: 90, o: 16.3 },
    { k: 'GEO', v: 96, o: 6.5 },
  ];
  return (
    <div className="wd-panel wd-in wd-write">
      <div className="wd-doc">
        <span className="wd-doc__h" />
        {lines.map((w, i) => (
          <span className="wd-doc__line" key={i} style={{ '--w': `${w}%`, '--d': `${i * 0.09}s` } as CSSProperties} />
        ))}
      </div>
      <div className="wd-rings">
        <span className="wd-rings__lbl">{t.lbl.score}</span>
        {rings.map((r, i) => (
          <div className="wd-ring" key={r.k} style={{ '--d': `${0.2 + i * 0.15}s` } as CSSProperties}>
            <svg viewBox="0 0 60 60" width="58" height="58">
              <circle className="wd-ring__bg" cx="30" cy="30" r="26" />
              <circle className="wd-ring__val" cx="30" cy="30" r="26" style={{ '--o': r.o } as CSSProperties} />
            </svg>
            <span className="wd-ring__num">{r.v}</span>
            <span className="wd-ring__k">{r.k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3 — Đi link: đồ thị liên kết các bài liên quan (nút hiện, cạnh vẽ dần).
function StageLink({ t }: { t: DemoStrings }) {
  const nodes = [
    { x: 130, y: 44, r: 15, main: true },
    { x: 44, y: 96, r: 11 },
    { x: 216, y: 90, r: 11 },
    { x: 92, y: 156, r: 10 },
    { x: 186, y: 160, r: 10 },
  ];
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 3],
    [2, 4],
  ];
  return (
    <div className="wd-panel wd-in wd-linkwrap">
      <span className="wd-eyebrow">{t.lbl.related}</span>
      <svg className="wd-graph" viewBox="0 0 260 200" role="img" aria-hidden="true">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            className="wd-graph__edge"
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            style={{ '--d': `${0.15 + i * 0.12}s` } as CSSProperties}
          />
        ))}
        {nodes.map((n, i) => (
          <g key={i} className={`wd-graph__node${n.main ? ' is-main' : ''}`} style={{ '--d': `${i * 0.1}s` } as CSSProperties}>
            <circle cx={n.x} cy={n.y} r={n.r} />
          </g>
        ))}
      </svg>
    </div>
  );
}

// 4 — Đăng & báo cáo: bài đã đăng + kênh + link chia sẻ.
function StagePublish({ t }: { t: DemoStrings }) {
  const channels = ['WordPress', 'Wix', 'Shopify'];
  return (
    <div className="wd-panel wd-in">
      <div className="wd-pub">
        <div className="wd-pub__doc">
          <span className="wd-pub__title" />
          <span className="wd-pub__line" style={{ '--w': '90%' } as CSSProperties} />
          <span className="wd-pub__line" style={{ '--w': '72%' } as CSSProperties} />
          <span className="wd-pub__ok">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.lbl.published}
          </span>
        </div>
        <div className="wd-chan">
          {channels.map((c, i) => (
            <span className="wd-chan__chip" key={c} style={{ '--d': `${0.15 + i * 0.1}s` } as CSSProperties}>
              <span className="wd-chan__dot" aria-hidden="true" />
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="wd-share">
        <span className="wd-share__k">{t.lbl.share}</span>
        <span className="wd-share__url">/share/r/8f2c…</span>
        <span className="wd-share__copy" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <rect x="8.5" y="8.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </span>
      </div>
    </div>
  );
}

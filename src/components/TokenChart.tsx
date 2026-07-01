'use client';

// Biểu đồ token theo thời gian: MỖI NGÀY 2 cột - token vào & token ra. Trục X = thời gian,
// trục Y = số token. Trỏ/chạm vào 1 cột → tooltip (nằm trong khung, không bị che) hiện
// ngày, loại cột, và AI/model nào dùng bao nhiêu. Có đường xu hướng (tổng). SVG+CSS thuần.
import { Text } from '@shopify/polaris';
import { useState } from 'react';

interface SeriesItem {
  provider: string;
  model: string;
  inTokens: number;
  outTokens: number;
}
export interface SeriesDay {
  date: string;
  inTokens: number;
  outTokens: number;
  items: SeriesItem[];
}

const IN_COLOR = '#5b3ce0'; // tím - token vào
const OUT_COLOR = '#00b8a9'; // teal - token ra
const TREND_COLOR = '#c0530f'; // cam đậm - xu hướng (tổng)
const PLOT_H = 200; // chiều cao vùng vẽ (px)
const Y_W = 50; // bề rộng cột nhãn trục Y (px)

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
};

function linreg(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += values[i]; sxy += i * values[i]; sxx += i * i;
  }
  const d = n * sxx - sx * sx;
  if (d === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / d;
  return { slope, intercept: (sy - slope * sx) / n };
}

// Rút gọn số cho nhãn trục: 1.5K, 2.3M…
function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(v));
}

export function TokenChart({
  series,
  locale,
  labels,
}: {
  series: SeriesDay[];
  locale: string;
  labels: { tokenIn: string; tokenOut: string; trend: string; empty: string };
}) {
  const [hover, setHover] = useState<{ i: number; kind: 'in' | 'out' } | null>(null);
  const n = series.length;
  const totals = series.map((d) => d.inTokens + d.outTokens);
  // Trục Y theo TỔNG ngày để cả 2 cột lẫn đường xu hướng (tổng) cùng vừa khung.
  const max = Math.max(1, ...totals);
  const hasData = totals.some((v) => v > 0);

  const fmt = (v: number) => v.toLocaleString(locale);
  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
    } catch {
      return d;
    }
  };

  if (!hasData) {
    return (
      <Text as="p" tone="subdued" variant="bodySm">
        {labels.empty}
      </Text>
    );
  }

  const { slope, intercept } = linreg(totals);
  const trendPath = series
    .map((_, i) => {
      const y = Math.min(max, Math.max(0, slope * i + intercept));
      return `${(((i + 0.5) / n) * 100).toFixed(2)},${(100 - (y / max) * 100).toFixed(2)}`;
    })
    .join(' ');

  const ticks = [0, 1, 2, 3, 4]; // 5 mức trục Y

  return (
    <div>
      {/* Chú giải */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        <Legend color={IN_COLOR} label={labels.tokenIn} />
        <Legend color={OUT_COLOR} label={labels.tokenOut} />
        <Legend color={TREND_COLOR} label={labels.trend} dashed />
      </div>

      <div style={{ overflowX: 'auto' }}>
        {/* Bề rộng tối thiểu co giãn theo số ngày để cột không bị bóp khi khoảng dài */}
        <div style={{ minWidth: Math.max(440, n * 22 + Y_W) }}>
          {/* Hàng: nhãn trục Y + vùng vẽ */}
          <div style={{ display: 'flex' }}>
            {/* Trục Y */}
            <div style={{ width: Y_W, position: 'relative', height: PLOT_H, flex: 'none' }}>
              {ticks.map((t) => (
                <div
                  key={t}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: `${(t / 4) * 100}%`,
                    transform: 'translateY(-50%)',
                    fontSize: 10,
                    color: 'var(--p-color-text-subdued)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {compact((max * (4 - t)) / 4)}
                </div>
              ))}
            </div>

            {/* Vùng vẽ */}
            <div style={{ flex: 1, position: 'relative', height: PLOT_H }}>
              {/* Lưới ngang */}
              {ticks.map((t) => (
                <div
                  key={t}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: `${(t / 4) * 100}%`,
                    borderTop: '1px solid #ededed',
                  }}
                />
              ))}

              {/* Cột: mỗi ngày 1 nhóm gồm cột vào + cột ra */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 3,
                }}
              >
                {series.map((d, i) => {
                  const dim = hover != null && hover.i !== i;
                  return (
                    <div
                      key={d.date}
                      style={{
                        flex: 1,
                        height: '100%',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        gap: 2,
                        opacity: dim ? 0.5 : 1,
                        transition: 'opacity 0.15s',
                        minWidth: 0,
                      }}
                    >
                      <Bar
                        h={(d.inTokens / max) * 100}
                        color={IN_COLOR}
                        active={hover?.i === i && hover.kind === 'in'}
                        show={d.inTokens > 0}
                        onHover={(on) => setHover(on ? { i, kind: 'in' } : null)}
                      />
                      <Bar
                        h={(d.outTokens / max) * 100}
                        color={OUT_COLOR}
                        active={hover?.i === i && hover.kind === 'out'}
                        show={d.outTokens > 0}
                        onHover={(on) => setHover(on ? { i, kind: 'out' } : null)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Đường xu hướng (tổng) */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              >
                <polyline
                  points={trendPath}
                  fill="none"
                  stroke={TREND_COLOR}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                />
              </svg>

              {/* Tooltip - đặt TRONG vùng vẽ nên không bị che; canh ngang theo cột, chống tràn */}
              {hover != null
                ? (() => {
                    const d = series[hover.i];
                    const kindIn = hover.kind === 'in';
                    const items = d.items
                      .filter((it) => (kindIn ? it.inTokens : it.outTokens) > 0)
                      .sort((a, b) => (kindIn ? b.inTokens - a.inTokens : b.outTokens - a.outTokens));
                    const posPct = ((hover.i + 0.5) / n) * 100;
                    const tx = posPct < 25 ? '-8%' : posPct > 75 ? '-92%' : '-50%';
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          top: 4,
                          left: `${posPct}%`,
                          transform: `translateX(${tx})`,
                          // Tự rộng theo nội dung để tên model KHÔNG xuống dòng (dễ nhìn).
                          width: 'max-content',
                          maxWidth: 'min(92vw, 520px)',
                          maxHeight: PLOT_H - 16,
                          overflowY: 'auto',
                          background: '#1a1a1a',
                          color: '#fff',
                          borderRadius: 8,
                          padding: '8px 12px',
                          fontSize: 12,
                          lineHeight: 1.5,
                          whiteSpace: 'nowrap',
                          boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
                          zIndex: 5,
                          pointerEvents: 'none',
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 4, whiteSpace: 'nowrap' }}>
                          {fmtDate(d.date)} ·{' '}
                          <span style={{ color: kindIn ? '#b9aaff' : '#7fe9df' }}>
                            {kindIn ? labels.tokenIn : labels.tokenOut}
                          </span>{' '}
                          {fmt(kindIn ? d.inTokens : d.outTokens)}
                        </div>
                        {items.length ? (
                          items.map((it, k) => (
                            <div
                              key={k}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 18,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span style={{ opacity: 0.9 }}>
                                {PROVIDER_LABEL[it.provider] ?? it.provider} · {it.model}
                              </span>
                              <span style={{ fontWeight: 600 }}>{fmt(kindIn ? it.inTokens : it.outTokens)}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ opacity: 0.7 }}>-</div>
                        )}
                      </div>
                    );
                  })()
                : null}
            </div>
          </div>

          {/* Trục X: nhãn ngày, canh thẳng cột (chừa đúng bề rộng trục Y) */}
          <div style={{ display: 'flex', marginTop: 6 }}>
            <div style={{ width: Y_W, flex: 'none' }} />
            <div style={{ flex: 1, display: 'flex', gap: 3 }}>
              {series.map((d, i) => (
                <div
                  key={d.date}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: 10,
                    color: 'var(--p-color-text-subdued)',
                    minWidth: 0,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {i % Math.max(1, Math.ceil(n / 12)) === 0 ? fmtDate(d.date) : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({
  h,
  color,
  active,
  show,
  onHover,
}: {
  h: number;
  color: string;
  active: boolean;
  show: boolean;
  onHover: (on: boolean) => void;
}) {
  if (!show) return <div style={{ width: '42%' }} />;
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={() => onHover(!active)}
      style={{
        width: '42%',
        height: `${h}%`,
        minHeight: 2,
        background: color,
        borderRadius: '3px 3px 0 0',
        cursor: 'pointer',
        outline: active ? '2px solid rgba(0,0,0,0.35)' : undefined,
        outlineOffset: -1,
      }}
    />
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 16,
          height: dashed ? 0 : 10,
          borderRadius: dashed ? 0 : 3,
          background: dashed ? 'transparent' : color,
          borderTop: dashed ? `2px dashed ${color}` : undefined,
          display: 'inline-block',
        }}
      />
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
    </span>
  );
}

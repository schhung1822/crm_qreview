'use client';

// Bộ biểu đồ SVG nhẹ (KHÔNG thêm thư viện) cho tab Tổng quan. Responsive qua viewBox (scale theo
// bề rộng, giữ tỷ lệ). Tông màu trung tính + accent, hợp Polaris.
import { Box, InlineStack, Text } from '@shopify/polaris';
import { useState } from 'react';

export const CHART_COLORS = ['#2b6cb0', '#2f9e8f', '#b7791f', '#805ad5', '#c05621', '#2f855a', '#c53030', '#4a5568'];

const fmtNum = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n));
// Rút gọn cho nhãn trục Oy (1.2K, 3.4M) để không chật.
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

// ─── Biểu đồ đường/vùng theo thời gian (1-2 chuỗi) ───
export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}
// DD/MM từ YYYY-MM-DD (nhãn trục thời gian gọn).
const shortDate = (iso: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);

export function LineAreaChart({ dates, series, height = 200, emptyLabel = '—' }: { dates: string[]; series: LineSeries[]; height?: number; emptyLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 680;
  const H = height;
  const ML = 46; // lề trái cho nhãn trục Oy
  const MR = 12;
  const padT = 10;
  const padB = 22; // chỗ cho nhãn trục Ox (thời gian)
  const plotW = W - ML - MR;
  const plotH = H - padT - padB;
  const n = dates.length;
  const rawMax = Math.max(1, ...series.flatMap((s) => s.values));
  // Làm tròn max lên "đẹp" để nhãn Oy gọn.
  const max = niceMax(rawMax);
  const x = (i: number) => ML + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - v / max) * plotH;

  const linePath = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaPath = (vals: number[]) => `${linePath(vals)} L${x(n - 1)},${H - padB} L${ML},${H - padB} Z`;

  const empty = series.every((s) => s.values.every((v) => v === 0));
  const yTicks = 4;
  const yVals = Array.from({ length: yTicks + 1 }, (_, k) => (max * k) / yTicks);
  // Mốc trục Ox: tối đa 6 ngày đều nhau.
  const tickCount = Math.min(6, Math.max(2, n));
  const xTickIdx = [...new Set(n <= 1 ? [0] : Array.from({ length: tickCount }, (_, k) => Math.round((k * (n - 1)) / (tickCount - 1))))];

  const pctL = (px: number) => `${(px / W) * 100}%`;
  const pctT = (py: number) => `${(py / H) * 100}%`;

  return (
    <Box>
      <InlineStack gap="300" wrap>
        {series.map((s) => (
          <InlineStack key={s.name} gap="100" blockAlign="center">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            <Text as="span" variant="bodySm" tone="subdued">{s.name}: {fmtNum(s.values.reduce((a, b) => a + b, 0))}</Text>
          </InlineStack>
        ))}
      </InlineStack>

      <div style={{ position: 'relative', marginTop: 6 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Trục Oy: đường kẻ ngang + nhãn số */}
          {yVals.map((v, k) => (
            <line key={`gy${k}`} x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke={k === 0 ? '#d7dbe0' : '#f2f4f7'} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {/* Trục Ox: kẻ dọc tại mốc thời gian */}
          {xTickIdx.map((i) => (
            <line key={`gx${i}`} x1={x(i)} y1={padT} x2={x(i)} y2={H - padB} stroke="#f6f7f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {/* Đường dọc chỉ vị trí hover */}
          {hover != null && !empty ? (
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="#b6bcc4" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ) : null}
          {!empty && series.map((s) => (
            <g key={s.name}>
              <path d={areaPath(s.values)} fill={s.color} opacity={series.length > 2 ? 0.06 : 0.1} />
              <path d={linePath(s.values)} fill="none" stroke={s.color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
              {hover != null ? <circle cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="3" fill="#fff" stroke={s.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /> : null}
            </g>
          ))}
          {empty && <text x={ML + plotW / 2} y={H / 2} textAnchor="middle" fill="#8a95a3" fontSize="12">{emptyLabel}</text>}
        </svg>

        {/* Nhãn trục Oy (HTML, luôn rõ nét) */}
        {yVals.map((v, k) => (
          <span key={`yl${k}`} style={{ position: 'absolute', left: 0, top: pctT(y(v)), transform: 'translateY(-50%)', width: `${(ML - 6) / W * 100}%`, textAlign: 'right', fontSize: 10.5, color: '#8a95a3', fontVariantNumeric: 'tabular-nums' }}>
            {compact(v)}
          </span>
        ))}

        {/* Lớp phủ bắt hover: N cột trên vùng vẽ */}
        {!empty ? (
          <div
            style={{ position: 'absolute', left: pctL(ML), right: pctL(MR), top: 0, bottom: pctT(padB), display: 'flex' }}
            onMouseLeave={() => setHover(null)}
          >
            {dates.map((_, i) => (
              <div key={i} style={{ flex: 1 }} onMouseEnter={() => setHover(i)} />
            ))}
          </div>
        ) : null}

        {/* Tooltip khi hover */}
        {hover != null && !empty ? (
          <div
            style={{
              position: 'absolute', left: pctL(x(hover)), top: 4,
              transform: hover > n / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
              background: '#1c2530', color: '#fff', borderRadius: 6, padding: '6px 8px', fontSize: 11.5,
              pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,.25)', zIndex: 2,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{dates[hover]}</div>
            {series.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                <span>{s.name}: {fmtNum(s.values[hover] ?? 0)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Nhãn TRỤC Ox (thời gian) */}
      <div style={{ position: 'relative', height: 14 }}>
        {xTickIdx.map((i) => {
          const leftPx = x(i);
          const transform = i === 0 ? 'translateX(0)' : i === n - 1 ? 'translateX(-100%)' : 'translateX(-50%)';
          return (
            <span key={`t${i}`} style={{ position: 'absolute', left: pctL(leftPx), transform, fontSize: 10.5, color: '#8a95a3', whiteSpace: 'nowrap' }}>
              {shortDate(dates[i])}
            </span>
          );
        })}
      </div>
    </Box>
  );
}

// Làm tròn giá trị lớn nhất lên mốc "đẹp" (1,2,5 × 10^k) để trục Oy chia đều đẹp.
function niceMax(v: number): number {
  if (v <= 1) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

// ─── Danh sách thanh ngang (categorical) ───
export interface BarItem {
  label: string;
  value: number;
  sub?: string; // dòng phụ bên phải (vd chi phí)
  color?: string;
}
export function BarList({ items, unit = '', emptyLabel = '—' }: { items: BarItem[]; unit?: string; emptyLabel?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <Text as="p" tone="subdued" variant="bodySm">{emptyLabel}</Text>;
  return (
    <Box>
      {items.map((it, idx) => (
        <div key={it.label + idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
          <div style={{ width: '38%', minWidth: 90, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</div>
          <div style={{ flex: 1, background: '#eef1f5', borderRadius: 4, height: 14, position: 'relative' }}>
            <div style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? CHART_COLORS[idx % CHART_COLORS.length], height: '100%', borderRadius: 4, minWidth: it.value > 0 ? 2 : 0 }} />
          </div>
          <div style={{ width: 96, textAlign: 'right', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
            {fmtNum(it.value)}{unit}{it.sub ? <span style={{ color: '#8a95a3' }}> · {it.sub}</span> : null}
          </div>
        </div>
      ))}
    </Box>
  );
}

// ─── Donut phân bố ───
export interface DonutSeg {
  label: string;
  value: number;
  color: string;
}
export function Donut({ segments, centerLabel, centerValue }: { segments: DonutSeg[]; centerLabel?: string; centerValue?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <InlineStack gap="400" blockAlign="center" wrap>
      <svg viewBox="0 0 140 140" style={{ width: 140, height: 140, flex: 'none' }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef1f5" strokeWidth="16" />
        {total > 0 && segments.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={s.label} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="20" fontWeight="600" fill="#14181f">{centerValue ?? fmtNum(total)}</text>
        {centerLabel ? <text x="70" y="84" textAnchor="middle" fontSize="10" fill="#8a95a3">{centerLabel}</text> : null}
      </svg>
      <Box>
        {segments.map((s) => (
          <InlineStack key={s.label} gap="100" blockAlign="center">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            <Text as="span" variant="bodySm">{s.label}: {fmtNum(s.value)}{total > 0 ? ` (${Math.round((s.value / total) * 100)}%)` : ''}</Text>
          </InlineStack>
        ))}
      </Box>
    </InlineStack>
  );
}

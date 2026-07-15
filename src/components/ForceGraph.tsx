'use client';

// Đồ thị liên kết bài viết: 3 chế độ — Vòng tròn (SVG cũ), 2D & 3D lực (canvas, Obsidian-style).
// Có toàn màn hình. Kích thước điểm theo SỐ KẾT NỐI (degree = link vào + ra): nhiều → to, ít → nhỏ.
import { BlockStack, Button, ButtonGroup, InlineStack, Text } from '@shopify/polaris';
import { MaximizeIcon, MinimizeIcon } from '@shopify/polaris-icons';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface FGNode {
  id: string;
  title: string;
  url?: string;
  inLinks: number;
  outLinks: number;
}
export interface FGData {
  nodes: FGNode[];
  edges: Array<{ from: string; to: string }>;
}

// Bán kính điểm theo degree (căn bậc hai cho dải mượt): ít kết nối nhỏ, nhiều kết nối to.
function nodeR(deg: number) {
  return Math.min(18, 3 + 2.6 * Math.sqrt(deg));
}

// Thang màu theo SỐ KẾT NỐI: ít → xanh dương, vừa → xanh ngọc (màu hiệu ứng AI), nhiều → đỏ-cam.
function heatColor(frac: number): string {
  const stops = [
    [43, 140, 255], // #2b8cff xanh dương (hiệu ứng AI)
    [0, 194, 184], // #00c2b8 xanh ngọc (hiệu ứng AI)
    [255, 92, 92], // #ff5c5c đỏ-cam (hub nổi bật)
  ];
  const f = Math.max(0, Math.min(1, frac));
  const seg = f >= 0.5 ? 1 : 0;
  const lt = seg === 0 ? f / 0.5 : (f - 0.5) / 0.5;
  const a = stops[seg];
  const b = stops[seg + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * lt)},${Math.round(a[1] + (b[1] - a[1]) * lt)},${Math.round(a[2] + (b[2] - a[2]) * lt)})`;
}
function nodeColor(frac: number, isolated: boolean) {
  return isolated ? '#b6bcd0' : heatColor(frac);
}

interface SimNode extends FGNode {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  deg: number;
}

// Chú thích màu: dải màu = số kết nối (theo maxDeg thực), kèm chấm xám cho bài cô lập (0).
function Legend({ maxDeg }: { maxDeg: number }) {
  const t = useTranslations('optimize');
  const mid = Math.max(1, Math.round(maxDeg / 2));
  return (
    <InlineStack gap="300" blockAlign="center" wrap>
      <Text as="span" variant="bodySm" tone="subdued">
        {t('graphLegend')}
      </Text>
      {maxDeg >= 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div
            style={{
              width: 170,
              height: 10,
              borderRadius: 6,
              background: 'linear-gradient(90deg, #2b8cff 0%, #00c2b8 50%, #ff5c5c 100%)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 170, fontSize: 11, color: '#6b7280' }}>
            <span>1</span>
            <span>{mid}</span>
            <span>{maxDeg}</span>
          </div>
        </div>
      ) : null}
      <InlineStack gap="100" blockAlign="center">
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#b6bcd0', display: 'inline-block' }} />
        <Text as="span" variant="bodySm" tone="subdued">
          0 · {t('graphIsolated')}
        </Text>
      </InlineStack>
    </InlineStack>
  );
}

// ─────────────────────────── Wrapper: chọn chế độ + toàn màn hình ───────────────────────────
export function GraphView({ graph, onOpenNode }: { graph: FGData; onOpenNode?: (id: string) => void }) {
  const t = useTranslations('optimize');
  const [mode, setMode] = useState<'circle' | '2d' | '3d'>('circle'); // "Mặc định" = vòng tròn
  const [full, setFull] = useState(false);
  const maxDeg = Math.max(0, ...graph.nodes.map((n) => n.inLinks + n.outLinks));

  // Esc để thoát toàn màn hình.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  const controls = (
    <InlineStack align="space-between" blockAlign="center" wrap gap="300">
      <InlineStack gap="400" blockAlign="center" wrap>
        <ButtonGroup variant="segmented">
          <Button pressed={mode === 'circle'} onClick={() => setMode('circle')}>
            {t('graphModeCircle')}
          </Button>
          <Button pressed={mode === '2d'} onClick={() => setMode('2d')}>
            2D
          </Button>
          <Button pressed={mode === '3d'} onClick={() => setMode('3d')}>
            3D
          </Button>
        </ButtonGroup>
        <Legend maxDeg={maxDeg} />
      </InlineStack>
      <Button
        icon={full ? MinimizeIcon : MaximizeIcon}
        onClick={() => setFull((f) => !f)}
        accessibilityLabel={full ? t('graphExitFull') : t('graphFull')}
      >
        {full ? t('graphExitFull') : t('graphFull')}
      </Button>
    </InlineStack>
  );

  const body =
    mode === 'circle' ? (
      <CircleGraph graph={graph} full={full} onOpenNode={onOpenNode} />
    ) : (
      <ForceCanvas graph={graph} mode={mode} full={full} onOpenNode={onOpenNode} />
    );

  if (full && typeof document !== 'undefined') {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: '#eef1f8', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 14px', background: '#ffffff', borderBottom: '1px solid #e1e4ee' }}>{controls}</div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{body}</div>
      </div>,
      document.body,
    );
  }
  return (
    <BlockStack gap="300">
      {controls}
      {/* Canvas 2D/3D cần chiều cao cố định để đo; vòng tròn (SVG vuông) để tự co theo nội dung. */}
      <div style={{ height: mode === 'circle' ? 'auto' : 540 }}>{body}</div>
    </BlockStack>
  );
}

// ─────────────────────────── Vòng tròn (SVG, giữ như cũ) ───────────────────────────
function CircleGraph({ graph, full, onOpenNode }: { graph: FGData; full: boolean; onOpenNode?: (id: string) => void }) {
  const t = useTranslations('optimize');
  const [hover, setHover] = useState<string | null>(null);
  const N = graph.nodes.length;
  const size = 640;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 70;
  const showLabel = N <= 48;
  const maxDeg = Math.max(1, ...graph.nodes.map((n) => n.inLinks + n.outLinks));

  const pos = new Map<string, { x: number; y: number; a: number }>();
  graph.nodes.forEach((n, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, N) - Math.PI / 2;
    pos.set(n.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a });
  });

  const neighbors = new Set<string>();
  if (hover) {
    neighbors.add(hover);
    for (const e of graph.edges) {
      if (e.from === hover) neighbors.add(e.to);
      if (e.to === hover) neighbors.add(e.from);
    }
  }

  const hovered = hover ? graph.nodes.find((n) => n.id === hover) : null;
  const hp = hover ? pos.get(hover) : null;
  const title = hovered ? (hovered.title.length > 42 ? hovered.title.slice(0, 42) + '…' : hovered.title) : '';
  const meta = hovered ? t('graphTipLinks', { inn: hovered.inLinks, out: hovered.outLinks }) : '';
  const tipW = Math.min(320, Math.max(140, Math.max(title.length, meta.length) * 6.3 + 22));
  const tipH = 46;
  let tipX = hp ? hp.x - tipW / 2 : 0;
  tipX = Math.max(6, Math.min(size - tipW - 6, tipX));
  const baseR = hovered ? nodeR(hovered.inLinks + hovered.outLinks) : 0;
  const above = hp ? hp.y - (baseR + 12) - tipH >= 6 : true;
  const tipY = hp ? (above ? hp.y - (baseR + 12) - tipH : hp.y + baseR + 12) : 0;

  return (
    <div
      style={{
        width: '100%',
        height: full ? '100%' : 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
      }}
    >
      <style>{`@keyframes optTipIn{from{opacity:0}to{opacity:1}}`}</style>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: '100%', maxWidth: full ? 'min(92vh, 1000px)' : 720, display: 'block', margin: '0 auto' }}
        onMouseLeave={() => setHover(null)}
      >
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const active = hover != null && (e.from === hover || e.to === hover);
          const dim = hover != null && !active;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? '#2b8cff' : '#9bb0e8'}
              strokeWidth={active ? 2 : 1}
              opacity={dim ? 0.1 : active ? 0.9 : 0.5}
              style={{ transition: 'stroke 0.18s ease, stroke-width 0.18s ease, opacity 0.18s ease' }}
            />
          );
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const deg = n.inLinks + n.outLinks;
          const r = nodeR(deg);
          const isolated = deg === 0;
          const isH = hover === n.id;
          const conn = hover == null || neighbors.has(n.id);
          const fill = nodeColor(deg / maxDeg, isolated);
          const labelRight = Math.cos(p.a) >= 0;
          const circle = (
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={fill}
              stroke={isH ? '#1e2440' : '#fff'}
              strokeWidth={isH ? 2.5 : 1}
              opacity={conn ? 1 : 0.25}
              style={{
                transform: isH ? 'scale(1.6)' : 'scale(1)',
                transformBox: 'fill-box',
                transformOrigin: 'center',
                transition: 'transform 0.18s ease, opacity 0.18s ease, fill 0.18s ease',
              }}
            />
          );
          const label = showLabel ? (
            <text
              x={p.x + (labelRight ? r + 4 : -(r + 4))}
              y={p.y + 3}
              fontSize={9}
              fill={isH ? '#1a1a1a' : '#444'}
              fontWeight={isH ? 600 : 400}
              textAnchor={labelRight ? 'start' : 'end'}
              opacity={conn ? 1 : 0.3}
              style={{ transition: 'opacity 0.18s ease' }}
            >
              {n.title.length > 22 ? n.title.slice(0, 22) + '…' : n.title}
            </text>
          ) : null;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHover(n.id)}
              onFocus={() => setHover(n.id)}
              onClick={() => onOpenNode?.(n.id)}
              style={{ cursor: 'pointer' }}
            >
              {circle}
              {label}
            </g>
          );
        })}
        {hovered && hp ? (
          <g style={{ animation: 'optTipIn 0.18s ease', pointerEvents: 'none' }}>
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={8} fill="#1f1f24" opacity={0.96} />
            <text x={tipX + 11} y={tipY + 19} fontSize={11.5} fontWeight={600} fill="#fff">
              {title}
            </text>
            <text x={tipX + 11} y={tipY + 35} fontSize={10.5} fill="#c9c9d4">
              {meta}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

// ─────────────────────────── 2D / 3D lực (canvas) ───────────────────────────
function ForceCanvas({
  graph,
  mode,
  full,
  onOpenNode,
}: {
  graph: FGData;
  mode: '2d' | '3d';
  full: boolean;
  onOpenNode?: (id: string) => void;
}) {
  const t = useTranslations('optimize');
  const [hover, setHover] = useState<{ title: string; inn: number; out: number; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref để handler trong sim gọi callback mới nhất mà KHÔNG cần chạy lại mô phỏng.
  const openRef = useRef(onOpenNode);
  openRef.current = onOpenNode;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const is3d = mode === '3d';

    let seed = 20260706;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const nodes: SimNode[] = graph.nodes.map((n) => ({
      ...n,
      deg: n.inLinks + n.outLinks,
      r: nodeR(n.inLinks + n.outLinks),
      x: (rnd() - 0.5) * 340,
      y: (rnd() - 0.5) * 340,
      z: is3d ? (rnd() - 0.5) * 340 : 0,
      vx: 0,
      vy: 0,
      vz: 0,
    }));
    const maxDeg = Math.max(1, ...nodes.map((n) => n.deg));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = graph.edges.filter((e) => byId.has(e.from) && byId.has(e.to));
    const adj = new Map<string, Set<string>>();
    nodes.forEach((n) => adj.set(n.id, new Set()));
    edges.forEach((e) => {
      adj.get(e.from)!.add(e.to);
      adj.get(e.to)!.add(e.from);
    });

    let W = 0;
    let H = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() {
      W = wrap!.clientWidth || 640;
      H = wrap!.clientHeight || 540;
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      fitted = false;
    }

    let alpha = 1;
    let fitted = false;
    let baseScale = 1;
    let ox = 0;
    let oy = 0;
    let zoom = 1;
    let rotY = 0.5;
    let rotX = -0.3;
    let hoverId: string | null = null;
    let dragId: string | null = null;
    let dragMoved = false;
    let pointerDown = false;
    let lastX = 0;
    let lastY = 0;
    const screenPos = new Map<string, { x: number; y: number; pscale: number; depth: number }>();

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function physics() {
      const rep = 2400;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dz = is3d ? a.z - b.z : 0;
          const d2 = dx * dx + dy * dy + dz * dz + 0.01;
          const d = Math.sqrt(d2);
          const f = rep / d2;
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          a.vz += (dz / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
          b.vz -= (dz / d) * f;
        }
      }
      const spring = 0.03;
      const len = 66;
      for (const e of edges) {
        const a = byId.get(e.from)!;
        const b = byId.get(e.to)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = is3d ? b.z - a.z : 0;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
        const f = (d - len) * spring;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        a.vz += (dz / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
        b.vz -= (dz / d) * f;
      }
      const c = 0.01;
      const damp = 0.8;
      const maxV = 30;
      for (const n of nodes) {
        n.vx -= n.x * c;
        n.vy -= n.y * c;
        if (is3d) n.vz -= n.z * c;
        if (n.id === dragId) {
          n.vx = n.vy = n.vz = 0;
          continue;
        }
        const sp = Math.hypot(n.vx, n.vy, n.vz);
        if (sp > maxV) {
          const k = maxV / sp;
          n.vx *= k;
          n.vy *= k;
          n.vz *= k;
        }
        n.x += n.vx * alpha;
        n.y += n.vy * alpha;
        if (is3d) n.z += n.vz * alpha;
        n.vx *= damp;
        n.vy *= damp;
        n.vz *= damp;
      }
      alpha *= 0.985;
    }

    function projected(n: SimNode) {
      if (!is3d) return { px: n.x, py: n.y, depth: 0 };
      const cyy = Math.cos(rotY);
      const syy = Math.sin(rotY);
      const x1 = n.x * cyy + n.z * syy;
      const z1 = -n.x * syy + n.z * cyy;
      const cxx = Math.cos(rotX);
      const sxx = Math.sin(rotX);
      const y1 = n.y * cxx - z1 * sxx;
      const z2 = n.y * sxx + z1 * cxx;
      return { px: x1, py: y1, depth: z2 };
    }

    function render() {
      const pts = nodes.map((n) => ({ n, ...projected(n) }));
      if (!fitted) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of pts) {
          minX = Math.min(minX, p.px);
          maxX = Math.max(maxX, p.px);
          minY = Math.min(minY, p.py);
          maxY = Math.max(maxY, p.py);
        }
        if (is3d) {
          let rad = 1;
          for (const n of nodes) rad = Math.max(rad, Math.hypot(n.x, n.y, n.z));
          baseScale = (Math.min(W, H) / 2 - 70) / rad;
          ox = 0;
          oy = 0;
        } else {
          const spanX = Math.max(1, maxX - minX);
          const spanY = Math.max(1, maxY - minY);
          baseScale = Math.min((W - 100) / spanX, (H - 100) / spanY);
          ox = (minX + maxX) / 2;
          oy = (minY + maxY) / 2;
        }
        if (alpha < 0.02) fitted = true;
      }

      const F = 560;
      screenPos.clear();
      for (const p of pts) {
        const sd = p.depth * baseScale * zoom;
        const persp = is3d ? Math.max(0.25, F / (F + sd)) : 1;
        const x = W / 2 + (p.px - ox) * baseScale * zoom * persp;
        const y = H / 2 + (p.py - oy) * baseScale * zoom * persp;
        screenPos.set(p.n.id, { x, y, pscale: is3d ? persp * zoom : zoom, depth: p.depth });
      }

      // Nền SÁNG (gradient nhẹ) cho dễ nhìn.
      const bg = ctx!.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.75);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(1, '#e8ecf7');
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, W, H);

      const nb = hoverId ? adj.get(hoverId)! : null;

      // Cạnh.
      ctx!.lineCap = 'round';
      for (const e of edges) {
        const a = screenPos.get(e.from)!;
        const b = screenPos.get(e.to)!;
        const active = hoverId != null && (e.from === hoverId || e.to === hoverId);
        ctx!.strokeStyle = active
          ? 'rgba(60,80,200,0.9)'
          : hoverId
            ? 'rgba(120,135,180,0.12)'
            : 'rgba(120,138,185,0.32)';
        ctx!.lineWidth = active ? 1.8 : 0.8;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }

      // Node — 3D vẽ xa trước để gần nằm trên; quầng sáng nhẹ; hover viền đậm.
      const order = is3d ? [...pts].sort((a, b) => b.depth - a.depth) : pts;
      const showLabelAll = nodes.length <= 60;
      for (const p of order) {
        const sc = screenPos.get(p.n.id)!;
        const isH = p.n.id === hoverId;
        const near = !hoverId || isH || (nb ? nb.has(p.n.id) : false);
        const r = Math.max(2, p.n.r * sc.pscale);
        const isolated = p.n.deg === 0;
        const frac = p.n.deg / maxDeg;
        const fill = nodeColor(frac, isolated);
        ctx!.globalAlpha = near ? 1 : 0.14;
        ctx!.shadowColor = fill;
        ctx!.shadowBlur = near ? (isH ? 16 : 4 + r * 0.5) : 0;
        ctx!.beginPath();
        ctx!.arc(sc.x, sc.y, r, 0, Math.PI * 2);
        ctx!.fillStyle = fill;
        ctx!.fill();
        ctx!.shadowBlur = 0;
        ctx!.lineWidth = isH ? 2.5 : 1;
        ctx!.strokeStyle = isH ? '#1e2440' : 'rgba(255,255,255,0.85)';
        ctx!.stroke();
        if ((showLabelAll || near) && (isH || near)) {
          const label = p.n.title.length > 26 ? `${p.n.title.slice(0, 26)}…` : p.n.title;
          ctx!.globalAlpha = near ? (isH ? 1 : 0.9) : 0.25;
          ctx!.fillStyle = isH ? '#11152b' : '#3a4060';
          ctx!.font = `${isH ? 12.5 : 10.5}px system-ui, sans-serif`;
          ctx!.fillText(label, sc.x + r + 5, sc.y + 3.5);
        }
      }
      ctx!.globalAlpha = 1;
    }

    let raf = 0;
    function loop() {
      if (alpha > 0.004) physics();
      // 3D tự xoay; TẠM DỪNG khi đang kéo (pointerDown) rồi tự quay lại khi thả.
      if (is3d && !pointerDown) rotY += 0.0022;
      render();
      raf = requestAnimationFrame(loop);
    }
    loop();

    function pos(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function pick(mx: number, my: number): SimNode | null {
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const sc = screenPos.get(n.id);
        if (!sc) continue;
        const dx = sc.x - mx;
        const dy = sc.y - my;
        const rr = Math.max(7, n.r * sc.pscale + 4);
        const d = dx * dx + dy * dy;
        if (d <= rr * rr && d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    }
    function onMove(e: PointerEvent) {
      const { x, y } = pos(e);
      if (pointerDown) {
        dragMoved = true;
        if (dragId) {
          const n = byId.get(dragId)!;
          n.x = (x - W / 2) / (baseScale * zoom) + ox;
          n.y = (y - H / 2) / (baseScale * zoom) + oy;
          if (alpha < 0.1) alpha = 0.1;
        } else if (is3d) {
          rotY += (x - lastX) * 0.01;
          rotX += (y - lastY) * 0.01;
          rotX = Math.max(-1.4, Math.min(1.4, rotX));
        }
        lastX = x;
        lastY = y;
        return;
      }
      const n = pick(x, y);
      hoverId = n ? n.id : null;
      canvas!.style.cursor = n ? 'pointer' : is3d ? 'grab' : 'default';
      setHover(n ? { title: n.title, inn: n.inLinks, out: n.outLinks, x, y } : null);
    }
    function onDown(e: PointerEvent) {
      const { x, y } = pos(e);
      pointerDown = true;
      dragMoved = false;
      lastX = x;
      lastY = y;
      const n = pick(x, y);
      if (n && !is3d) dragId = n.id;
      canvas!.setPointerCapture(e.pointerId);
    }
    function onUp(e: PointerEvent) {
      const { x, y } = pos(e);
      if (!dragMoved) {
        const n = pick(x, y);
        if (n) openRef.current?.(n.id);
      }
      pointerDown = false;
      dragId = null;
      try {
        canvas!.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoom = Math.max(0.3, Math.min(4, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    }
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [graph, mode, full]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', borderRadius: full ? 0 : 10, border: full ? 'none' : '1px solid #e3e6ef' }}
      />
      {hover ? (
        <div
          style={{
            position: 'absolute',
            left: Math.min(hover.x + 12, (wrapRef.current?.clientWidth ?? 600) - 220),
            top: hover.y + 12,
            maxWidth: 220,
            pointerEvents: 'none',
            background: 'rgba(20,22,34,0.96)',
            color: '#fff',
            borderRadius: 8,
            padding: '6px 9px',
            fontSize: 12,
            lineHeight: 1.35,
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hover.title}
          </div>
          <div style={{ color: '#c9c9d4' }}>{t('graphTipLinks', { inn: hover.inn, out: hover.out })}</div>
        </div>
      ) : null}
    </div>
  );
}

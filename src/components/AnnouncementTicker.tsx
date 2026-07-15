'use client';

// Thanh thông báo CHẠY ở giữa header. Trượt liên tục, lặp vô hạn, tốc độ + link nhúng chỉnh từ
// Quản trị nền tảng. Nội dung nhân đôi để cuộn liền mạch (seamless), tạm dừng khi rê chuột.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface TickerItem {
  id: string;
  text: string;
  url?: string;
  enabled?: boolean;
}

// Presentational: nhận sẵn items + speed (dùng cả ở header và ô Xem trước trong admin).
export function TickerView({ items, speed }: { items: TickerItem[]; speed: number }) {
  const boxRef = useRef<HTMLDivElement>(null); // khung nhìn (bề ngang hiển thị)
  const setRef = useRef<HTMLDivElement>(null); // MỘT bộ nội dung (đo bề rộng)
  const [reps, setReps] = useState(2); // số bản lặp trong track
  const [shift, setShift] = useState(0); // px dịch mỗi vòng = bề rộng một bộ
  const [dur, setDur] = useState(20);

  // Lặp đủ bản để track PHỦ KÍN khung (dù nội dung ngắn hơn bề ngang) rồi cuộn đúng một bộ và lặp
  // → luôn thấy chữ trải hết, không để lộ khoảng trống. Tốc độ = quãng đường (một bộ) / px-mỗi-giây.
  const measure = useCallback(() => {
    const box = boxRef.current;
    const one = setRef.current;
    if (!box || !one) return;
    const w = one.scrollWidth; // bề rộng một bộ
    const c = box.clientWidth; // bề rộng khung
    if (w <= 0) return;
    const pps = Math.min(300, Math.max(10, speed || 60));
    setReps(Math.max(2, Math.ceil(c / w) + 1)); // đủ để lấp kín + 1 bộ dự phòng cho vòng lặp
    setShift(w);
    setDur(Math.max(4, w / pps));
  }, [speed]);

  useEffect(() => {
    measure();
  }, [measure, items]);

  // Đo lại khi đổi kích thước cửa sổ (bề ngang khung thay đổi → cần thêm/bớt bản lặp).
  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  if (items.length === 0) return null;

  const cell = (it: TickerItem, rep: number) => {
    const key = rep + ':' + it.id;
    const hidden = rep > 0 || undefined; // chỉ bộ đầu là "thật" với trình đọc màn hình
    if (it.url) {
      const external = /^https?:\/\//i.test(it.url);
      return (
        <a
          key={key}
          className="announce-ticker__cell"
          href={it.url}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          aria-hidden={hidden}
          tabIndex={rep > 0 ? -1 : undefined}
        >
          {it.text}
        </a>
      );
    }
    return (
      <span key={key} className="announce-ticker__cell" aria-hidden={hidden}>
        {it.text}
      </span>
    );
  };

  const trackStyle = {
    animationDuration: `${dur}s`,
    ['--announce-shift']: `${shift}px`,
  } as React.CSSProperties;

  return (
    <div className="announce-ticker" ref={boxRef} aria-label="announcements">
      <div className="announce-ticker__track" style={trackStyle}>
        {Array.from({ length: reps }, (_, r) => (
          <div
            className="announce-ticker__set"
            key={r}
            ref={r === 0 ? setRef : undefined}
            aria-hidden={r > 0 || undefined}
          >
            {items.map((it) => cell(it, r))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Bản dùng ở header: tự tải cấu hình công khai. Rỗng/tắt → không render gì.
export function AnnouncementTicker() {
  const [cfg, setCfg] = useState<{ enabled: boolean; speed: number; items: TickerItem[] } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    fetch('/api/announcements')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setCfg(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!cfg?.enabled) return null;
  const items = cfg.items.filter((i) => i.enabled !== false && i.text);
  if (items.length === 0) return null;
  return <TickerView items={items} speed={cfg.speed} />;
}

'use client';

import { useEffect } from 'react';

// Hiệu ứng xuất hiện khi cuộn. AN TOÀN SEO/no-JS: chỉ BẬT hiệu ứng khi có JS + không bật
// "giảm chuyển động" → thêm class .lp-animate; nếu không, nội dung hiển thị đầy đủ như thường.
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector('.lp');
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    root.classList.add('lp-animate');
    const els = Array.from(root.querySelectorAll<HTMLElement>('.lp-reveal'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('lp-in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}

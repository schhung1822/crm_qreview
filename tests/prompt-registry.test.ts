import { describe, expect, it } from 'vitest';
import { PROMPTS, defaultUserTemplate, sentinelVars } from '../src/lib/ai/prompt-registry';
import { fillTemplate } from '../src/lib/ai/prompt-store';

// Giá trị thật giả lập cho mỗi biến (khác dạng token [..] để phát hiện lẫn lộn).
function realVars(vars: { name: string }[]): Record<string, string> {
  return Object.fromEntries(vars.map((v) => [v.name, `VAL_${v.name}_END`]));
}

describe('prompt registry', () => {
  it('mỗi biến khai báo đều THỰC SỰ xuất hiện trong template mặc định', () => {
    for (const p of PROMPTS) {
      const tpl = defaultUserTemplate(p);
      for (const v of p.vars) {
        expect(tpl.includes(`[${v.name}]`), `${p.id} thiếu token [${v.name}]`).toBe(true);
      }
    }
  });

  it('tên biến là snake_case ASCII (không đụng "[...]" văn bản thường)', () => {
    for (const p of PROMPTS) {
      for (const v of p.vars) {
        expect(/^[a-z0-9_]+$/.test(v.name), `${p.id}: ${v.name}`).toBe(true);
      }
    }
  });

  // BẤT BIẾN CỐT LÕI: đường override (fill [ten_bien]) PHẢI cho kết quả Y HỆT đường mặc định
  // (build với giá trị thật). Nhờ vậy admin sửa prompt bằng [ten_bien] hành xử đúng như mặc định.
  it('fillTemplate(default) === build(realVars) cho mọi prompt', () => {
    for (const p of PROMPTS) {
      const vals = realVars(p.vars);
      const viaOverride = fillTemplate(defaultUserTemplate(p), p, vals);
      const viaDefault = p.build(vals);
      expect(viaOverride, p.id).toBe(viaDefault);
    }
  });

  it('sau khi điền giá trị thật, KHÔNG còn token biến nào sót lại', () => {
    for (const p of PROMPTS) {
      const out = p.build(realVars(p.vars));
      for (const v of p.vars) {
        expect(out.includes(`[${v.name}]`), `${p.id} còn sót [${v.name}]`).toBe(false);
      }
    }
  });

  it('fillTemplate CHỈ thay token đã đăng ký, giữ nguyên "[...]" văn bản thường', () => {
    const rubric = PROMPTS.find((p) => p.id === 'scoring_rubric')!;
    const out = fillTemplate('[tu_khoa] và [cần kiểm chứng] và [ngon_ngu]', rubric, {
      tu_khoa: 'SEO',
      ngon_ngu: 'Tiếng Việt',
    });
    expect(out).toBe('SEO và [cần kiểm chứng] và Tiếng Việt');
  });

  it('id là duy nhất', () => {
    const ids = PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

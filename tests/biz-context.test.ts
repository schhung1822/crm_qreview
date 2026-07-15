import { describe, expect, it } from 'vitest';
import { bizContext, currentBizId, setBizContext } from '../src/lib/biz/context';
import { bizFile } from '../src/lib/data/biz-path';

describe('biz isolation mechanism', () => {
  it('bizFile falls back to global .data when no biz context', () => {
    expect(bizFile('connections.json')).toMatch(/[\\/]\.data[\\/]connections\.json$/);
    expect(bizFile('connections.json')).not.toMatch(/biz/);
  });

  it('bizFile points to per-biz dir inside a context', () => {
    bizContext.run({ userId: 'u', bizId: 'biz_test1' }, () => {
      expect(bizFile('connections.json')).toMatch(/[\\/]biz[\\/]biz_test1[\\/]connections\.json$/);
    });
  });

  it('run() isolates concurrent flows (no cross-biz leak)', async () => {
    async function flow(id: string, delay: number) {
      return bizContext.run({ userId: 'u', bizId: id }, async () => {
        await new Promise((r) => setTimeout(r, delay));
        return currentBizId();
      });
    }
    const results = await Promise.all([flow('A', 15), flow('B', 5), flow('C', 10)]);
    expect(results).toEqual(['A', 'B', 'C']);
  });

  it('enterWith (the guard pattern) isolates across concurrent requests', async () => {
    // Mô phỏng đúng cách guard() dùng: mỗi "request" gọi setBizContext (enterWith) rồi await
    // (thao tác store) rồi đọc lại bizId. Phải thấy đúng bizId của chính mình.
    async function handler(id: string, delay: number) {
      setBizContext({ userId: 'u', bizId: id });
      await new Promise((r) => setTimeout(r, delay));
      return currentBizId();
    }
    const results = await Promise.all([handler('A', 15), handler('B', 5), handler('C', 10)]);
    expect(results).toEqual(['A', 'B', 'C']);
  });
});

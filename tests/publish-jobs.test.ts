import { describe, expect, it } from 'vitest';
import { dueJobs, type PublishJob } from '@/lib/store/publish-jobs';

function job(p: Partial<PublishJob>): PublishJob {
  return {
    id: p.id ?? 'job_1',
    connectionId: 'c1',
    article: { title: 'T', slug: 's', contentHtml: '<p>x</p>' },
    alternates: [],
    status: p.status ?? 'scheduled',
    runAt: p.runAt,
    attempts: p.attempts ?? 0,
    maxAttempts: p.maxAttempts ?? 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

const NOW = '2026-06-30T12:00:00.000Z';

describe('dueJobs', () => {
  it('chọn job scheduled đã tới giờ (runAt <= now)', () => {
    const past = job({ id: 'a', status: 'scheduled', runAt: '2026-06-30T11:00:00.000Z' });
    const future = job({ id: 'b', status: 'scheduled', runAt: '2026-07-01T00:00:00.000Z' });
    const ids = dueJobs([past, future], NOW).map((j) => j.id);
    expect(ids).toEqual(['a']);
  });

  it('bỏ qua job done; chọn pending & error còn lượt', () => {
    const done = job({ id: 'd', status: 'done' });
    const pending = job({ id: 'p', status: 'pending' });
    const errRetry = job({ id: 'e', status: 'error', attempts: 1, maxAttempts: 3 });
    const errDead = job({ id: 'x', status: 'error', attempts: 3, maxAttempts: 3 });
    const ids = dueJobs([done, pending, errRetry, errDead], NOW).map((j) => j.id);
    expect(ids.sort()).toEqual(['e', 'p']);
  });

  it('job không có runAt → đến hạn ngay', () => {
    expect(dueJobs([job({ id: 'n', runAt: undefined })], NOW).map((j) => j.id)).toEqual(['n']);
  });

  it('phục hồi job running bị KẸT (updatedAt quá cũ) nhưng bỏ qua running mới', () => {
    const stuck = job({ id: 'stuck', status: 'running', attempts: 1, updatedAt: '2026-06-30T11:40:00.000Z' }); // ~20 phút trước
    const fresh = job({ id: 'fresh', status: 'running', attempts: 1, updatedAt: '2026-06-30T11:58:00.000Z' }); // ~2 phút trước
    const ids = dueJobs([stuck, fresh], NOW).map((j) => j.id);
    expect(ids).toEqual(['stuck']);
  });

  it('không phục hồi running kẹt đã hết lượt (attempts >= maxAttempts)', () => {
    const dead = job({ id: 'dead', status: 'running', attempts: 3, maxAttempts: 3, updatedAt: '2026-06-30T10:00:00.000Z' });
    expect(dueJobs([dead], NOW)).toEqual([]);
  });
});

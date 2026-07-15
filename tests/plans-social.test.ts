// Test hạn mức Báo cáo Social trong gói cước (spec 07-2026):
// Free 1 lượt/tháng CHỈ fanpage Facebook; Starter 20 / Pro 50 / Agency 100 đủ kênh;
// Enterprise không giới hạn. Số liệu là MẶC ĐỊNH - admin đổi được qua tab Gói cước
// (plans-store merge override), nhưng đổi mặc định trong code phải chủ ý → test khóa lại.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS, isUnlimited } from '../src/lib/billing/plans';

describe('gói cước - Báo cáo Social', () => {
  it('hạn mức lượt tạo/tháng mặc định: 1 / 20 / 50 / 100 / không giới hạn', () => {
    expect(DEFAULT_PLANS.free.socialReportsPerMonth).toBe(1);
    expect(DEFAULT_PLANS.starter.socialReportsPerMonth).toBe(20);
    expect(DEFAULT_PLANS.pro.socialReportsPerMonth).toBe(50);
    expect(DEFAULT_PLANS.agency.socialReportsPerMonth).toBe(100);
    expect(isUnlimited(DEFAULT_PLANS.enterprise.socialReportsPerMonth)).toBe(true);
  });

  it('phạm vi kênh: Free chỉ fanpage Facebook, các gói trả phí đủ kênh', () => {
    expect(DEFAULT_PLANS.free.features.socialAllChannels).toBe(false);
    expect(DEFAULT_PLANS.starter.features.socialAllChannels).toBe(true);
    expect(DEFAULT_PLANS.pro.features.socialAllChannels).toBe(true);
    expect(DEFAULT_PLANS.agency.features.socialAllChannels).toBe(true);
    expect(DEFAULT_PLANS.enterprise.features.socialAllChannels).toBe(true);
  });
});

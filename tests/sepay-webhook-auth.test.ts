import { describe, expect, it } from 'vitest';
import { computeSepayHmac, verifySepayWebhook } from '../src/lib/billing/sepay-webhook-auth';

const BODY = JSON.stringify({ transferType: 'in', content: 'NOTI ord_1', transferAmount: 99000 });

describe('verifySepayWebhook — API Key', () => {
  const cfg = { authMethod: 'apikey' as const, apiKey: 'secret-key-123', hmacSecret: '' };

  it('chấp nhận đúng Apikey', () => {
    expect(verifySepayWebhook(cfg, { authorization: 'Apikey secret-key-123', signature: null }, BODY)).toBe('ok');
  });
  it('không phân biệt hoa/thường ở "Apikey"', () => {
    expect(verifySepayWebhook(cfg, { authorization: 'apikey secret-key-123', signature: null }, BODY)).toBe('ok');
  });
  it('từ chối sai key', () => {
    expect(verifySepayWebhook(cfg, { authorization: 'Apikey wrong', signature: null }, BODY)).toBe('unauthorized');
  });
  it('từ chối thiếu header', () => {
    expect(verifySepayWebhook(cfg, { authorization: null, signature: null }, BODY)).toBe('unauthorized');
  });
  it('từ chối sai scheme (Bearer)', () => {
    expect(verifySepayWebhook(cfg, { authorization: 'Bearer secret-key-123', signature: null }, BODY)).toBe('unauthorized');
  });
  it('fail-closed khi chưa đặt apiKey', () => {
    expect(verifySepayWebhook({ authMethod: 'apikey', apiKey: '', hmacSecret: '' }, { authorization: 'Apikey x', signature: null }, BODY)).toBe('not-configured');
  });
});

describe('verifySepayWebhook — HMAC-SHA256', () => {
  const secret = 'hmac-shared-secret';
  const cfg = { authMethod: 'hmac' as const, apiKey: '', hmacSecret: secret };
  const sig = computeSepayHmac(secret, BODY);

  it('chấp nhận chữ ký hex đúng', () => {
    expect(verifySepayWebhook(cfg, { authorization: null, signature: sig }, BODY)).toBe('ok');
  });
  it('chấp nhận tiền tố "sha256="', () => {
    expect(verifySepayWebhook(cfg, { authorization: null, signature: `sha256=${sig}` }, BODY)).toBe('ok');
  });
  it('chấp nhận chữ ký hoa (không phân biệt hoa/thường hex)', () => {
    expect(verifySepayWebhook(cfg, { authorization: null, signature: sig.toUpperCase() }, BODY)).toBe('ok');
  });
  it('từ chối chữ ký sai', () => {
    expect(verifySepayWebhook(cfg, { authorization: null, signature: 'deadbeef' }, BODY)).toBe('unauthorized');
  });
  it('từ chối khi body bị sửa (chữ ký không còn khớp)', () => {
    expect(verifySepayWebhook(cfg, { authorization: null, signature: sig }, BODY + ' ')).toBe('unauthorized');
  });
  it('từ chối thiếu chữ ký', () => {
    expect(verifySepayWebhook(cfg, { authorization: null, signature: null }, BODY)).toBe('unauthorized');
  });
  it('fail-closed khi chưa đặt hmacSecret', () => {
    expect(verifySepayWebhook({ authMethod: 'hmac', apiKey: '', hmacSecret: '' }, { authorization: null, signature: sig }, BODY)).toBe('not-configured');
  });
  it('không dùng apiKey để qua mặt HMAC', () => {
    // Dù apiKey đúng, method=hmac vẫn chỉ xét chữ ký HMAC.
    const mixed = { authMethod: 'hmac' as const, apiKey: 'valid-key', hmacSecret: secret };
    expect(verifySepayWebhook(mixed, { authorization: 'Apikey valid-key', signature: null }, BODY)).toBe('unauthorized');
  });
});

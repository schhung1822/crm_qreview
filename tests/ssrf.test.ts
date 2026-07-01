import { describe, expect, it } from 'vitest';
import { assertPublicHost, assertPublicUrl, isBlockedIp } from '@/lib/security/ssrf';

describe('isBlockedIp', () => {
  const blocked = [
    '127.0.0.1',
    '169.254.169.254', // cloud metadata
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1', // multicast
    '::1',
    '::ffff:127.0.0.1', // IPv4-mapped
    '::ffff:7f00:1', // hex IPv4-mapped loopback
    'fe80::1', // link-local
    'fc00::1', // unique-local
  ];
  const allowed = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'];

  it.each(blocked)('chặn %s', (ip) => expect(isBlockedIp(ip)).toBe(true));
  it.each(allowed)('cho phép %s', (ip) => expect(isBlockedIp(ip)).toBe(false));
  it('chặn chuỗi không phải IP', () => expect(isBlockedIp('not-an-ip')).toBe(true));
});

describe('assertPublicHost / assertPublicUrl', () => {
  it('chặn localhost & *.localhost & *.internal', () => {
    expect(() => assertPublicHost(new URL('http://localhost'))).toThrow();
    expect(() => assertPublicHost(new URL('http://foo.localhost'))).toThrow();
    expect(() => assertPublicHost(new URL('http://metadata.google.internal'))).toThrow();
  });
  it('chặn IP-literal nội bộ', () => {
    expect(() => assertPublicHost(new URL('http://127.0.0.1'))).toThrow();
    expect(() => assertPublicHost(new URL('http://[::1]'))).toThrow();
  });
  it('cho phép host công khai', () => {
    expect(() => assertPublicHost(new URL('https://example.com'))).not.toThrow();
  });
  it('assertPublicUrl chặn scheme lạ', () => {
    expect(() => assertPublicUrl('file:///etc/passwd')).toThrow();
    expect(() => assertPublicUrl('not a url at all !!')).toThrow();
  });
});

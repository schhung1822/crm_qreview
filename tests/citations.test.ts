import { describe, expect, it } from 'vitest';
import { matchesDomain, normalizeDomain } from '@/lib/citations/run';

describe('normalizeDomain', () => {
  it('bỏ scheme, www, đường dẫn', () => {
    expect(normalizeDomain('https://www.example.com/blog?x=1')).toBe('example.com');
    expect(normalizeDomain('Example.COM')).toBe('example.com');
    expect(normalizeDomain('  http://example.com  ')).toBe('example.com');
  });
});

describe('matchesDomain', () => {
  it('khớp đúng domain và subdomain', () => {
    expect(matchesDomain('example.com', 'https://example.com/bai-viet')).toBe(true);
    expect(matchesDomain('example.com', 'https://www.example.com/x')).toBe(true);
    expect(matchesDomain('example.com', 'https://blog.example.com/x')).toBe(true);
  });

  it('KHÔNG khớp domain khác hoặc domain lừa', () => {
    expect(matchesDomain('example.com', 'https://other.com/x')).toBe(false);
    expect(matchesDomain('example.com', 'https://notexample.com/x')).toBe(false);
    expect(matchesDomain('example.com', 'https://example.com.evil.com/x')).toBe(false);
    expect(matchesDomain('example.com', 'không-phải-url')).toBe(false);
  });
});

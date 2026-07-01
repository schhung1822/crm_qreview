import { defineConfig } from 'vitest/config';

// Test unit cho logic thuần (scoring, markdown/XSS, SSRF classifier, json-store).
// Môi trường node (không cần DOM). Path alias @/ lấy từ tsconfig (hỗ trợ native).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

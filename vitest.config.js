import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',   // 有些测试需要 window / localStorage
    globals: true,
    include: ['**/__tests__/**/*.test.js', '**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['core/**/*.js', 'grades/**/*.js'],
      exclude: ['**/__tests__/**'],
    },
  },
});
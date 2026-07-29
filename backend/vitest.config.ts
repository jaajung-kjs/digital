import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['dotenv/config'],
    fileParallelism: false, // 실 DB 공유 — 파일 순차 실행
    hookTimeout: 30000,    // sweepTestFixtures() 콜드 DB 연결 여유
    include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*', '**/mockData'],
    },
  },
});

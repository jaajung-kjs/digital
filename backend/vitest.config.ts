import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['dotenv/config'],
    fileParallelism: false, // 실 DB 공유 — 파일 순차 실행
    include: ['src/**/*.test.ts'],
  },
});

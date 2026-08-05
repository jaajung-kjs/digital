import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 설정 — 마스터 스펙(2026-07-24 capability 재구축)의 검증 계획이 요구한
 * "타입 정의 → 배치 → 연결 → 추적 → 선번장 → 설계서 한 줄기"를 돌린다.
 *
 * 개발 규칙(CLAUDE.md)에 따라 DB 는 docker-compose.dev.yml, 서버는 `npm run dev` 로
 * 이미 떠 있는 것을 재사용한다 — 여기서 docker 를 빌드하지 않는다.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 워킹카피·커밋이 공유 DB 를 건드리므로 직렬
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 1000 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

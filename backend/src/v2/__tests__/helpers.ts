import express from 'express';
import { errorHandler } from '../../middleware/errorHandler.js';
import { signAccessToken } from '../jwt.js';
import { v2Router } from '../router.js';

export function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v2', v2Router);
  app.use(errorHandler);
  return app;
}

/**
 * v2 jwt(signAccessToken)로 Bearer 헤더를 생성한다.
 * v2 auth.middleware 가 동일한 v2 jwt(verifyAccessToken)로 검증하므로
 * v2 인증 경로를 완전히 통과한다.
 * 기존 테스트의 동기 호출 패턴을 유지하기 위해 동기 함수로 제공한다.
 */
export function authHeader(role: 'ADMIN' | 'VIEWER' | 'admin' | 'viewer' = 'admin'): string {
  const normalizedRole = role.toLowerCase() as 'admin' | 'viewer';
  return `Bearer ${signAccessToken({ userId: 'test-user', username: 'tester', role: normalizedRole })}`;
}

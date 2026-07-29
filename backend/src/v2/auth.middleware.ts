/** v2 자립 인증 미들웨어 — role 은 소문자 문자열 'admin'|'viewer', 구 middleware/auth.ts 독립. */
import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from './jwt.js';
import { HttpError } from './errors.js';

// ── Express Request 타입 확장 ─────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

// ── 미들웨어 ──────────────────────────────────────────────────────────────────

/**
 * Bearer 토큰을 검증하고 req.user 에 페이로드를 설정한다.
 * 실패 시 HttpError 401 을 next() 로 전달한다.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HttpError(401, 'UNAUTHORIZED', '인증 토큰이 필요합니다.');
    }
    const token = authHeader.slice(7);
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * 관리자 역할 목록.
 * 인증 계층의 권한 게이트는 도메인 role 분기 금지 대상이 아니며,
 * Task 5에서 가드레일에 auth 계층 예외를 명시 예정.
 */
const ADMIN_ROLES = ['admin'] as const;

/**
 * ADMIN_ROLES 에 속한 역할만 통과시킨다.
 * authenticate 이후에 사용해야 한다.
 */
export function adminOnly(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new HttpError(401, 'UNAUTHORIZED', '인증이 필요합니다.'));
    return;
  }
  if (!ADMIN_ROLES.includes(req.user.role as (typeof ADMIN_ROLES)[number])) {
    next(new HttpError(403, 'FORBIDDEN', '이 작업을 수행할 권한이 없습니다.'));
    return;
  }
  next();
}

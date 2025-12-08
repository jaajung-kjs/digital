import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../utils/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { UserRole } from '@prisma/client';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * JWT 인증 미들웨어
 * Authorization: Bearer {token} 헤더에서 토큰 추출 및 검증
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('인증 토큰이 필요합니다.');
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * 역할 기반 권한 검증 미들웨어
 * @param roles 허용된 역할 배열
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('인증이 필요합니다.'));
      return;
    }

    if (!roles.includes(req.user.role as UserRole)) {
      next(new ForbiddenError('이 작업을 수행할 권한이 없습니다.'));
      return;
    }

    next();
  };
}

/**
 * 관리자 권한 검증 미들웨어
 */
export const adminOnly = authorize(UserRole.ADMIN);

/**
 * 선택적 인증 미들웨어 (인증 없이도 접근 가능, 있으면 user 정보 추가)
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);
      req.user = payload;
    }

    next();
  } catch {
    // 토큰이 유효하지 않아도 계속 진행 (인증 없이)
    next();
  }
}

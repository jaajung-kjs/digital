/** v2 자립 JWT — 구 utils/jwt.ts 에 의존하지 않는다 (Stage 7 삭제 격리). */
import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import { HttpError } from './errors.js';

// ── 환경 설정 (구 config/index.ts 와 동일 env 이름·기본값) ──────────────────
const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'access-secret-key-change-in-production';
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'refresh-secret-key-change-in-production';
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '1h';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

// ── 페이로드 타입 (구 utils/jwt.ts 와 동일 필드 — 토큰 호환) ─────────────
export interface AccessTokenPayload {
  userId: string;
  username: string;
  role: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

// ── 서명 ─────────────────────────────────────────────────────────────────────

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  } as SignOptions);
}

// ── 검증 ─────────────────────────────────────────────────────────────────────

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as JwtPayload & AccessTokenPayload;
    return { userId: decoded.userId, username: decoded.username, role: decoded.role };
  } catch {
    throw new HttpError(401, 'INVALID_TOKEN', '유효하지 않은 액세스 토큰입니다.');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as JwtPayload & RefreshTokenPayload;
    return { userId: decoded.userId, tokenId: decoded.tokenId };
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH', '유효하지 않은 리프레시 토큰입니다.');
  }
}

// ── 만료 일시 계산 ────────────────────────────────────────────────────────────

export function refreshTokenExpiresAt(): Date {
  const m = REFRESH_EXPIRES_IN.match(/^(\d+)([dhms])$/);
  if (!m) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const v = parseInt(m[1], 10);
  const multipliers: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
  };
  return new Date(Date.now() + v * (multipliers[m[2]] ?? 24 * 60 * 60 * 1000));
}

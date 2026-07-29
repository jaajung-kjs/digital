/** v2 자립 인증 서비스 — bcryptjs 비교, RefreshToken rotate, 계정 잠금 미이관(YAGNI). */
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  refreshTokenExpiresAt,
} from './jwt.js';

// ── 인터페이스 ────────────────────────────────────────────────────────────────

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; role: string };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

// ── 서비스 ────────────────────────────────────────────────────────────────────

/**
 * 로그인 — 자격 증명 확인 후 토큰 쌍 발급.
 * 계정 잠금(loginAttempts)은 구 기능이므로 이관하지 않음(이월 기록).
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  const user = await nextDb.user.findUnique({ where: { username } });
  if (!user) throw new HttpError(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');

  const tokenId = uuidv4();
  const accessToken = signAccessToken({ userId: user.id, username: user.username, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, tokenId });

  await nextDb.refreshToken.create({
    data: {
      id: tokenId,
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(),
    },
  });

  return { accessToken, refreshToken, user: { id: user.id, username: user.username, role: user.role } };
}

/**
 * 토큰 갱신 — 구 refresh token 삭제 + 신규 쌍 발급(rotate).
 */
export async function refresh(refreshToken: string): Promise<RefreshResult> {
  // JWT 검증 먼저 (만료·변조 → INVALID_REFRESH)
  const payload = verifyRefreshToken(refreshToken);

  const stored = await nextDb.refreshToken.findUnique({
    where: { id: payload.tokenId },
    include: { user: true },
  });

  if (!stored || stored.token !== refreshToken) {
    throw new HttpError(401, 'INVALID_REFRESH', '유효하지 않은 리프레시 토큰입니다.');
  }

  if (stored.expiresAt < new Date()) {
    await nextDb.refreshToken.delete({ where: { id: payload.tokenId } });
    throw new HttpError(401, 'INVALID_REFRESH', '만료된 리프레시 토큰입니다.');
  }

  // rotate — 구 토큰 삭제 + 신규 생성을 원자적으로 (중간 실패 시 로그아웃 방지)
  const newTokenId = uuidv4();
  const newAccessToken = signAccessToken({
    userId: stored.user.id,
    username: stored.user.username,
    role: stored.user.role,
  });
  const newRefreshToken = signRefreshToken({ userId: stored.user.id, tokenId: newTokenId });

  await nextDb.$transaction([
    nextDb.refreshToken.delete({ where: { id: payload.tokenId } }),
    nextDb.refreshToken.create({
      data: {
        id: newTokenId,
        userId: stored.user.id,
        token: newRefreshToken,
        expiresAt: refreshTokenExpiresAt(),
      },
    }),
  ]);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

/**
 * 로그아웃 — 특정 refresh token 무효화.
 * 토큰을 못 찾아도 조용히 성공(멱등).
 */
export async function logout(refreshToken: string): Promise<void> {
  try {
    await nextDb.refreshToken.delete({ where: { token: refreshToken } });
  } catch {
    // 이미 삭제됐거나 존재하지 않으면 무시
  }
}

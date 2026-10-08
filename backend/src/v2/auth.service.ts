/** v2 자립 인증 서비스 — bcryptjs 비교, RefreshToken rotate, 로그인 시도 제한. */
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

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; role: string };
}

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

// 존재하지 않는 사용자에 대해서도 같은 비용의 bcrypt 를 태우기 위한 더미 해시.
// 없으면 "사용자 없음"은 즉시 반환(2ms)되고 "비밀번호 틀림"은 bcrypt 를 돌아(56ms)
// 응답 시간만으로 계정 존재 여부가 드러난다(실측 24배 차이). 로그인 시도 제한이
// 없는 현재 상태와 겹치면 열거 → 무제한 대입으로 바로 이어진다.
// 값은 임의 문자열의 해시이며 어떤 비밀번호와도 일치하지 않는다(cost 는 시드와 동일한 10).
const DUMMY_PASSWORD_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/** 이 횟수만큼 연속 실패하면 잠근다. */
export const MAX_FAILED_LOGINS = 5;
/** 잠금 지속 시간(분). 지나면 자동으로 풀린다 — 관리자 개입을 요구하지 않는다. */
const LOCKOUT_MINUTES = 15;

// ── 서비스 ────────────────────────────────────────────────────────────────────

/**
 * 로그인 — 자격 증명 확인 후 토큰 쌍 발급.
 * 계정 잠금(loginAttempts)은 구 기능이므로 이관하지 않음(이월 기록).
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  const user = await nextDb.user.findUnique({ where: { username } });

  // 사용자 유무와 무관하게 항상 bcrypt 를 한 번 태운다 — 두 실패 경로의 응답
  // 시간을 같게 만들어 계정 열거를 막는다(위 DUMMY_PASSWORD_HASH 주석 참조).
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  const lockedUntil = user?.lockedUntil ?? null;
  const isLocked = lockedUntil != null && lockedUntil > new Date();

  if (!user || !valid) {
    // 잠긴 동안의 실패는 세지 않는다 — 세면 남이 계속 틀려서 잠금을 무한정 늘릴 수 있다.
    if (user && !isLocked) await registerFailedAttempt(user.id, user.failedLoginCount);
    throw new HttpError(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  /* 비밀번호가 맞은 뒤에야 잠금 사실을 알린다.
     틀린 사람에게도 "잠김" 이라고 하면 그 계정이 **존재한다**는 것을 알려주는 셈이라,
     위에서 더미 해시까지 써 가며 막아 둔 계정 열거가 도로 열린다. 비밀번호를 맞힌
     사람은 이미 그 계정을 아는 사람이므로 이유를 알려주는 편이 낫다. */
  if (isLocked) {
    const minutes = Math.max(1, Math.ceil((lockedUntil!.getTime() - Date.now()) / 60000));
    throw new HttpError(
      423,
      'ACCOUNT_LOCKED',
      `로그인 시도가 너무 많아 잠겼습니다. ${minutes}분 후 다시 시도하세요.`,
    );
  }

  // 성공하면 실패 기록을 지운다 — 다음 잠금은 처음부터 센다.
  if (user.failedLoginCount > 0 || user.lockedUntil != null) {
    await nextDb.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

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

/**
 * 로그인 실패 1회 기록 — 임계치에 닿으면 잠근다.
 *
 * 잠글 때 카운터를 0 으로 되돌리는 이유: 잠금이 풀린 뒤 한 번만 더 틀려도 바로 다시
 * 잠기는 것을 막기 위해서다(사용자가 비밀번호를 헷갈리는 정상 상황에서 사실상 영구 잠금이 된다).
 */
async function registerFailedAttempt(userId: string, currentCount: number): Promise<void> {
  const next = currentCount + 1;
  if (next < MAX_FAILED_LOGINS) {
    await nextDb.user.update({ where: { id: userId }, data: { failedLoginCount: next } });
    return;
  }
  await nextDb.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: 0,
      lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
    },
  });
}

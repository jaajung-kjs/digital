import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/prisma.js';
import { config } from '../config/index.js';
import {
  hashPassword,
  comparePassword,
  assertPasswordStrength,
} from '../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiry,
} from '../utils/jwt.js';
import {
  InvalidCredentialsError,
  AccountLockedError,
  AccountDisabledError,
  TokenInvalidError,
  NotFoundError,
} from '../utils/errors.js';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: string;
  };
}

export interface TokenRefreshResult {
  accessToken: string;
}

class AuthService {
  /**
   * 로그인 처리
   */
  async login(username: string, password: string): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new InvalidCredentialsError();
    }

    // 계정 비활성화 확인
    if (!user.isActive) {
      throw new AccountDisabledError();
    }

    // 계정 잠금 확인
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / (1000 * 60)
      );
      throw new AccountLockedError(minutesRemaining);
    }

    // 비밀번호 검증
    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      await this.handleFailedLogin(user.id, user.loginAttempts);
      throw new InvalidCredentialsError();
    }

    // 로그인 성공 - 실패 카운트 초기화
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    // 토큰 생성
    const tokenId = uuidv4();
    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({
      userId: user.id,
      tokenId,
    });

    // Refresh token DB 저장
    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId: user.id,
        token: refreshToken,
        expiresAt: getRefreshTokenExpiry(),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * 로그인 실패 처리
   */
  private async handleFailedLogin(
    userId: string,
    currentAttempts: number
  ): Promise<void> {
    const newAttempts = currentAttempts + 1;
    const updateData: { loginAttempts: number; lockedUntil?: Date } = {
      loginAttempts: newAttempts,
    };

    // 최대 시도 횟수 초과 시 계정 잠금
    if (newAttempts >= config.loginPolicy.maxAttempts) {
      updateData.lockedUntil = new Date(
        Date.now() + config.loginPolicy.lockDurationMinutes * 60 * 1000
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  /**
   * 토큰 갱신
   */
  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const payload = verifyRefreshToken(refreshToken);

    // DB에서 refresh token 확인
    const storedToken = await prisma.refreshToken.findUnique({
      where: { id: payload.tokenId },
      include: { user: true },
    });

    if (!storedToken || storedToken.token !== refreshToken) {
      throw new TokenInvalidError();
    }

    if (storedToken.expiresAt < new Date()) {
      // 만료된 토큰 삭제
      await prisma.refreshToken.delete({
        where: { id: payload.tokenId },
      });
      throw new TokenInvalidError();
    }

    if (!storedToken.user.isActive) {
      throw new AccountDisabledError();
    }

    // 새 access token 발급
    const accessToken = generateAccessToken({
      userId: storedToken.user.id,
      username: storedToken.user.username,
      role: storedToken.user.role,
    });

    return { accessToken };
  }

  /**
   * 로그아웃 (refresh token 삭제)
   */
  async logout(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  /**
   * 비밀번호 변경
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('사용자');
    }

    // 현재 비밀번호 확인
    const isValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    // 새 비밀번호 검증
    assertPasswordStrength(newPassword);

    // 비밀번호 업데이트
    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // 모든 refresh token 무효화 (다른 기기 로그아웃)
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  /**
   * 현재 사용자 정보 조회
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('사용자');
    }

    return user;
  }
}

export const authService = new AuthService();

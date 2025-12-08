import prisma from '../config/prisma.js';
import { UserRole } from '@prisma/client';
import { hashPassword, assertPasswordStrength } from '../utils/password.js';
import {
  UsernameExistsError,
  NotFoundError,
} from '../utils/errors.js';

export interface CreateUserInput {
  username: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

class UserService {
  /**
   * 사용자 목록 조회 (관리자용)
   */
  async getUsers() {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return users;
  }

  /**
   * 사용자 상세 조회
   */
  async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('사용자');
    }

    return user;
  }

  /**
   * 사용자 생성 (관리자용)
   */
  async createUser(data: CreateUserInput) {
    // 비밀번호 검증
    assertPasswordStrength(data.password);

    // 아이디 중복 확인
    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existing) {
      throw new UsernameExistsError();
    }

    // 비밀번호 해시
    const passwordHash = await hashPassword(data.password);

    // 사용자 생성
    const user = await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        name: data.name,
        role: data.role || UserRole.VIEWER,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * 사용자 수정 (관리자용)
   */
  async updateUser(id: string, data: UpdateUserInput) {
    // 존재 확인
    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('사용자');
    }

    // 업데이트
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        isActive: data.isActive,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  /**
   * 사용자 삭제 (관리자용)
   */
  async deleteUser(id: string): Promise<void> {
    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('사용자');
    }

    await prisma.user.delete({
      where: { id },
    });
  }

  /**
   * 비밀번호 초기화 (관리자용)
   */
  async resetPassword(id: string, newPassword: string): Promise<void> {
    // 비밀번호 검증
    assertPasswordStrength(newPassword);

    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('사용자');
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    // 해당 사용자의 모든 refresh token 무효화
    await prisma.refreshToken.deleteMany({
      where: { userId: id },
    });
  }
}

export const userService = new UserService();

import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { PasswordTooWeakError } from './errors.js';

// 비밀번호 정책: 최소 8자, 영문+숫자 조합
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;

export function validatePassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}

export function assertPasswordStrength(password: string): void {
  if (!validatePassword(password)) {
    throw new PasswordTooWeakError();
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptRounds);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

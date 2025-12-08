import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { config } from '../config/index.js';
import { TokenExpiredError, TokenInvalidError } from './errors.js';

export interface AccessTokenPayload {
  userId: string;
  username: string;
  role: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwt.accessExpiresIn,
  };
  return jwt.sign(payload, config.jwt.accessSecret, options);
}

export function generateRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwt.refreshExpiresIn,
  };
  return jwt.sign(payload, config.jwt.refreshSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as JwtPayload & AccessTokenPayload;
    return {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    throw new TokenInvalidError();
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret) as JwtPayload & RefreshTokenPayload;
    return {
      userId: decoded.userId,
      tokenId: decoded.tokenId,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    throw new TokenInvalidError();
  }
}

// Refresh token expiry date 계산
export function getRefreshTokenExpiry(): Date {
  const expiresIn = config.jwt.refreshExpiresIn;
  const match = expiresIn.match(/^(\d+)([dhms])$/);

  if (!match) {
    // 기본 7일
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  let ms: number;
  switch (unit) {
    case 'd':
      ms = value * 24 * 60 * 60 * 1000;
      break;
    case 'h':
      ms = value * 60 * 60 * 1000;
      break;
    case 'm':
      ms = value * 60 * 1000;
      break;
    case 's':
      ms = value * 1000;
      break;
    default:
      ms = 7 * 24 * 60 * 60 * 1000;
  }

  return new Date(Date.now() + ms);
}

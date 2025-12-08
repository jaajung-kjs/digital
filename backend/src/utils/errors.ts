export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Auth Errors
export class InvalidCredentialsError extends AppError {
  constructor() {
    super(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
  }
}

export class AccountLockedError extends AppError {
  constructor(minutesRemaining?: number) {
    super(
      423,
      'ACCOUNT_LOCKED',
      minutesRemaining
        ? `계정이 잠겼습니다. ${minutesRemaining}분 후 다시 시도하세요.`
        : '계정이 잠겼습니다. 잠시 후 다시 시도하세요.'
    );
  }
}

export class AccountDisabledError extends AppError {
  constructor() {
    super(403, 'ACCOUNT_DISABLED', '비활성화된 계정입니다.');
  }
}

export class TokenExpiredError extends AppError {
  constructor() {
    super(401, 'TOKEN_EXPIRED', '토큰이 만료되었습니다.');
  }
}

export class TokenInvalidError extends AppError {
  constructor() {
    super(401, 'TOKEN_INVALID', '유효하지 않은 토큰입니다.');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '권한이 없습니다.') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '접근이 거부되었습니다.') {
    super(403, 'FORBIDDEN', message);
  }
}

export class PasswordTooWeakError extends AppError {
  constructor() {
    super(400, 'PASSWORD_TOO_WEAK', '비밀번호는 8자 이상, 영문과 숫자를 포함해야 합니다.');
  }
}

export class UsernameExistsError extends AppError {
  constructor() {
    super(409, 'USERNAME_EXISTS', '이미 사용 중인 아이디입니다.');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = '리소스') {
    super(404, 'NOT_FOUND', `${resource}를 찾을 수 없습니다.`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

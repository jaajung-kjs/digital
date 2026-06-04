import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { config } from '../config/index.js';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    if (config.nodeEnv === 'development') {
      console.error(
        'ZodError:',
        err.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      );
    }
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: '입력값이 올바르지 않습니다.',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // express body-parser PayloadTooLargeError — 도면 저장 시 DWG background
  // 가 limit 을 넘으면 여기로 떨어짐. 500 generic 으로 묶이면 원인 파악이
  // 어려워 명시적으로 413 으로 회신.
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: '요청 본문이 너무 큽니다. 파일/도면 크기를 줄여주세요.',
    });
    return;
  }

  // Custom AppError
  if (err instanceof AppError) {
    const response: { error: string; message: string; details?: unknown } = {
      error: err.code,
      message: err.message,
    };
    if (err.details) {
      response.details = err.details;
    }
    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2003') {
      res.status(422).json({ error: 'FOREIGN_KEY_VIOLATION', message: '참조된 리소스가 존재하지 않습니다.' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: '대상 리소스를 찾을 수 없습니다.' });
      return;
    }
  }

  // Log unexpected errors
  console.error('Unexpected error:', err);

  // Generic error response
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message:
      config.nodeEnv === 'development'
        ? err.message
        : '서버 오류가 발생했습니다.',
  });
}

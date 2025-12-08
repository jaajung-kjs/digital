import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { config } from '../config/index.js';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
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

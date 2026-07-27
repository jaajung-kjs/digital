import express from 'express';
import { errorHandler } from '../../middleware/errorHandler.js';
import { generateAccessToken } from '../../utils/jwt.js';
import { v2Router } from '../router.js';

export function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v2', v2Router);
  app.use(errorHandler);
  return app;
}

export function authHeader(role: 'ADMIN' | 'VIEWER' = 'ADMIN'): string {
  return `Bearer ${generateAccessToken({ userId: 'test-user', username: 'tester', role })}`;
}

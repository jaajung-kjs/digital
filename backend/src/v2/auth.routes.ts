/** v2 인증 라우트: POST /login, /refresh, /logout · GET /me */
import { Router } from 'express';
import { authenticate } from './auth.middleware.js';
import * as authService from './auth.service.js';
import { loginSchema, refreshSchema, logoutSchema } from './schemas.js';

export const authRouter = Router();

// ── POST /login ───────────────────────────────────────────────────────────────

authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const result = await authService.login(username, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /refresh ─────────────────────────────────────────────────────────────

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refresh(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /logout ──────────────────────────────────────────────────────────────

authRouter.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = logoutSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── GET /me ───────────────────────────────────────────────────────────────────

authRouter.get('/me', authenticate, (req, res) => {
  const { userId, username, role } = req.user!;
  res.json({ id: userId, username, role });
});

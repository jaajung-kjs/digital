import { Router } from 'express';
import { z } from 'zod';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  username: z.string().min(1, '아이디를 입력하세요.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token이 필요합니다.'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호를 입력하세요.'),
  newPassword: z
    .string()
    .min(8, '비밀번호는 8자 이상이어야 합니다.')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)/,
      '비밀번호는 영문과 숫자를 포함해야 합니다.'
    ),
});

// Routes
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.put(
  '/password',
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);
router.get('/me', authenticate, authController.me);

export { router as authRouter };

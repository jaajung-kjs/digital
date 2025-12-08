import { Router } from 'express';
import { z } from 'zod';
import { userController } from '../controllers/user.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// 모든 라우트에 인증 및 관리자 권한 필요
router.use(authenticate, adminOnly);

// Validation schemas
const createUserSchema = z.object({
  username: z
    .string()
    .min(3, '아이디는 3자 이상이어야 합니다.')
    .max(50, '아이디는 50자 이하여야 합니다.')
    .regex(/^[a-zA-Z0-9_]+$/, '아이디는 영문, 숫자, 밑줄만 사용할 수 있습니다.'),
  password: z
    .string()
    .min(8, '비밀번호는 8자 이상이어야 합니다.')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)/,
      '비밀번호는 영문과 숫자를 포함해야 합니다.'
    ),
  name: z
    .string()
    .min(1, '이름을 입력하세요.')
    .max(100, '이름은 100자 이하여야 합니다.'),
  role: z.enum(['ADMIN', 'VIEWER']).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['ADMIN', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, '비밀번호는 8자 이상이어야 합니다.')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)/,
      '비밀번호는 영문과 숫자를 포함해야 합니다.'
    ),
});

// Routes
router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.post('/', validate(createUserSchema), userController.createUser);
router.put('/:id', validate(updateUserSchema), userController.updateUser);
router.delete('/:id', userController.deleteUser);
router.post(
  '/:id/reset-password',
  validate(resetPasswordSchema),
  userController.resetPassword
);

export { router as usersRouter };

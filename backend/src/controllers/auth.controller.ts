import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';

export const authController = {
  /**
   * POST /api/auth/login
   * 로그인
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body;
      const result = await authService.login(username, password);

      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/refresh
   * 토큰 갱신
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);

      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/logout
   * 로그아웃
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      await authService.logout(userId);

      res.json({ message: '로그아웃되었습니다.' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/auth/password
   * 비밀번호 변경
   */
  async changePassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { currentPassword, newPassword } = req.body;

      await authService.changePassword(userId, currentPassword, newPassword);

      res.json({ message: '비밀번호가 변경되었습니다.' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/auth/me
   * 현재 사용자 정보
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const user = await authService.getCurrentUser(userId);

      res.json({ user });
    } catch (error) {
      next(error);
    }
  },
};

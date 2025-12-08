import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.service.js';

export const userController = {
  /**
   * GET /api/users
   * 사용자 목록 조회
   */
  async getUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await userService.getUsers();
      res.json({ users });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/users/:id
   * 사용자 상세 조회
   */
  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = await userService.getUserById(id);
      res.json(user);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/users
   * 사용자 생성
   */
  async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await userService.createUser(req.body);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/users/:id
   * 사용자 수정
   */
  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = await userService.updateUser(id, req.body);
      res.json(user);
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/users/:id
   * 사용자 삭제
   */
  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await userService.deleteUser(id);
      res.json({ message: '사용자가 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/users/:id/reset-password
   * 비밀번호 초기화
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;
      await userService.resetPassword(id, newPassword);
      res.json({ message: '비밀번호가 초기화되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

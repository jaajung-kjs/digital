import { Request, Response, NextFunction } from 'express';
import { fiberPathService } from '../services/fiberPath.service.js';

export const fiberPathController = {
  /**
   * GET /api/equipment/:ofdId/fiber-paths
   * OFD 설비의 광경로 목록 조회
   */
  async getByOfdId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ofdId } = req.params;
      const paths = await fiberPathService.getByOfdId(ofdId);

      res.json({ data: paths });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/fiber-paths/:id
   * 광경로 상세 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await fiberPathService.getById(id);

      res.json({ data: path });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/fiber-paths
   * 광경로 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const path = await fiberPathService.create(req.body, userId);

      res.status(201).json({ data: path });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/fiber-paths/:id
   * 광경로 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await fiberPathService.delete(id);

      res.json({ message: '광경로가 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

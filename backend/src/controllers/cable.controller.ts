import { Request, Response, NextFunction } from 'express';
import { cableService } from '../services/cable.service.js';

export const cableController = {
  /**
   * GET /api/cables
   * 모든 케이블 조회
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cables = await cableService.getAll();

      res.json({ data: cables });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/cables/:id
   * 케이블 상세 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const cable = await cableService.getById(id);

      res.json({ data: cable });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/cables
   * 케이블 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const cable = await cableService.create(req.body, userId);

      res.status(201).json({ data: cable });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/cables/:id
   * 케이블 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const cable = await cableService.update(id, req.body, userId);

      res.json({ data: cable });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/cables/:id
   * 케이블 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await cableService.delete(id);

      res.json({ message: '케이블이 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/rooms/:roomId/connections
   * 실에 연결된 모든 케이블 조회
   */
  async getByRoomId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const cables = await cableService.getByRoomId(id);

      res.json({ data: cables });
    } catch (error) {
      next(error);
    }
  },
};

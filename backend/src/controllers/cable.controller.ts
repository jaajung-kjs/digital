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

};

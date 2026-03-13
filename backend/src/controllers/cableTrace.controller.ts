import { Request, Response, NextFunction } from 'express';
import { cableTraceService } from '../services/cableTrace.service.js';

export const cableTraceController = {
  /**
   * GET /api/cables/:id/trace
   * 케이블 경로 추적 (BFS 기반, 모든 케이블 타입 지원)
   */
  async trace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await cableTraceService.trace(id);

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
};

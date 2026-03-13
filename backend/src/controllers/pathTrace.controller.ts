import { Request, Response, NextFunction } from 'express';
import { pathTraceService } from '../services/pathTrace.service.js';

export const pathTraceController = {
  /**
   * GET /api/equipment/:equipmentId/paths
   * 설비의 광경로 추적
   */
  async trace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const result = await pathTraceService.trace(equipmentId);

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
};

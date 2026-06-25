import { Request, Response, NextFunction } from 'express';
import { rackModuleService } from '../services/rackModule.service.js';
import { ValidationError } from '../utils/errors.js';

export const rackModuleController = {
  /**
   * GET /api/rack-modules?rackId=xxx
   * rackId 필수.
   */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Accept both rackAssetId and legacy rackId for backward compatibility
      const rackId =
        (typeof req.query.rackAssetId === 'string' ? req.query.rackAssetId : undefined) ??
        (typeof req.query.rackId === 'string' ? req.query.rackId : undefined);
      if (!rackId) {
        throw new ValidationError('rackId 또는 rackAssetId 쿼리 파라미터가 필요합니다.');
      }
      const modules = await rackModuleService.getByRackId(rackId);
      res.json({ data: modules });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/rack-modules/:id
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const module = await rackModuleService.getById(id);
      res.json({ data: module });
    } catch (error) {
      next(error);
    }
  },
};

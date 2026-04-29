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
      const rackId = typeof req.query.rackId === 'string' ? req.query.rackId : undefined;
      if (!rackId) {
        throw new ValidationError('rackId 쿼리 파라미터가 필요합니다.');
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

  /**
   * POST /api/rack-modules
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const created = await rackModuleService.create(req.body, userId);
      res.status(201).json({ data: created });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/rack-modules/:id
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const updated = await rackModuleService.update(id, req.body, userId);
      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/rack-modules/:id
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await rackModuleService.delete(id);
      res.json({ message: '랙 모듈이 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

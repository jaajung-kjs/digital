import { Request, Response, NextFunction } from 'express';
import { rackModuleCategoryService } from '../services/rackModuleCategory.service.js';

export const rackModuleCategoryController = {
  /**
   * GET /api/rack-module-categories
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await rackModuleCategoryService.getAll();
      res.json({ data: categories });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/rack-module-categories/:id
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const category = await rackModuleCategoryService.getById(id);
      res.json({ data: category });
    } catch (error) {
      next(error);
    }
  },
};

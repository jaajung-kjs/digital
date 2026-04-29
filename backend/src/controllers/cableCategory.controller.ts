import { Request, Response, NextFunction } from 'express';
import { cableCategoryService } from '../services/cableCategory.service.js';

export const cableCategoryController = {
  /**
   * GET /api/cable-categories
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await cableCategoryService.getAll();
      res.json({ data: categories });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/cable-categories/:id
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const category = await cableCategoryService.getById(id);
      res.json({ data: category });
    } catch (error) {
      next(error);
    }
  },
};

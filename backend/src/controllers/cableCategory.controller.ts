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
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(201).json({ data: await cableCategoryService.create(req.body) }); } catch (e) { next(e); }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ data: await cableCategoryService.update(req.params.id, req.body) }); } catch (e) { next(e); }
  },
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await cableCategoryService.delete(req.params.id); res.json({ message: '케이블 분류가 삭제되었습니다.' }); } catch (e) { next(e); }
  },
};

import { Request, Response, NextFunction } from 'express';
import { materialCategoryService } from '../services/materialCategory.service.js';

export const materialCategoryController = {
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await materialCategoryService.findAll();
      res.json(categories);
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cat = await materialCategoryService.findById(req.params.id);
      if (!cat) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }
      res.json(cat);
    } catch (err) {
      next(err);
    }
  },

  async getByType(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = req.params.type as 'CABLE' | 'EQUIPMENT' | 'ACCESSORY';
      const categories = await materialCategoryService.findByType(type);
      res.json(categories);
    } catch (err) {
      next(err);
    }
  },
};

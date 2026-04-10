import type { Request, Response, NextFunction } from 'express';
import { materialCategoryService } from '../services/materialCategory.service.js';
import type { MaterialCategoryType } from '@prisma/client';

class MaterialCategoryController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, parentId } = req.query;
      const filters: any = {};
      if (type) filters.type = type as MaterialCategoryType;
      if (parentId === 'null') filters.parentId = null;
      else if (parentId) filters.parentId = parentId as string;

      const categories = await materialCategoryService.getAll(
        Object.keys(filters).length > 0 ? filters : undefined
      );
      res.json({ data: categories });
    } catch (err) { next(err); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await materialCategoryService.getById(req.params.id);
      res.json({ data: category });
    } catch (err) { next(err); }
  }

  async getByType(req: Request, res: Response, next: NextFunction) {
    try {
      const type = req.params.type.toUpperCase() as MaterialCategoryType;
      const categories = await materialCategoryService.getByType(type);
      res.json({ data: categories });
    } catch (err) { next(err); }
  }
}

export const materialCategoryController = new MaterialCategoryController();

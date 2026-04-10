import type { Request, Response, NextFunction } from 'express';
import { materialService } from '../services/material.service.js';

class MaterialController {
  async resolve(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, specParams } = req.body;
      const result = await materialService.resolve(categoryId, specParams);
      res.json({ data: result });
    } catch (err) { next(err); }
  }

  async getByCategoryId(req: Request, res: Response, next: NextFunction) {
    try {
      const materials = await materialService.getByCategoryId(req.query.categoryId as string);
      res.json({ data: materials });
    } catch (err) { next(err); }
  }
}

export const materialController = new MaterialController();

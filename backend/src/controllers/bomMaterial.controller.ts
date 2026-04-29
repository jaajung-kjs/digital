import { Request, Response, NextFunction } from 'express';
import { bomMaterialService } from '../services/bomMaterial.service.js';

export const bomMaterialController = {
  /**
   * GET /api/bom-materials
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const materials = await bomMaterialService.getAll();
      res.json({ data: materials });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/bom-materials/:id
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const material = await bomMaterialService.getById(id);
      res.json({ data: material });
    } catch (error) {
      next(error);
    }
  },
};

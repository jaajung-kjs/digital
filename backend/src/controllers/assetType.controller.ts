import { Request, Response, NextFunction } from 'express';
import { assetTypeService } from '../services/assetType.service.js';

export const assetTypeController = {
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await assetTypeService.getAll() });
    } catch (error) { next(error); }
  },
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await assetTypeService.getById(req.params.id) });
    } catch (error) { next(error); }
  },
};

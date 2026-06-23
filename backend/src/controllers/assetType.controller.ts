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
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ data: await assetTypeService.create(req.body) });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await assetTypeService.update(req.params.id, req.body) });
    } catch (error) { next(error); }
  },
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await assetTypeService.delete(req.params.id);
      res.json({ message: '자산 종류가 삭제되었습니다.' });
    } catch (error) { next(error); }
  },
};

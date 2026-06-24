import { Request, Response, NextFunction } from 'express';
import { assetCategoryService } from '../services/assetCategory.service.js';

export const assetCategoryController = {
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ data: await assetCategoryService.getAll() }); } catch (e) { next(e); }
  },
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(201).json({ data: await assetCategoryService.create(req.body) }); } catch (e) { next(e); }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ data: await assetCategoryService.update(req.params.id, req.body) }); } catch (e) { next(e); }
  },
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await assetCategoryService.delete(req.params.id); res.json({ message: '자산 분류가 삭제되었습니다.' }); } catch (e) { next(e); }
  },
};

import { Request, Response, NextFunction } from 'express';
import { cableGroupService } from '../services/cableGroup.service.js';

export const cableGroupController = {
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ data: await cableGroupService.getAll() }); } catch (e) { next(e); }
  },
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(201).json({ data: await cableGroupService.create(req.body) }); } catch (e) { next(e); }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ data: await cableGroupService.update(req.params.id, req.body) }); } catch (e) { next(e); }
  },
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await cableGroupService.delete(req.params.id); res.json({ message: '케이블 그룹이 삭제되었습니다.' }); } catch (e) { next(e); }
  },
};

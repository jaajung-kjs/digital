import { Request, Response, NextFunction } from 'express';
import { inspectionLogService } from '../services/inspectionLog.service.js';

export const inspectionLogController = {
  async getByAssetId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { assetId } = req.params;
      const logs = await inspectionLogService.getByAssetId(assetId);
      res.json({ data: logs });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { assetId } = req.params;
      const userId = req.user!.userId;
      const log = await inspectionLogService.create(assetId, req.body, userId);
      res.status(201).json({ data: log });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const log = await inspectionLogService.update(id, req.body, userId);
      res.json({ data: log });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await inspectionLogService.delete(id);
      res.json({ message: '점검 이력이 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

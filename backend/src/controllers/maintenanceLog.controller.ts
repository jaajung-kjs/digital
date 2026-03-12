import { Request, Response, NextFunction } from 'express';
import { maintenanceLogService } from '../services/maintenanceLog.service.js';

export const maintenanceLogController = {
  async getByEquipmentId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const logs = await maintenanceLogService.getByEquipmentId(equipmentId);
      res.json({ data: logs });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const userId = req.user!.userId;
      const log = await maintenanceLogService.create(equipmentId, req.body, userId);
      res.status(201).json({ data: log });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const log = await maintenanceLogService.update(id, req.body, userId);
      res.json({ data: log });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await maintenanceLogService.delete(id);
      res.json({ message: '유지보수 이력이 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

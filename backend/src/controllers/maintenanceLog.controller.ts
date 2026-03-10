import { Request, Response, NextFunction } from 'express';
import { maintenanceLogService } from '../services/maintenanceLog.service.js';

export const maintenanceLogController = {
  /**
   * GET /api/equipment/:equipmentId/maintenance-logs
   * 설비 유지보수 이력 조회
   */
  async getByEquipmentId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const logs = await maintenanceLogService.getByEquipmentId(equipmentId);

      res.json({ data: logs });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/equipment/:equipmentId/maintenance-logs
   * 유지보수 이력 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const log = await maintenanceLogService.create(equipmentId, req.body);

      res.status(201).json({ data: log });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/maintenance-logs/:id
   * 유지보수 이력 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const log = await maintenanceLogService.update(id, req.body);

      res.json({ data: log });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/maintenance-logs/:id
   * 유지보수 이력 삭제
   */
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

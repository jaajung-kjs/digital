import { Request, Response, NextFunction } from 'express';
import { portService } from '../services/port.service.js';

export const portController = {
  /**
   * GET /api/equipment/:equipmentId/ports
   * 설비 내 포트 목록 조회
   */
  async getByEquipmentId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const ports = await portService.getByEquipmentId(equipmentId);

      res.json({ data: ports });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/ports/:id
   * 포트 상세 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const port = await portService.getById(id);

      res.json({ data: port });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/equipment/:equipmentId/ports
   * 포트 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const port = await portService.create(equipmentId, req.body);

      res.status(201).json({ data: port });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/equipment/:equipmentId/ports/bulk
   * 포트 일괄 생성
   */
  async createBulk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const { ports } = req.body;
      const createdPorts = await portService.createBulk(equipmentId, ports);

      res.status(201).json({ data: createdPorts });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/ports/:id
   * 포트 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const port = await portService.update(id, req.body);

      res.json({ data: port });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/ports/:id
   * 포트 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await portService.delete(id);

      res.json({ message: '포트가 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

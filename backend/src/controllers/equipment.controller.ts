import { Request, Response, NextFunction } from 'express';
import { equipmentService } from '../services/equipment.service.js';

export const equipmentController = {
  /**
   * GET /api/racks/:rackId/equipment
   * 랙 내 설비 목록 조회
   */
  async getByRackId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { rackId } = req.params;
      const equipment = await equipmentService.getByRackId(rackId);

      res.json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/equipment/:id
   * 설비 상세 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const equipment = await equipmentService.getById(id);

      res.json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/racks/:rackId/equipment
   * 설비 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { rackId } = req.params;
      const userId = req.user!.userId;
      const equipment = await equipmentService.create(rackId, req.body, userId);

      res.status(201).json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/equipment/:id
   * 설비 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const equipment = await equipmentService.update(id, req.body, userId);

      res.json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/equipment/:id/move
   * 설비 이동 (U 위치 변경)
   */
  async move(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const equipment = await equipmentService.move(id, req.body, userId);

      res.json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/equipment/:id
   * 설비 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await equipmentService.delete(id);

      res.json({ message: '설비가 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/racks/:rackId/available-slots
   * 사용 가능한 U 슬롯 조회
   */
  async getAvailableSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { rackId } = req.params;
      const slots = await equipmentService.getAvailableSlots(rackId);

      res.json({ data: slots });
    } catch (error) {
      next(error);
    }
  },
};

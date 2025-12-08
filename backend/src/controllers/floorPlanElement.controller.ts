import { Request, Response, NextFunction } from 'express';
import { floorPlanElementService } from '../services/floorPlanElement.service.js';

export const floorPlanElementController = {
  /**
   * POST /api/floor-plans/:id/elements
   * 요소 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const element = await floorPlanElementService.create(id, req.body);

      res.status(201).json({ data: element });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/floor-plan-elements/:id
   * 요소 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const element = await floorPlanElementService.update(id, req.body);

      res.json({ data: element });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/floor-plan-elements/:id
   * 요소 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await floorPlanElementService.delete(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};

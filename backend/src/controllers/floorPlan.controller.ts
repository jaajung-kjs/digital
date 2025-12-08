import { Request, Response, NextFunction } from 'express';
import { floorPlanService } from '../services/floorPlan.service.js';

export const floorPlanController = {
  /**
   * GET /api/floors/:floorId/floor-plan
   * 층의 평면도 조회
   */
  async getByFloorId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { floorId } = req.params;
      const floorPlan = await floorPlanService.getByFloorId(floorId);

      if (!floorPlan) {
        res.status(404).json({
          error: {
            code: 'FLOOR_PLAN_NOT_FOUND',
            message: '평면도를 찾을 수 없습니다.',
          },
        });
        return;
      }

      res.json({ data: floorPlan });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/floors/:floorId/floor-plan
   * 평면도 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { floorId } = req.params;
      const userId = req.user!.userId;
      const floorPlan = await floorPlanService.create(floorId, req.body, userId);

      res.status(201).json({ data: floorPlan });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/floor-plans/:id
   * 평면도 전체 저장 (벌크 업데이트)
   */
  async bulkUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const result = await floorPlanService.bulkUpdate(id, req.body, userId);

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/floor-plans/:id
   * 평면도 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await floorPlanService.delete(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};

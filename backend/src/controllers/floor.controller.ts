import { Request, Response, NextFunction } from 'express';
import { floorService } from '../services/floor.service.js';

export const floorController = {
  /**
   * GET /api/substations/:substationId/floors
   * 변전소의 층 목록 조회
   */
  async getList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { substationId } = req.params;
      const floors = await floorService.getListBySubstation(substationId);

      res.json({ data: floors });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/floors/:id
   * 층 상세 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const floor = await floorService.getById(id);

      res.json({ data: floor });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/substations/:substationId/floors
   * 층 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { substationId } = req.params;
      const userId = req.user!.userId;
      const floor = await floorService.create(substationId, req.body, userId);

      res.status(201).json({ data: floor });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/floors/:id
   * 층 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const floor = await floorService.update(id, req.body, userId);

      res.json({ data: floor });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/floors/:id
   * 층 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await floorService.delete(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};

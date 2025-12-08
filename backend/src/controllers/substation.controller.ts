import { Request, Response, NextFunction } from 'express';
import { substationService } from '../services/substation.service.js';

export const substationController = {
  /**
   * GET /api/substations
   * 변전소 목록 조회
   */
  async getList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isActive = req.query.isActive === 'true'
        ? true
        : req.query.isActive === 'false'
          ? false
          : undefined;

      const substations = await substationService.getList(isActive);

      res.json({ data: substations });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/substations/:id
   * 변전소 상세 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const substation = await substationService.getById(id);

      res.json({ data: substation });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/substations
   * 변전소 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const substation = await substationService.create(req.body, userId);

      res.status(201).json({ data: substation });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/substations/:id
   * 변전소 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const substation = await substationService.update(id, req.body, userId);

      res.json({ data: substation });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/substations/:id
   * 변전소 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await substationService.delete(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};

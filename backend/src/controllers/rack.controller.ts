import { Request, Response, NextFunction } from 'express';
import { rackService } from '../services/rack.service.js';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export const rackController = {
  /**
   * GET /api/floor-plans/:id/racks
   * 평면도의 랙 목록 조회
   */
  async getByFloorPlanId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const racks = await rackService.getByFloorPlanId(id);

      res.json({ data: racks });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/racks/:id
   * 랙 상세 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const rack = await rackService.getById(id);

      res.json({ data: rack });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/floor-plans/:id/racks
   * 랙 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const rack = await rackService.create(id, req.body, userId);

      res.status(201).json({ data: rack });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/racks/:id
   * 랙 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const rack = await rackService.update(id, req.body, userId);

      res.json({ data: rack });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/racks/:id
   * 랙 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await rackService.delete(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/racks/:id/images
   * 랙 이미지 업로드
   */
  async uploadImage(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { type } = req.body;
      const userId = req.user!.userId;

      if (!req.file) {
        res.status(400).json({
          error: {
            code: 'FILE_REQUIRED',
            message: '이미지 파일이 필요합니다.',
          },
        });
        return;
      }

      if (!type || !['front', 'rear'].includes(type)) {
        res.status(400).json({
          error: {
            code: 'INVALID_TYPE',
            message: 'type은 front 또는 rear 중 하나여야 합니다.',
          },
        });
        return;
      }

      const imageUrl = `/uploads/racks/${req.file.filename}`;
      const rack = await rackService.updateImage(id, type as 'front' | 'rear', imageUrl, userId);

      res.json({
        data: {
          imageUrl,
          rack,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

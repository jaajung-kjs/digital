import { Request, Response, NextFunction } from 'express';
import { equipmentService } from '../services/equipment.service.js';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export const equipmentController = {
  /**
   * GET /api/equipment
   * 도면에 배치된 top-level 설비 목록 조회
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const equipment = await equipmentService.getAll();
      res.json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/floors/:id/equipment
   * 도면(층)에 배치된 설비 조회
   */
  async getByFloorId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const equipment = await equipmentService.getByFloorId(id);
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
   * POST /api/equipment/:id/image
   * 설비 전면/후면 이미지 업로드
   */
  async uploadImage(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const imageType = req.body.imageType as 'front' | 'rear';
      const userId = req.user!.userId;

      if (!req.file) {
        res.status(400).json({ error: '파일이 필요합니다.' });
        return;
      }
      if (!imageType || !['front', 'rear'].includes(imageType)) {
        res.status(400).json({ error: 'imageType은 front 또는 rear여야 합니다.' });
        return;
      }

      const imageUrl = `/uploads/equipment/${req.file.filename}`;
      const equipment = await equipmentService.updateImage(id, imageType, imageUrl, userId);
      res.json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/equipment/:id/image/:type
   * 설비 전면/후면 이미지 삭제
   */
  async deleteImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, type } = req.params;
      const userId = req.user!.userId;

      if (!['front', 'rear'].includes(type)) {
        res.status(400).json({ error: 'type은 front 또는 rear여야 합니다.' });
        return;
      }

      const equipment = await equipmentService.deleteImage(id, type as 'front' | 'rear', userId);
      res.json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },
};

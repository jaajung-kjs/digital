import { Request, Response, NextFunction } from 'express';
import { equipmentPhotoService } from '../services/equipmentPhoto.service.js';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export const equipmentPhotoController = {
  /**
   * GET /api/equipment/:equipmentId/photos
   * 설비 사진 목록 조회
   */
  async getByEquipmentId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const photos = await equipmentPhotoService.getByEquipmentId(equipmentId);

      res.json({ data: photos });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/equipment/:equipmentId/photos
   * 설비 사진 업로드
   */
  async create(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { equipmentId } = req.params;
      const { side, description, takenAt } = req.body;

      if (!req.file) {
        res.status(400).json({
          error: {
            code: 'FILE_REQUIRED',
            message: '이미지 파일이 필요합니다.',
          },
        });
        return;
      }

      if (!side || !['front', 'rear'].includes(side)) {
        res.status(400).json({
          error: {
            code: 'INVALID_SIDE',
            message: 'side는 front 또는 rear 중 하나여야 합니다.',
          },
        });
        return;
      }

      const imageUrl = `/uploads/equipment/${req.file.filename}`;
      const photo = await equipmentPhotoService.create(equipmentId, {
        side,
        imageUrl,
        description,
        takenAt,
      });

      res.status(201).json({ data: photo });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/equipment-photos/:id
   * 설비 사진 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await equipmentPhotoService.delete(id);

      res.json({ message: '설비 사진이 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

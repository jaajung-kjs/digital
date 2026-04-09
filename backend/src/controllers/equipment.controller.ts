import { Request, Response, NextFunction } from 'express';
import { equipmentService } from '../services/equipment.service.js';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export const equipmentController = {
  /**
   * GET /api/equipment
   * 설비 목록 조회 (카테고리 필터 지원)
   */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = req.query.category as string | undefined;
      const equipment = await equipmentService.getAll(
        category ? { category: category as never } : undefined
      );

      res.json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/rooms/:id/equipment
   * 실에 직접 배치된 설비 목록 조회
   */
  async getByRoomId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const equipment = await equipmentService.getByRoomId(id);

      res.json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/rooms/:id/equipment
   * 평면도에 설비 직접 배치
   */
  async createOnFloorPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const equipment = await equipmentService.createOnFloorPlan(id, req.body, userId);

      res.status(201).json({ data: equipment });
    } catch (error) {
      next(error);
    }
  },

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

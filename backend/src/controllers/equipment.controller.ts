import { Request, Response, NextFunction } from 'express';
import { equipmentService } from '../services/equipment.service.js';
import type { EquipmentKind } from '../services/equipment.service.js';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const VALID_KINDS = new Set(['RACK', 'OFD', 'DISTRIBUTION', 'GROUNDING', 'HVAC']);

export const equipmentController = {
  /**
   * GET /api/equipment
   * 설비 목록 조회 (kind 필터 지원)
   *
   *   ?kind=OFD                       ← preferred (P6+)
   *   ?materialCategoryCode=EQP-OFD   ← legacy alias mapped via prefix
   *   ?category=OFD                   ← legacy alias
   */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const explicitKind = (req.query.kind as string | undefined)?.toUpperCase();
      const legacyCode = (req.query.materialCategoryCode as string | undefined)?.toUpperCase();
      const legacyCategory = (req.query.category as string | undefined)?.toUpperCase();

      let kind: EquipmentKind | undefined;
      if (explicitKind && VALID_KINDS.has(explicitKind)) {
        kind = explicitKind as EquipmentKind;
      } else if (legacyCode === 'EQP-OFD') {
        kind = 'OFD' as EquipmentKind;
      } else if (legacyCode === 'EQP-RACK' || legacyCode?.startsWith('EQP-RACK-')) {
        kind = 'RACK' as EquipmentKind;
      } else if (legacyCode === 'EQP-DIST') {
        kind = 'DISTRIBUTION' as EquipmentKind;
      } else if (legacyCode === 'EQP-GROUND') {
        kind = 'GROUNDING' as EquipmentKind;
      } else if (legacyCode === 'EQP-COOL') {
        kind = 'HVAC' as EquipmentKind;
      } else if (legacyCategory && VALID_KINDS.has(legacyCategory)) {
        kind = legacyCategory as EquipmentKind;
      }

      const equipment = await equipmentService.getAll(kind ? { kind } : undefined);
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
   * POST /api/floors/:id/equipment
   * 도면에 설비 직접 배치
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

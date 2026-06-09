import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { floorController } from '../controllers/floor.controller.js';
import { equipmentController } from '../controllers/equipment.controller.js';
import { cableController } from '../controllers/cable.controller.js';
import { dwgImportController } from '../controllers/dwgImport.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createWorkOrderSchema } from '../schemas/workOrder.schema.js';

// DWG/DXF 업로드 (메모리 — 파일은 파싱 후 즉시 폐기)
const dwgUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.dwg') || name.endsWith('.dxf')) cb(null, true);
    else cb(new Error('지원하지 않는 파일 형식입니다. (.dwg 또는 .dxf만 허용)'));
  },
});

const router = Router();

// ==================== Validation Schemas ====================

const updateFloorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  floorNumber: z.string().max(20).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const equipmentKindEnum = z.enum(['RACK', 'OFD', 'DISTRIBUTION', 'GROUNDING', 'HVAC']);

const patchVersionContextSchema = z.object({
  context: z.record(z.unknown()),
});

const createFloorPlanEquipmentSchema = z.object({
  kind: equipmentKindEnum,
  name: z.string().min(1, '이름은 필수입니다.').max(100),
  positionX: z.number(),
  positionY: z.number(),
  width2d: z.number().positive(),
  height2d: z.number().positive(),
  rotation: z.number().int().optional(),
  totalU: z.number().int().min(1).optional().nullable(),
  height3d: z.number().positive().optional().nullable(),
  installDate: z.string().optional(),
  manager: z.string().max(100).optional(),
  description: z.string().optional(),
  properties: z.unknown().optional(),
});

// ==================== Floor Routes ====================

// 층 기본 정보 조회 (인증 불필요)
router.get('/:id', floorController.getById);

// 층 도면 조회 (인증 불필요)
router.get('/:id/plan', floorController.getPlan);

// 층 메타데이터 수정 (관리자만)
router.put('/:id', authenticate, adminOnly, validate(updateFloorSchema), floorController.update);

// 층 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, floorController.delete);

// ==================== Equipment on Floor ====================

// 층에 배치된 설비 조회 (인증 불필요)
router.get('/:id/equipment', equipmentController.getByFloorId);

// 층에 설비 직접 배치 (관리자만)
router.post(
  '/:id/equipment',
  authenticate,
  adminOnly,
  validate(createFloorPlanEquipmentSchema),
  equipmentController.createOnFloorPlan
);

// 층의 케이블 연결 조회 (인증 불필요)
router.get('/:id/connections', cableController.getByFloorId);

// ==================== Versions (Change History) ====================

// 도면 변경 이력 목록
router.get('/:id/versions', floorController.getAuditLogs);

// 도면 변경 이력 context 수정 (관리자만)
router.patch(
  '/:id/versions/:logId',
  authenticate,
  adminOnly,
  validate(patchVersionContextSchema),
  floorController.patchAuditLogContext
);

// 도면 변경 이력 삭제 (관리자만)
router.delete('/:id/versions/:logId', authenticate, adminOnly, floorController.deleteAuditLog);

// ==================== Work Orders (작업지시서 아카이브) ====================

// 작업지시서 아카이브 — 커밋 성공 후 프론트가 계산한 설계서를 저장 (관리자만)
router.post(
  '/:id/work-orders',
  authenticate,
  adminOnly,
  validate(createWorkOrderSchema),
  floorController.createWorkOrder
);

// 작업지시서 이력 목록 (인증 불필요 — 조회)
router.get('/:id/work-orders', floorController.getWorkOrders);

// 작업지시서 상세 (인증 불필요 — 조회)
router.get('/:id/work-orders/:workOrderId', floorController.getWorkOrder);

// ==================== DWG Background Drawing ====================

// 도면(DWG/DXF) 파싱 — 항상 parse-only. 실제 적용은 staged 상태로 프론트에
// 보관됐다가 substation commit 의 backgroundDrawing 필드로 커밋된다.
// (clear/opacity 도 동일하게 substation commit 으로 처리되므로 별도 라우트 없음.)
router.post(
  '/:id/background/import',
  authenticate,
  adminOnly,
  dwgUpload.single('file'),
  dwgImportController.import
);

export { router as floorsRouter };

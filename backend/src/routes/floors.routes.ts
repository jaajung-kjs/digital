import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { floorController } from '../controllers/floor.controller.js';
import { equipmentController } from '../controllers/equipment.controller.js';
import { cableController } from '../controllers/cable.controller.js';
import { dwgImportController } from '../controllers/dwgImport.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

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

const equipmentSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  tempId: z.string().optional(),
  name: z.string().min(1).max(100),
  category: z.string().max(50).optional(),
  positionX: z.number(),
  positionY: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
  rotation: z.number().optional(),
  description: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  manager: z.string().optional().nullable(),
  height3d: z.number().optional().nullable(),
  materialCategoryId: z.string().uuid().optional().nullable(),
  materialCategoryCode: z.string().optional().nullable(),
  specParams: z.any().optional().nullable(),
  parentEquipmentId: z.string().optional().nullable(),
  startU: z.number().int().min(1).optional().nullable(),
  heightU: z.number().int().min(1).max(12).optional().nullable(),
});

const cableSchema = z.object({
  id: z.string().uuid().nullish(),
  sourceEquipmentId: z.string(),
  targetEquipmentId: z.string(),
  cableType: z.enum(['AC', 'DC', 'LAN', 'FIBER', 'GROUND']),
  label: z.string().nullish(),
  length: z.number().nullish(),
  color: z.string().nullish(),
  description: z.string().nullish(),
  fiberPathId: z.string().uuid().nullish(),
  fiberPortNumber: z.number().int().min(1).max(48).nullish(),
  materialCategoryId: z.string().uuid().nullish(),
  specParams: z.any().nullish(),
  pathPoints: z.array(z.array(z.number()).length(2)).nullish(),
  pathLength: z.number().nullish(),
  bufferLength: z.number().nullish(),
  totalLength: z.number().nullish(),
});

const fiberPathSchema = z.object({
  id: z.string().optional(),
  ofdAId: z.string(),
  ofdBId: z.string(),
  portCount: z.number().int().refine(v => v === 24 || v === 48, { message: 'portCount must be 24 or 48' }),
  description: z.string().optional().nullable(),
});

const bulkUpdatePlanSchema = z.object({
  canvasWidth: z.number().int().min(100).max(10000).optional(),
  canvasHeight: z.number().int().min(100).max(10000).optional(),
  gridSize: z.number().int().min(5).max(100).optional(),
  majorGridSize: z.number().int().min(10).max(200).optional(),
  backgroundColor: z.string().max(20).optional(),
  scaleRatio: z.number().positive().nullish(),
  backgroundOpacity: z.number().min(0).max(1).optional(),
  equipment: z.array(equipmentSchema).optional(),
  cables: z.array(cableSchema).optional(),
  fiberPaths: z.array(fiberPathSchema).optional(),
  deletedFiberPathIds: z.array(z.string().uuid()).optional(),
});

const patchVersionContextSchema = z.object({
  context: z.record(z.unknown()),
});

const createFloorPlanEquipmentSchema = z.object({
  name: z.string().min(1, '이름은 필수입니다.').max(100),
  model: z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  positionX: z.number(),
  positionY: z.number(),
  width2d: z.number().positive().optional(),
  height2d: z.number().positive().optional(),
  rotation: z.number().int().optional(),
  heightU: z.number().int().min(1).max(12).optional(),
  height3d: z.number().positive().optional(),
  category: z.enum(['SERVER', 'NETWORK', 'STORAGE', 'CHARGER', 'UPS', 'SECURITY', 'OTHER', 'DISTRIBUTION_BOARD', 'OFD']).optional(),
  installDate: z.string().optional(),
  manager: z.string().max(100).optional(),
  description: z.string().optional(),
  properties: z.unknown().optional(),
  materialCategoryId: z.string().uuid().optional(),
  specParams: z.any().optional(),
});

// ==================== Floor Routes ====================

// 층 기본 정보 조회 (인증 불필요)
router.get('/:id', floorController.getById);

// 층 도면 조회 (인증 불필요)
router.get('/:id/plan', floorController.getPlan);

// 층 메타데이터 수정 (관리자만)
router.put('/:id', authenticate, adminOnly, validate(updateFloorSchema), floorController.update);

// 층 도면 저장 (관리자만)
router.put('/:id/plan', authenticate, adminOnly, validate(bulkUpdatePlanSchema), floorController.bulkUpdatePlan);

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

// ==================== DWG Background Drawing ====================

// 도면(DWG/DXF) 임포트 (관리자만, multipart)
router.post(
  '/:id/background/import',
  authenticate,
  adminOnly,
  dwgUpload.single('file'),
  dwgImportController.import
);

// 임포트된 배경 도면 제거 (관리자만)
router.delete('/:id/background', authenticate, adminOnly, dwgImportController.clear);

// 배경 투명도 조정 (관리자만)
router.patch('/:id/background/opacity', authenticate, adminOnly, dwgImportController.setOpacity);

export { router as floorsRouter };

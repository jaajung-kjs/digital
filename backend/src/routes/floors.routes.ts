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

const equipmentKindEnum = z.enum(['RACK', 'OFD', 'DISTRIBUTION', 'GROUNDING', 'HVAC']);

const equipmentSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  tempId: z.string().optional(),
  kind: equipmentKindEnum,
  name: z.string().min(1).max(100),
  positionX: z.number(),
  positionY: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
  rotation: z.number().optional(),
  totalU: z.number().int().min(1).optional().nullable(),
  description: z.string().optional().nullable(),
  manager: z.string().optional().nullable(),
  height3d: z.number().optional().nullable(),
  properties: z.unknown().optional(),
});

// Endpoint id는 real uuid 또는 'temp-{uuid}' 둘 다 허용 — bulkUpdatePlan 트랜잭션이
// equipmentIdMap / rackModuleIdMap 으로 tempId를 resolve.
const endpointSchema = z.object({
  equipmentId: z.string().optional().nullable(),
  moduleId: z.string().optional().nullable(),
});

const cableSchema = z.object({
  id: z.string().nullish(),
  source: endpointSchema,
  target: endpointSchema,
  cableType: z.enum(['AC', 'DC', 'LAN', 'FIBER', 'GROUND']),
  label: z.string().nullish(),
  length: z.number().nullish(),
  color: z.string().nullish(),
  description: z.string().nullish(),
  // fiberPathId 도 tempId 가능 (새 광경로) — fiberPathIdMap 으로 resolve.
  fiberPathId: z.string().nullish(),
  fiberPortNumber: z.number().int().min(1).max(48).nullish(),
  categoryId: z.string().uuid().nullish(),
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

const rackModuleSchema = z.object({
  id: z.string().optional().nullable(),
  tempId: z.string().optional(),
  rackEquipmentId: z.string(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(100),
  startU: z.number().int().min(1),
  heightU: z.number().int().min(1),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  properties: z.unknown().optional(),
  sortOrder: z.number().int().optional(),
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
  rackModules: z.array(rackModuleSchema).optional(),
  cables: z.array(cableSchema).optional(),
  fiberPaths: z.array(fiberPathSchema).optional(),
  deletedFiberPathIds: z.array(z.string().uuid()).optional(),
});

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

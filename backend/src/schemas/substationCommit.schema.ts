import { z } from 'zod';

/**
 * 통합 변전소 커밋 입력 스키마 (SSOT-2a).
 *
 * 도면 위 5종 배치형 Asset(설비) + 케이블 + 랙 모듈 + 광경로를
 * 하나의 delta(creates/updates/deletes) 페이로드로 묶어 단일 트랜잭션 커밋.
 * (분전 회로 feeder/branch 는 Asset 이므로 assets 컬렉션으로 들어온다.)
 *
 * - 각 *Create 는 `tempId` 를 가진다. 커밋 시 real id 로 치환되어 idMap 으로 반환.
 * - 다른 엔티티 참조(equipmentId, rackEquipmentId, distributionEquipmentId,
 *   source/target id, ofdAId/ofdBId, fiberPathId)는 `z.string()` — real id 이거나
 *   같은 페이로드 안의 tempId(커밋 시점 resolve)일 수 있다.
 * - specParams / properties / attributes / pathPoints 같은 free-form JSON 은
 *   over-constrain 을 피하려 `z.unknown()`.
 *
 * 필드명은 기존 floor.service.ts `UpdatePlanInput` / assetCommit.service.ts
 * `AssetCommitInput` 의 실제 입력 형태를 그대로 따른다.
 */

/** OCC 참조 — delete 또는 update 대상의 낙관적 동시성 토큰. */
const occRef = z.object({ id: z.string(), baseVersion: z.string().nullable() });

/** creates / updates / deletes 3-bucket delta 컬렉션 헬퍼. */
function collection<C extends z.ZodTypeAny, P extends z.ZodTypeAny>(create: C, patch: P) {
  return z.object({
    creates: z.array(create).optional().default([]),
    updates: z
      .array(z.object({ id: z.string(), baseVersion: z.string().nullable(), patch }))
      .optional()
      .default([]),
    deletes: z.array(occRef).optional().default([]),
  });
}

// ==================== Asset (register fields + placement) ====================
// register 필드는 AssetCommitInput.creates, placement 는 Asset 의 floorId/
// positionX/positionY/width2d/height2d/rotation/totalU 컬럼. placement 는 선택.
// 자산/랙모듈 공통 스칼라 필드(SSOT) — asset/rackModule 스키마가 같은 정의를 공유해서
// 한 필드를 한 곳에만 적으면 양쪽에 반영된다(한쪽에서 빠져 Zod 가 strip → 드롭되던 버그 차단).
/**
 * 자산 스칼라 필드의 SINGLE SOURCE OF TRUTH (P5b).
 *
 * 새 스칼라 컬럼을 추가하려면 이 배열에 한 줄만 append 하면 된다.
 * - Zod shape(`assetCommonFields`)
 * - 서비스의 create data(`assetCommonCreate`)
 * - 서비스의 update data(`assetCommonUpdate`)
 * 셋 다 이 리스트로부터 파생된다.
 *
 * 각 entry: { key, kind, nullable, optionalOnCreate? }
 *  - kind: 'string' | 'date' | 'number' (date 는 wire 상 ISO 문자열 → z.string())
 *  - nullable: false 면 NOT NULL (create 필수, update 는 항상 partial 이라 무관)
 *  - optionalOnCreate: true 면 Zod 에서 `.optional()` (nullable=false 라도)
 */
export const ASSET_SCALAR_FIELDS = [
  { key: 'name', kind: 'string', nullable: false },
  { key: 'installDate', kind: 'date', nullable: true },
  { key: 'manager', kind: 'string', nullable: true },
  { key: 'description', kind: 'string', nullable: true },
  { key: 'status', kind: 'string', nullable: true },
  { key: 'warrantyUntil', kind: 'date', nullable: true },
  { key: 'replaceDue', kind: 'date', nullable: true },
  { key: 'sortOrder', kind: 'number', nullable: false, optionalOnCreate: true },
] as const;

/** kind → 기본 Zod 타입(date 는 wire 상 ISO 문자열이라 z.string()). */
function baseZod(kind: 'string' | 'date' | 'number') {
  return kind === 'number' ? z.number() : z.string();
}

const assetCommonFields = Object.fromEntries(
  ASSET_SCALAR_FIELDS.map((f) => {
    let schema: z.ZodTypeAny = baseZod(f.kind);
    // 현재 스키마 재현: nullable 필드는 .nullable().optional(),
    // NOT NULL 필드는 required (단 optionalOnCreate=true 면 .optional()).
    if (f.nullable) schema = schema.nullable().optional();
    else if ('optionalOnCreate' in f && f.optionalOnCreate) schema = schema.optional();
    return [f.key, schema];
  }),
) as {
  name: z.ZodString;
  installDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  manager: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  warrantyUntil: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  replaceDue: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  sortOrder: z.ZodOptional<z.ZodNumber>;
};

const assetCreate = z.object({
  tempId: z.string(),
  assetTypeId: z.string(),
  // 전역 커밋: 신규 자산은 자기 substationId 를 싣는다(노드는 어느 변전소든 한 커밋에).
  // 구 per-변전소 라우트는 생략 가능(URL substationId 폴백).
  substationId: z.string().optional(),
  ...assetCommonFields,
  parentAssetId: z.string().nullable().optional(),
  roomText: z.string().nullable().optional(),
  // sourcePresetId 전용 컬럼(상세패널 오버홀 S3). attributes 는 프론트(S4 이전)가
  // properties↔attributes 라운드트립으로 보내는 free-form JSON 호환 — sourcePresetId 만 추출.
  sourcePresetId: z.string().nullable().optional(),
  attributes: z.unknown().optional(),
  // placement (도면 미배치 Asset 은 모두 생략 가능)
  floorId: z.string().nullable().optional(),
  positionX: z.number().nullable().optional(),
  positionY: z.number().nullable().optional(),
  width2d: z.number().nullable().optional(),
  height2d: z.number().nullable().optional(),
  rotation: z.number().optional(),
  totalU: z.number().nullable().optional(),
  slotIndex: z.number().nullable().optional(),
  slotSpan: z.number().nullable().optional(),
});
const assetPatch = assetCreate.omit({ tempId: true }).partial();

// ==================== Cable ====================
// 단계4b(통합 노드 collapse): endpoint = 단일 Asset 노드(설비 / 랙 모듈 / 분전 분기).
// nested source/target(equipmentId/moduleId/circuitId) + distribution-circuit 커밋
// 경로는 제거됐다 — endpoint 는 sourceAssetId/targetAssetId 하나뿐. create 는 필수,
// patch 는 partial. tempId 는 같은 페이로드의 asset/cable create 를 가리킬 수 있다.
const cableCreate = z.object({
  tempId: z.string(),
  sourceAssetId: z.string(),
  targetAssetId: z.string(),
  cableType: z.enum(['AC', 'DC', 'LAN', 'FIBER', 'GROUND']),
  label: z.string().nullable().optional(),
  length: z.number().nullable().optional(),
  color: z.string().nullable().optional(),
  fiberPathId: z.string().nullable().optional(),
  fiberPortNumber: z.number().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  specParams: z.unknown().optional(),
  pathPoints: z.unknown().optional(),
  pathLength: z.number().nullable().optional(),
  bufferLength: z.number().nullable().optional(),
  totalLength: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
});
const cablePatch = cableCreate.omit({ tempId: true }).partial();

// ==================== FiberPath ====================
// floor.service.ts UpdatePlanInput.fiberPaths 형태 그대로.
const fiberPathCreate = z.object({
  tempId: z.string(),
  ofdAId: z.string(),
  ofdBId: z.string(),
  portCount: z.number(),
  description: z.string().nullable().optional(),
});
const fiberPathPatch = fiberPathCreate.omit({ tempId: true }).partial();

// ==================== FiberCore (광코어 희소 메타) ====================
const fiberCoreCreate = z.object({
  tempId: z.string(),
  fiberPathId: z.string(), // real id 또는 같은 커밋의 fiberPath tempId
  coreNumber: z.number(),
  purpose: z.string().nullable().optional(),
  circuitText: z.string().nullable().optional(),
  spliceType: z.string().nullable().optional(),
  usageOverride: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
const fiberCorePatch = fiberCoreCreate.omit({ tempId: true }).partial();

// ==================== Records (asset-owned sub-records) ====================
// 점검/고장이력/사진은 자산이 소유한 단일 records 컬렉션 — recordType 으로 구분.
// create 는 tempId + assetId(같은 페이로드 asset tempId 가능) + recordType + 종류별 필드(passthrough).
// 사진 바이너리는 커밋 직전 업로드(/uploads/photo)해 imageUrl 로 참조 — 커밋은 메타데이터만 트랜잭션.
// update/delete 는 recordType 으로 대상 테이블(inspection/maintenance/photo)을 라우팅한다.
// recordType = 자산 기록 테이블명(DB-구동). 서비스가 assetRecordSchema 로 모델을 해소·검증한다
// (고정 enum 없음 — DB 에 자산 기록 테이블이 생기면 코드 수정 없이 받는다).
const recordTypeKey = z.string();
const recordCreate = z
  .object({ tempId: z.string(), assetId: z.string(), recordType: recordTypeKey })
  .passthrough();
const recordsCollection = z.object({
  creates: z.array(recordCreate).optional().default([]),
  updates: z
    .array(z.object({ id: z.string(), recordType: recordTypeKey, baseVersion: z.string().nullable(), patch: z.record(z.unknown()) }))
    .optional()
    .default([]),
  deletes: z
    .array(z.object({ id: z.string(), recordType: recordTypeKey, baseVersion: z.string().nullable() }))
    .optional()
    .default([]),
});

// ==================== Unified commit ====================
export const substationCommitSchema = z.object({
  assets: collection(assetCreate, assetPatch).optional(),
  cables: collection(cableCreate, cablePatch).optional(),
  records: recordsCollection.optional(),
  // 분전 회로(feeder/branch)는 통합 노드 모델에서 Asset(자식) 이므로 assets 컬렉션으로
  // 커밋된다 — 별도 distributionCircuits 컬렉션 없음(단계3b/4b).
  fiberPaths: collection(fiberPathCreate, fiberPathPatch).optional(),
  fiberCores: collection(fiberCoreCreate, fiberCorePatch).optional(),
  floor: z
    .object({
      id: z.string(),
      baseVersion: z.string().nullable(),
      settings: z
        .object({
          canvasWidth: z.number().optional(),
          canvasHeight: z.number().optional(),
          gridSize: z.number().optional(),
          majorGridSize: z.number().optional(),
          backgroundOpacity: z.number().optional(),
          // 3-state: undefined = 변경 없음, null = 제거, object = 교체.
          backgroundDrawing: z.unknown().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type SubstationCommitInput = z.infer<typeof substationCommitSchema>;

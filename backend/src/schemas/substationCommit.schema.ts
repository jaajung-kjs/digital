import { z } from 'zod';

/**
 * 통합 변전소 커밋 입력 스키마 (SSOT-2a).
 *
 * 도면 위 5종 배치형 Asset(설비) + 케이블 + 랙 모듈 + 분전반 회로 + 광경로를
 * 하나의 delta(creates/updates/deletes) 페이로드로 묶어 단일 트랜잭션 커밋.
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
const assetCreate = z.object({
  tempId: z.string(),
  assetTypeId: z.string(),
  name: z.string(),
  parentAssetId: z.string().nullable().optional(),
  roomText: z.string().nullable().optional(),
  attributes: z.unknown().optional(),
  installDate: z.string().nullable().optional(),
  manager: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  warrantyUntil: z.string().nullable().optional(),
  replaceDue: z.string().nullable().optional(),
  // placement (도면 미배치 Asset 은 모두 생략 가능)
  floorId: z.string().nullable().optional(),
  positionX: z.number().nullable().optional(),
  positionY: z.number().nullable().optional(),
  width2d: z.number().nullable().optional(),
  height2d: z.number().nullable().optional(),
  rotation: z.number().optional(),
  totalU: z.number().nullable().optional(),
});
const assetPatch = assetCreate.omit({ tempId: true }).partial();

// ==================== Cable ====================
// floor.service.ts PlanCableInput 형태 그대로. endpoint 는 nested source/target.
const cableEndpoint = z.object({
  equipmentId: z.string().nullable().optional(),
  moduleId: z.string().nullable().optional(),
  circuitId: z.string().nullable().optional(),
});
const cableCreate = z.object({
  tempId: z.string(),
  source: cableEndpoint,
  target: cableEndpoint,
  // 단계2(통합 노드) forward-compat: endpoint 를 단일 Asset 노드로 직접 지정.
  // 제공 시 canonical 로 사용 — *_asset_id 컬럼을 세우고 asset kind 로 legacy
  // (equipment/module) 컬럼을 파생한다. nested source/target 도 계속 수용(현 프론트).
  sourceAssetId: z.string().nullable().optional(),
  targetAssetId: z.string().nullable().optional(),
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

// ==================== RackModule ====================
// floor.service.ts PlanRackModuleInput 형태 그대로.
const rackModuleCreate = z.object({
  tempId: z.string(),
  rackEquipmentId: z.string(),
  categoryId: z.string(),
  name: z.string(),
  slotIndex: z.number(),
  slotSpan: z.number(),
  installDate: z.string().nullable().optional(),
  manager: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  properties: z.unknown().optional(),
  sortOrder: z.number().optional(),
});
const rackModulePatch = rackModuleCreate.omit({ tempId: true }).partial();

// ==================== DistributionCircuit ====================
// floor.service.ts PlanDistributionCircuitInput 형태 그대로.
const distCircuitCreate = z.object({
  tempId: z.string(),
  distributionEquipmentId: z.string(),
  feederName: z.string(),
  branchName: z.string(),
  description: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
});
const distCircuitPatch = distCircuitCreate.omit({ tempId: true }).partial();

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

// ==================== Unified commit ====================
export const substationCommitSchema = z.object({
  assets: collection(assetCreate, assetPatch).optional(),
  cables: collection(cableCreate, cablePatch).optional(),
  rackModules: collection(rackModuleCreate, rackModulePatch).optional(),
  distributionCircuits: collection(distCircuitCreate, distCircuitPatch).optional(),
  fiberPaths: collection(fiberPathCreate, fiberPathPatch).optional(),
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

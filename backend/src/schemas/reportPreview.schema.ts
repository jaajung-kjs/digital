import { z } from 'zod';

/**
 * 오버레이 기반 설계서 프리뷰 입력 스키마 (#3 Task 1).
 *
 * 활성 층 staged 변경을 dry-run 으로 보내 `calculateConstructionReport` 엔진의
 * 산출(설계서: diff/BOM/노무)을 받는다. DB 저장 없음(순수 계산).
 *
 * `changes` 는 엔진이 먹는 그대로의 before/after PlanSnapshot 쌍이다(활성 층에
 * 영향받는 설비·케이블만 추려서). 프론트 overlayToChanges(Task 2)가
 * saved+overlay 로 양쪽 스냅샷을 구성하며, 각 항목은 이미 자재코드·길이 등
 * 해석된 필드를 캐리한다(백엔드는 재해석하지 않음 — diff 는 항목 동등성으로 계산).
 *
 * 공유 모양: frontend/src/types/constructionReport.ts 의 PlanSnapshot/ReportOverrides.
 */

const equipmentSnapshotItem = z.object({
  id: z.string(),
  name: z.string(),
  // 자재코드 해소의 정본 — 백엔드가 assetTypeId → AssetType.code 로 해소한다.
  // staged-create 설비는 code 가 없고 assetTypeId 만 있으므로 필수 통로.
  assetTypeId: z.string().nullable().optional(),
  materialCategoryCode: z.string().nullable().optional(),
  materialCategoryName: z.string().nullable().optional(),
  specification: z.string().nullable().optional(),
  specParams: z.record(z.unknown()).nullable().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

const cableSnapshotItem = z.object({
  id: z.string(),
  cableType: z.string(),
  materialCategoryCode: z.string().nullable().optional(),
  materialCategoryName: z.string().nullable().optional(),
  specification: z.string().nullable().optional(),
  totalLength: z.number().nullable().optional(),
  sourceEquipmentId: z.string(),
  targetEquipmentId: z.string(),
  label: z.string().nullable().optional(),
});

const planSnapshot = z.object({
  equipment: z.array(equipmentSnapshotItem).default([]),
  cables: z.array(cableSnapshotItem).default([]),
});

/** 활성 층 staged 변경 — 엔진이 먹는 before/after 스냅샷 쌍. */
const changes = z.object({
  before: planSnapshot,
  after: planSnapshot,
});

/** frontend ReportOverrides 와 동일 — 수량 보정/수동 항목/철거/할증. */
const overrides = z.object({
  modifiedItems: z.array(z.object({ itemId: z.string(), quantity: z.number() })).default([]),
  addedItems: z
    .array(
      z.object({
        description: z.string(),
        materialCategoryCode: z.string().optional(),
        quantity: z.number(),
        unit: z.string(),
        laborHours: z.number().optional(),
      }),
    )
    .default([]),
  removedItemIds: z.array(z.string()).default([]),
  surcharges: z.array(z.string()).default([]),
});

export const reportPreviewSchema = z.object({
  floorId: z.string().uuid(),
  changes,
  overrides: overrides.optional(),
});

export type ReportPreviewInput = z.infer<typeof reportPreviewSchema>;

import { z } from 'zod';

/**
 * 오버레이 기반 설계서 프리뷰 입력 스키마 (#3 Task 1, updated Task 4).
 *
 * 활성 층 staged 변경을 dry-run 으로 보내 `calculateConstructionReport` 엔진의
 * 산출(설계서: diff/BOM/노무)을 받는다. DB 저장 없음(순수 계산).
 *
 * Task 4: 케이블 스냅샷에서 cableType/materialCategoryCode/label 제거 → categoryId+name.
 *         설비 스냅샷에서 materialCategoryCode/materialCategoryName/specification 제거.
 *
 * 공유 모양: frontend/src/types/constructionReport.ts 의 PlanSnapshot/ReportOverrides.
 */

const assetSnapshotItem = z.object({
  id: z.string(),
  name: z.string(),
  assetTypeId: z.string().nullable().optional(),
  specParams: z.record(z.unknown()).nullable().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

const cableSnapshotItem = z.object({
  id: z.string(),
  categoryId: z.string().nullable().optional(),
  name: z.string(),
  totalLength: z.number().nullable().optional(),
  sourceAssetId: z.string(),
  targetAssetId: z.string(),
});

const planSnapshot = z.object({
  assets: z.array(assetSnapshotItem).default([]),
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

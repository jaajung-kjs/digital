import { z } from 'zod';

/**
 * 작업지시서 아카이브 입력 스키마 (#3 Task 3).
 *
 * 커밋 성공 후 프론트가 PRE-commit 오버레이로 계산한 설계서(ConstructionReport)를
 * 그대로 AuditLog(work-order) 행으로 아카이브한다. 백엔드는 재계산하지 않고
 * 받은 report/overrides 를 context 에 저장만 한다(report-preview 엔진은 프론트가
 * 이미 호출).
 *
 * 공유 모양: frontend/src/types/constructionReport.ts 의 ConstructionReport/
 * ReportOverrides. 엔진 산출을 그대로 보관하므로 loose(passthrough) 로 받는다.
 */

const reportDiffItem = z.object({}).passthrough();
const reportBomItem = z.object({}).passthrough();
const reportLaborItem = z.object({}).passthrough();

const constructionReport = z.object({
  diff: z.array(reportDiffItem).default([]),
  bom: z.array(reportBomItem).default([]),
  labor: z.array(reportLaborItem).default([]),
  totalLaborHours: z.number().default(0),
});

const reportOverrides = z
  .object({
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
  })
  .passthrough();

export const createWorkOrderSchema = z.object({
  report: constructionReport,
  overrides: reportOverrides.optional(),
  summary: z
    .object({
      itemCount: z.number().int().min(0).optional(),
    })
    .passthrough()
    .optional(),
});

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

import { z } from 'zod';

/**
 * POST /api/trace — 서버 케이블 트레이스 요청 스키마.
 *
 * overlay.cables 는 substationCommit 의 케이블 delta 와 동형
 * (creates/updates/deletes 3-bucket). tempId 기반 교차해소 없이
 * 순수 트레이스용 what-if 오버레이만 담는다.
 */

const cableCreate = z.object({
  tempId: z.string(),
  sourceAssetId: z.string(),
  targetAssetId: z.string(),
  number: z.number().nullable().optional(),
  sourceRole: z.enum(['IN', 'OUT']).nullable().optional(),
  targetRole: z.enum(['IN', 'OUT']).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  specParams: z.unknown().optional(),
});

const cablePatch = cableCreate.omit({ tempId: true }).partial();

const occRef = z.object({ id: z.string(), baseVersion: z.string().nullable() });

const cableCollection = z.object({
  creates: z.array(cableCreate).optional().default([]),
  updates: z
    .array(z.object({ id: z.string(), baseVersion: z.string().nullable(), patch: cablePatch }))
    .optional()
    .default([]),
  deletes: z.array(occRef).optional().default([]),
});

export const traceRequestSchema = z.object({
  seedAssetId: z.string(),
  groupId: z.string(),
  overlay: z
    .object({
      cables: cableCollection.optional().default({ creates: [], updates: [], deletes: [] }),
      assets: z.array(z.object({ id: z.string(), role: z.string().nullable() })),
    })
    .optional(),
});

export type TraceRequestInput = z.infer<typeof traceRequestSchema>;

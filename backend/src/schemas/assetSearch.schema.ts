import { z } from 'zod';
import { AssetRole } from '@prisma/client';

const createSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  substationId: z.string(),
  substationName: z.string().nullable(),
});

// validate(schema) 는 req.body 를 직접 파싱한다(`{ body: ... }` 래핑 없음 — trace.schema 와 동일).
export const assetSearchSchema = z.object({
  role: z.nativeEnum(AssetRole).optional(),
  q: z.string().optional(),
  substationId: z.string().optional(),
  overlay: z
    .object({
      creates: z.array(createSchema),
      updates: z.array(z.object({ id: z.string(), name: z.string().optional(), substationName: z.string().nullable().optional() })),
      deletes: z.array(z.string()),
    })
    .optional(),
});

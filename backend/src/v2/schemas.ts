import { z } from 'zod';

export const idParamSchema = z.string().uuid();
export const orgNameSchema = z.object({ name: z.string().trim().min(1) });
export const orgPatchSchema = z
  .object({ name: z.string().trim().min(1).optional(), sortOrder: z.number().int().optional() })
  .refine((p) => p.name !== undefined || p.sortOrder !== undefined, { message: '변경할 필드가 없습니다' });
export const branchCreateSchema = orgNameSchema.extend({ headquartersId: z.string().uuid() });
export const substationCreateSchema = orgNameSchema.extend({ branchId: z.string().uuid() });
export const floorCreateSchema = orgNameSchema.extend({ substationId: z.string().uuid() });

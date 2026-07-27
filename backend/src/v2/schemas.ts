import { z } from 'zod';

export const orgNameSchema = z.object({ name: z.string().trim().min(1) });
export const orgPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
});
export const branchCreateSchema = orgNameSchema.extend({ headquartersId: z.string().uuid() });
export const substationCreateSchema = orgNameSchema.extend({ branchId: z.string().uuid() });
export const floorCreateSchema = orgNameSchema.extend({ substationId: z.string().uuid() });

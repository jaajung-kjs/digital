import { z } from 'zod';
export const assetRefsSchema = z.object({ ids: z.array(z.string()) });

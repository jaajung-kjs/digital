import { Router } from 'express';
import { z } from 'zod';
import { materialController } from '../controllers/material.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

const resolveSchema = z.object({
  categoryId: z.string().uuid(),
  specParams: z.record(z.union([z.string(), z.number()])),
});

router.post('/resolve', validate(resolveSchema), materialController.resolve);
router.get('/', materialController.getByCategoryId);

export const materialsRouter = router;

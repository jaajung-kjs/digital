import { Router } from 'express';
import { z } from 'zod';
import { assetCommitController } from '../controllers/assetCommit.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const commitSchema = z.object({
  creates: z.array(z.object({
    tempId: z.string(), assetTypeId: z.string().uuid(), name: z.string().min(1).max(100),
    parentAssetId: z.string().uuid().optional().nullable(), roomText: z.string().max(100).optional().nullable(),
    attributes: z.record(z.unknown()).optional().nullable(),
    installDate: z.string().date().optional().nullable(), manager: z.string().max(100).optional().nullable(),
    status: z.string().max(20).optional().nullable(),
    warrantyUntil: z.string().date().optional().nullable(), replaceDue: z.string().date().optional().nullable(),
  })).default([]),
  updates: z.array(z.object({
    id: z.string().uuid(), baseVersion: z.string().nullable(), patch: z.record(z.unknown()),
  })).default([]),
  deletes: z.array(z.object({ id: z.string().uuid(), baseVersion: z.string().nullable() })).default([]),
});

router.post('/:substationId/assets/commit', authenticate, adminOnly, validate(commitSchema), assetCommitController.commit);

export { router as assetCommitRouter };

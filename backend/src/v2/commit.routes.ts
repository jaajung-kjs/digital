import { Router } from 'express';
import { adminOnly, authenticate } from './auth.middleware.js';
import { commitSubstation } from './commit.service.js';
import { commitPayloadSchema } from './schemas.js';

export const commitRouter = Router();
commitRouter.use(authenticate);

commitRouter.put('/substations/:id/commit', adminOnly, async (req, res, next) => {
  try {
    const payload = commitPayloadSchema.parse(req.body);
    res.json(await commitSubstation(req.params.id, payload));
  } catch (e) {
    next(e);
  }
});

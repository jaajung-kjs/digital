import { Request, Response, NextFunction } from 'express';
import { assetCommitService } from '../services/assetCommit.service.js';

export const assetCommitController = {
  async commit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await assetCommitService.commit(req.params.substationId, req.body, userId);
      res.json({ data: result });
    } catch (error) { next(error); }
  },
};

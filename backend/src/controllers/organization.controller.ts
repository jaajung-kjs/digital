import { Request, Response, NextFunction } from 'express';
import { getOrgTree } from '../services/organizationTree.service.js';

export const organizationController = {
  async getTree(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await getOrgTree() });
    } catch (error) {
      next(error);
    }
  },
};

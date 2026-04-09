import { Request, Response, NextFunction } from 'express';
import { organizationService } from '../services/organization.service.js';

export const organizationController = {
  async reorder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, items } = req.body;
      await organizationService.reorder(type, items);
      res.json({ message: '순서가 변경되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

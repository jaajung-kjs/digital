import { Request, Response, NextFunction } from 'express';
import { commitCatalog } from '../services/catalogCommit.service.js';

export const catalogController = {
  async commit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await commitCatalog(req.body);
      res.json({ message: '저장되었습니다.' });
    } catch (e) { next(e); }
  },
};

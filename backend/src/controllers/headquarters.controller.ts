import { Request, Response, NextFunction } from 'express';
import { headquartersService } from '../services/headquarters.service.js';

export const headquartersController = {
  async getList(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await headquartersService.getList();
      res.json({ data: items });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const item = await headquartersService.create(req.body, userId);
      res.status(201).json({ data: item });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const item = await headquartersService.update(id, req.body, userId);
      res.json({ data: item });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await headquartersService.delete(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};

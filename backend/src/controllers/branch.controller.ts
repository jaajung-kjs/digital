import { Request, Response, NextFunction } from 'express';
import { branchService } from '../services/branch.service.js';

export const branchController = {
  async getList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { hqId } = req.params;
      const items = await branchService.getListByHeadquarters(hqId);
      res.json({ data: items });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { hqId } = req.params;
      const userId = req.user!.userId;
      const item = await branchService.create(hqId, req.body, userId);
      res.status(201).json({ data: item });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const item = await branchService.update(id, req.body, userId);
      res.json({ data: item });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await branchService.delete(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async getSubstations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { branchId } = req.params;
      const items = await branchService.getSubstations(branchId);
      res.json({ data: items });
    } catch (error) {
      next(error);
    }
  },
};

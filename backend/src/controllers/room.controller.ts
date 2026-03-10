import { Request, Response, NextFunction } from 'express';
import { roomService } from '../services/room.service.js';

export const roomController = {
  async getList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { floorId } = req.params;
      const rooms = await roomService.getListByFloor(floorId);
      res.json({ data: rooms });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const room = await roomService.getById(id);
      res.json({ data: room });
    } catch (error) {
      next(error);
    }
  },

  async getPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const plan = await roomService.getPlan(id);
      res.json({ data: plan });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const room = await roomService.update(id, req.body, userId);
      res.json({ data: room });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { floorId } = req.params;
      const userId = req.user!.userId;
      const room = await roomService.create(floorId, req.body, userId);
      res.status(201).json({ data: room });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await roomService.delete(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async bulkUpdatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const result = await roomService.bulkUpdatePlan(id, req.body, userId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
};

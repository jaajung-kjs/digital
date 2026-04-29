import { Request, Response, NextFunction } from 'express';
import { rackPresetService } from '../services/rackPreset.service.js';

export const rackPresetController = {
  /**
   * GET /api/rack-presets
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const presets = await rackPresetService.getAll();
      res.json({ data: presets });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/rack-presets/:id
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const preset = await rackPresetService.getById(id);
      res.json({ data: preset });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/rack-presets
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const created = await rackPresetService.create(req.body, userId);
      res.status(201).json({ data: created });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/rack-presets/:id
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const updated = await rackPresetService.update(id, req.body, userId);
      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/rack-presets/:id
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await rackPresetService.delete(id);
      res.json({ message: '랙 프리셋이 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

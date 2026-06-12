import { Request, Response, NextFunction } from 'express';
import { cableService } from '../services/cable.service.js';

export const cableController = {
  /**
   * GET /api/cables
   * 모든 케이블 조회
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cables = await cableService.getAll();

      res.json({ data: cables });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/cables/:id
   * 케이블 상세 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const cable = await cableService.getById(id);

      res.json({ data: cable });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/rooms/:floorId/connections
   * 실에 연결된 모든 케이블 조회
   */
  async getByFloorId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const cables = await cableService.getByFloorId(id);

      res.json({ data: cables });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/substations/:substationId/connections
   * 변전소에 연결된 모든 케이블 조회
   */
  async getBySubstation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await cableService.getBySubstationId(req.params.substationId) });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/assets/:assetId/connections
   * 자산에 연결된 모든 케이블 조회
   */
  async getByAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await cableService.getByAssetId(req.params.assetId) });
    } catch (error) {
      next(error);
    }
  },
};

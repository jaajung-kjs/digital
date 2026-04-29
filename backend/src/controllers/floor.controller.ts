import { Request, Response, NextFunction } from 'express';
import { floorService } from '../services/floor.service.js';

export const floorController = {
  /**
   * GET /api/substations/:substationId/floors
   * 변전소의 층 목록 조회
   */
  async getList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { substationId } = req.params;
      const floors = await floorService.getListBySubstation(substationId);
      res.json({ data: floors });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/floors/:id
   * 층 기본 정보 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const floor = await floorService.getById(id);
      res.json({ data: floor });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/floors/:id/plan
   * 층 도면(전체 캔버스 + 요소/장비/케이블) 조회
   */
  async getPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const version = req.query.version ? Number(req.query.version) : undefined;
      const plan = await floorService.getPlan(id, version);
      res.json({ data: plan });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/substations/:substationId/floors
   * 층 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { substationId } = req.params;
      const userId = req.user!.userId;
      const floor = await floorService.create(substationId, req.body, userId);
      res.status(201).json({ data: floor });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/floors/:id
   * 층 메타데이터 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const floor = await floorService.update(id, req.body, userId);
      res.json({ data: floor });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/floors/:id
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await floorService.delete(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/floors/:id/plan
   * 도면 전체 저장 (Git-like reconciliation)
   */
  async bulkUpdatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const result = await floorService.bulkUpdatePlan(id, req.body, userId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/floors/:id/versions
   * 도면 변경 이력
   */
  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const logs = await floorService.getAuditLogs(id);
      res.json({ data: logs });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/floors/:id/versions/:logId
   * 특정 변경 이력 스냅샷
   */
  async getAuditLogSnapshot(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, logId } = req.params;
      const result = await floorService.getAuditLogSnapshot(id, logId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/floors/:id/versions/:logId
   */
  async patchAuditLogContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, logId } = req.params;
      const { context } = req.body;
      const result = await floorService.patchAuditLogContext(id, logId, context);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/floors/:id/versions/:logId
   */
  async deleteAuditLog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { logId } = req.params;
      await floorService.deleteAuditLog(logId);
      res.json({ message: '변경 이력이 삭제되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};

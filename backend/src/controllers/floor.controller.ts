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

  /**
   * POST /api/floors/:id/work-orders
   * 커밋된 설계서를 작업지시서로 아카이브 (관리자만).
   */
  async createWorkOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { report, overrides, summary } = req.body;
      const result = await floorService.createWorkOrder(
        id,
        { report, overrides, summary },
        { userId: req.user?.userId, userName: req.user?.username },
      );
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/floors/:id/work-orders
   * 작업지시서 이력 목록.
   */
  async getWorkOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const list = await floorService.getWorkOrders(id);
      res.json({ data: list });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/floors/:id/work-orders/:workOrderId
   * 작업지시서 상세 (아카이브된 설계서 전체).
   */
  async getWorkOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, workOrderId } = req.params;
      const result = await floorService.getWorkOrder(id, workOrderId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
};

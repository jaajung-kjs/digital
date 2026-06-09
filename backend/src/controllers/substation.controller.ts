import { Request, Response, NextFunction } from 'express';
import { substationService } from '../services/substation.service.js';
import { commitSubstation } from '../services/substationCommit.service.js';
import { getWorkingCopy } from '../services/substationWorkingCopy.service.js';
import type { SubstationCommitInput } from '../schemas/substationCommit.schema.js';

export const substationController = {
  /**
   * GET /api/substations
   * 변전소 목록 조회
   */
  async getList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isActive = req.query.isActive === 'true'
        ? true
        : req.query.isActive === 'false'
          ? false
          : undefined;

      const substations = await substationService.getList(isActive);

      res.json({ data: substations });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/substations/:id
   * 변전소 상세 조회
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const substation = await substationService.getById(id);

      res.json({ data: substation });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/substations
   * 변전소 생성
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const substation = await substationService.create(req.body, userId);

      res.status(201).json({ data: substation });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/substations/:id
   * 변전소 수정
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const substation = await substationService.update(id, req.body, userId);

      res.json({ data: substation });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/substations/:id
   * 변전소 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await substationService.delete(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/substations/:substationId/commit
   * 통합 변전소 커밋 (SSOT-2a) — assets/cables/rackModules/distributionCircuits/
   * fiberPaths + 선택적 floor 를 단일 트랜잭션에 커밋. 입력은 validate 미들웨어에서
   * substationCommitSchema 로 검증됨. VersionConflictError → errorHandler → 409.
   */
  async commit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await commitSubstation(
        req.params.substationId,
        req.body as SubstationCommitInput,
        userId
      );

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/substations/:substationId/workingcopy
   * 통합 working-copy 벌크 로드 (SSOT-2b) — assets(배치 포함)/cables/
   * distributionCircuits/fiberPaths 전 컬렉션을 단일 응답으로 반환.
   */
  async getWorkingCopy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await getWorkingCopy(req.params.substationId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
};

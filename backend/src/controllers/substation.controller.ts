import { Request, Response, NextFunction } from 'express';
import { substationService } from '../services/substation.service.js';
import { commitSubstation } from '../services/substationCommit.service.js';
import { getWorkingCopy } from '../services/substationWorkingCopy.service.js';
import { reportPreview } from '../services/constructionReport.service.js';
import type { SubstationCommitInput } from '../schemas/substationCommit.schema.js';
import type { ReportPreviewInput } from '../schemas/reportPreview.schema.js';

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
   * POST /api/commit — 전역 커밋(변전소 스코프 없음).
   * 노드(자산)+엣지(케이블/광경로)+기록을 어느 변전소든 한 트랜잭션에 커밋한다.
   * 신규 자산은 자기 substationId 를 payload 에 싣는다(URL param 없음). 나머지는 commit() 과 동일.
   */
  async commitGlobal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await commitSubstation('', req.body as SubstationCommitInput, userId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/substations/:substationId/workingcopy
   * 통합 working-copy 벌크 로드 (SSOT-2b) — assets(배치 포함)/cables/
   * fiberPaths/fiberCores 전 컬렉션을 단일 응답으로 반환.
   */
  async getWorkingCopy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await getWorkingCopy(req.params.substationId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/substations/:id/report-preview
   * 오버레이(활성 층 staged 변경) → 설계서 dry-run 산출 (#3 Task 1).
   * authenticate 만(읽기/계산 — adminOnly 아님). 입력은 reportPreviewSchema 검증.
   * floor 가 해당 변전소 소유인지 확인 후 calculateConstructionReport 호출, DB 미저장.
   */
  async reportPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { floorId, changes, overrides } = req.body as ReportPreviewInput;
      const report = await reportPreview(req.params.id, floorId, changes, overrides);
      res.json({ data: report });
    } catch (error) {
      next(error);
    }
  },
};

import { Request, Response, NextFunction } from 'express';
import { trace } from '../services/trace.service.js';
import type { TraceRequestInput } from '../schemas/trace.schema.js';

export const traceController = {
  /**
   * POST /api/trace
   * committed 케이블 + 클라이언트 overlay(what-if)를 병합한 뒤
   * cableTrace 를 실행하여 연결 컴포넌트(nodeIds/cableIds/nodes/cables)를 반환.
   */
  async trace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as TraceRequestInput;
      const result = await trace(input);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
};

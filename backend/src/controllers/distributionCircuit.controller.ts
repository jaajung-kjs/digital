import { Request, Response, NextFunction } from 'express';
import { distributionCircuitService } from '../services/distributionCircuit.service.js';
import { ValidationError } from '../utils/errors.js';

export const distributionCircuitController = {
  /** GET /api/distribution-circuits?distributionId=xxx */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributionId =
        typeof req.query.distributionId === 'string' ? req.query.distributionId : undefined;
      if (!distributionId) {
        throw new ValidationError('distributionId 쿼리 파라미터가 필요합니다.');
      }
      const circuits = await distributionCircuitService.getByDistributionId(distributionId);
      res.json({ data: circuits });
    } catch (error) {
      next(error);
    }
  },
};

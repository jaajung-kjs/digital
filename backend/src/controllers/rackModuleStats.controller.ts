import { Request, Response, NextFunction } from 'express';
import { rackModuleStatsService, type NodeType } from '../services/rackModuleStats.service.js';
import { ValidationError } from '../utils/errors.js';

const NODE_TYPES: NodeType[] = ['headquarters', 'branch', 'substation'];

export const rackModuleStatsController = {
  async getNodeStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { nodeType, nodeId } = req.query;
      if (typeof nodeType !== 'string' || !NODE_TYPES.includes(nodeType as NodeType)) {
        throw new ValidationError('nodeType 은 headquarters | branch | substation 중 하나여야 합니다.');
      }
      if (typeof nodeId !== 'string' || !nodeId) {
        throw new ValidationError('nodeId 가 필요합니다.');
      }
      const stats = await rackModuleStatsService.getNodeStats(nodeType as NodeType, nodeId);
      res.json({ data: stats });
    } catch (error) {
      next(error);
    }
  },

  async getCategoryDistribution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { nodeType, nodeId, categoryId } = req.query;
      if (typeof nodeType !== 'string' || !NODE_TYPES.includes(nodeType as NodeType)) {
        throw new ValidationError('nodeType 은 headquarters | branch | substation 중 하나여야 합니다.');
      }
      if (typeof nodeId !== 'string' || !nodeId) {
        throw new ValidationError('nodeId 가 필요합니다.');
      }
      if (typeof categoryId !== 'string' || !categoryId) {
        throw new ValidationError('categoryId 가 필요합니다.');
      }
      const dist = await rackModuleStatsService.getCategoryDistribution(
        nodeType as NodeType,
        nodeId,
        categoryId,
      );
      res.json({ data: dist });
    } catch (error) {
      next(error);
    }
  },
};

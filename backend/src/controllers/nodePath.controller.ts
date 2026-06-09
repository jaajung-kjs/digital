import { Request, Response, NextFunction } from 'express';
import { nodePathService, PathNodeType } from '../services/nodePath.service.js';

const NODE_TYPES: PathNodeType[] = ['headquarters', 'branch', 'substation', 'floor'];

export const nodePathController = {
  async getNodePath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { nodeId } = req.params;
      const nodeType = req.query.nodeType as string;
      if (!NODE_TYPES.includes(nodeType as PathNodeType)) {
        res.status(400).json({ message: 'invalid nodeType' });
        return;
      }
      res.json({ data: await nodePathService.getNodePath(nodeType as PathNodeType, nodeId) });
    } catch (error) { next(error); }
  },
};

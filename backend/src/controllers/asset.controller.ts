import { Request, Response, NextFunction } from 'express';
import { assetService, NodeType } from '../services/asset.service.js';

const NODE_TYPES: NodeType[] = ['headquarters', 'branch', 'substation'];

export const assetController = {
  async listBySubstation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await assetService.listBySubstation(req.params.substationId) });
    } catch (error) { next(error); }
  },
  async listByNode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { nodeId } = req.params;
      const nodeType = req.query.nodeType as string;
      if (!NODE_TYPES.includes(nodeType as NodeType)) {
        res.status(400).json({ message: 'invalid nodeType' });
        return;
      }
      res.json({ data: await assetService.listByNode(nodeType as NodeType, nodeId) });
    } catch (error) { next(error); }
  },
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await assetService.getById(req.params.id) });
    } catch (error) { next(error); }
  },
  async listAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const assets = await assetService.listAllSlim();
      res.json({ data: assets });
    } catch (err) {
      next(err);
    }
  },
};

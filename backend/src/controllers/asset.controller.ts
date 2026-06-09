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
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      res.status(201).json({ data: await assetService.create(req.body, userId) });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      res.json({ data: await assetService.update(req.params.id, req.body, userId) });
    } catch (error) { next(error); }
  },
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await assetService.delete(req.params.id);
      res.json({ message: '자산이 삭제되었습니다.' });
    } catch (error) { next(error); }
  },
  async duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      res.status(201).json({ data: await assetService.duplicate(req.params.id, userId) });
    } catch (error) { next(error); }
  },
};

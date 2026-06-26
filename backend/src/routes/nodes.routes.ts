import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { assetController } from '../controllers/asset.controller.js';

const router = Router();

// 노드(본부/지사/변전소) 범위 자산 리스트 — ?nodeType=headquarters|branch|substation
router.get('/:nodeId/assets', authenticate, assetController.listByNode);

export { router as nodesRouter };

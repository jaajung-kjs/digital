import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { assetController } from '../controllers/asset.controller.js';
import { nodePathController } from '../controllers/nodePath.controller.js';

const router = Router();

// 노드(본부/지사/변전소) 범위 자산 리스트 — ?nodeType=headquarters|branch|substation
router.get('/:nodeId/assets', authenticate, assetController.listByNode);

// 노드 조상 경로(루트→노드) — ?nodeType=headquarters|branch|substation|floor — 트리 reveal용
router.get('/:nodeId/path', authenticate, nodePathController.getNodePath);

export { router as nodesRouter };

import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

export type PathNodeType = 'headquarters' | 'branch' | 'substation' | 'floor';

export interface NodePathItem {
  id: string;
  type: PathNodeType;
}

class NodePathService {
  /** 노드의 조상 경로(루트→노드)를 순서대로 반환 — 트리 reveal/expand/highlight 용. */
  async getNodePath(nodeType: PathNodeType, nodeId: string): Promise<NodePathItem[]> {
    switch (nodeType) {
      case 'headquarters': {
        const hq = await prisma.headquarters.findUnique({ where: { id: nodeId }, select: { id: true } });
        if (!hq) throw new NotFoundError('본부');
        return [{ id: hq.id, type: 'headquarters' }];
      }
      case 'branch': {
        const br = await prisma.branch.findUnique({
          where: { id: nodeId },
          select: { id: true, headquartersId: true },
        });
        if (!br) throw new NotFoundError('지사');
        return [
          { id: br.headquartersId, type: 'headquarters' },
          { id: br.id, type: 'branch' },
        ];
      }
      case 'substation': {
        const sub = await prisma.substation.findUnique({
          where: { id: nodeId },
          select: { id: true, branch: { select: { id: true, headquartersId: true } } },
        });
        if (!sub) throw new NotFoundError('변전소');
        if (!sub.branch) return [{ id: sub.id, type: 'substation' }];
        return [
          { id: sub.branch.headquartersId, type: 'headquarters' },
          { id: sub.branch.id, type: 'branch' },
          { id: sub.id, type: 'substation' },
        ];
      }
      case 'floor': {
        const floor = await prisma.floor.findUnique({
          where: { id: nodeId },
          select: {
            id: true,
            substation: { select: { id: true, branch: { select: { id: true, headquartersId: true } } } },
          },
        });
        if (!floor) throw new NotFoundError('층');
        const path: NodePathItem[] = [];
        if (floor.substation.branch) {
          path.push({ id: floor.substation.branch.headquartersId, type: 'headquarters' });
          path.push({ id: floor.substation.branch.id, type: 'branch' });
        }
        path.push({ id: floor.substation.id, type: 'substation' });
        path.push({ id: floor.id, type: 'floor' });
        return path;
      }
    }
  }
}

export const nodePathService = new NodePathService();

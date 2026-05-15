import prisma from '../config/prisma.js';
import { EquipmentKind } from '@prisma/client';
import { NotFoundError } from '../utils/errors.js';

export type NodeType = 'headquarters' | 'branch' | 'substation';

export interface CategoryCount {
  categoryId: string;
  code: string;
  name: string;
  displayColor: string | null;
  count: number;
}

export interface NodeStatsResponse {
  self: { total: number; byCategory: CategoryCount[] };
  /** viewingNode 의 직계 자식 합계. 자식이 floor 면 빈 배열. */
  children: { id: string; total: number }[];
}

/** 카테고리 클릭 시 inline 분포. 본부/지사 → 변전소, 변전소 → 랙. */
export type DistributionScope = 'substation' | 'rack';

export interface DistributionItem {
  id: string;
  name: string;
  count: number;
  /** scope='rack' 일 때만. navigate /floors/{floorId}/plan?equipmentId={id} 용. */
  floorId?: string;
}

export interface DistributionResponse {
  scope: DistributionScope;
  items: DistributionItem[];
}

class RackModuleStatsService {
  /**
   * 노드 (본부 / 지사 / 변전소) 하위의 RackModule 을 카테고리별로 집계.
   * 자식 합계도 같이 — 자식이 substation 까지만 의미 있고 floor 는 항상 빈 배열.
   */
  async getNodeStats(nodeType: NodeType, nodeId: string): Promise<NodeStatsResponse> {
    // 1) 노드 하위 floor id 전부 모음 (실제 모듈 집계 단위).
    const floorIds = await this.collectFloorIds(nodeType, nodeId);
    if (floorIds.length === 0) {
      // 노드 존재 자체는 보장. 모듈 없음 → 전부 0.
      await this.assertExists(nodeType, nodeId);
      return { self: { total: 0, byCategory: [] }, children: await this.childTotalsZero(nodeType, nodeId) };
    }

    // 2) 그 floor 들의 RACK equipment 산하 모듈을 categoryId 별로 groupBy.
    const rows = await prisma.rackModule.groupBy({
      by: ['categoryId'],
      where: {
        rack: { kind: EquipmentKind.RACK, floorId: { in: floorIds } },
      },
      _count: { _all: true },
    });

    // 3) category 메타 조회 (한 번에).
    const categoryIds = rows.map((r) => r.categoryId);
    const categories = await prisma.rackModuleCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, code: true, name: true, displayColor: true, sortOrder: true },
    });
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const byCategory: CategoryCount[] = rows
      .map((r) => {
        const cat = categoryById.get(r.categoryId);
        return {
          categoryId: r.categoryId,
          code: cat?.code ?? '',
          name: cat?.name ?? '(unknown)',
          displayColor: cat?.displayColor ?? null,
          sortOrder: cat?.sortOrder ?? 999,
          count: r._count._all,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ sortOrder: _s, ...rest }) => rest);

    const total = byCategory.reduce((s, c) => s + c.count, 0);

    return {
      self: { total, byCategory },
      children: await this.childTotals(nodeType, nodeId),
    };
  }

  /** 노드 직계 자식 각각의 모듈 합계. floor 자식은 빈 배열로. */
  private async childTotals(
    nodeType: NodeType,
    nodeId: string,
  ): Promise<{ id: string; total: number }[]> {
    if (nodeType === 'headquarters') {
      const branches = await prisma.branch.findMany({
        where: { headquartersId: nodeId },
        select: { id: true },
      });
      return Promise.all(
        branches.map(async (b) => ({ id: b.id, total: await this.countUnder('branch', b.id) })),
      );
    }
    if (nodeType === 'branch') {
      const subs = await prisma.substation.findMany({
        where: { branchId: nodeId },
        select: { id: true },
      });
      return Promise.all(
        subs.map(async (s) => ({ id: s.id, total: await this.countUnder('substation', s.id) })),
      );
    }
    // substation 의 자식 = floor → 통계 의미 없음.
    return [];
  }

  /** 자식이 존재해도 아직 모듈 없는 케이스 — 0으로 채워서 일관된 응답. */
  private async childTotalsZero(
    nodeType: NodeType,
    nodeId: string,
  ): Promise<{ id: string; total: number }[]> {
    if (nodeType === 'headquarters') {
      const branches = await prisma.branch.findMany({
        where: { headquartersId: nodeId },
        select: { id: true },
      });
      return branches.map((b) => ({ id: b.id, total: 0 }));
    }
    if (nodeType === 'branch') {
      const subs = await prisma.substation.findMany({
        where: { branchId: nodeId },
        select: { id: true },
      });
      return subs.map((s) => ({ id: s.id, total: 0 }));
    }
    return [];
  }

  /** 노드 하위 모듈 총 개수 (자식 카드 표시용). */
  private async countUnder(nodeType: NodeType, nodeId: string): Promise<number> {
    const floorIds = await this.collectFloorIds(nodeType, nodeId);
    if (floorIds.length === 0) return 0;
    return prisma.rackModule.count({
      where: { rack: { kind: EquipmentKind.RACK, floorId: { in: floorIds } } },
    });
  }

  /** 카테고리 클릭 시 어디에 얼마나 있는지 분포 — 본부/지사면 변전소, 변전소면 랙. */
  async getCategoryDistribution(
    nodeType: NodeType,
    nodeId: string,
    categoryId: string,
  ): Promise<DistributionResponse> {
    if (nodeType === 'substation') {
      // 자기 자신의 RACK 설비별 모듈 카운트.
      const racks = await prisma.equipment.findMany({
        where: { floor: { substationId: nodeId }, kind: EquipmentKind.RACK },
        select: {
          id: true,
          name: true,
          floorId: true,
          _count: { select: { modules: { where: { categoryId } } } },
        },
      });
      const items: DistributionItem[] = racks
        .filter((r) => r._count.modules > 0)
        .map((r) => ({ id: r.id, name: r.name, count: r._count.modules, floorId: r.floorId }))
        .sort((a, b) => b.count - a.count);
      return { scope: 'rack', items };
    }

    // 본부 / 지사: 변전소 단위 합계.
    const substations =
      nodeType === 'headquarters'
        ? await prisma.substation.findMany({
            where: { branch: { headquartersId: nodeId } },
            select: { id: true, name: true },
          })
        : await prisma.substation.findMany({
            where: { branchId: nodeId },
            select: { id: true, name: true },
          });

    const items = await Promise.all(
      substations.map(async (s) => {
        const count = await prisma.rackModule.count({
          where: {
            categoryId,
            rack: { kind: EquipmentKind.RACK, floor: { substationId: s.id } },
          },
        });
        return { id: s.id, name: s.name, count };
      }),
    );

    return {
      scope: 'substation',
      items: items.filter((i) => i.count > 0).sort((a, b) => b.count - a.count),
    };
  }

  private async collectFloorIds(nodeType: NodeType, nodeId: string): Promise<string[]> {
    if (nodeType === 'headquarters') {
      const floors = await prisma.floor.findMany({
        where: { substation: { branch: { headquartersId: nodeId } } },
        select: { id: true },
      });
      return floors.map((f) => f.id);
    }
    if (nodeType === 'branch') {
      const floors = await prisma.floor.findMany({
        where: { substation: { branchId: nodeId } },
        select: { id: true },
      });
      return floors.map((f) => f.id);
    }
    const floors = await prisma.floor.findMany({
      where: { substationId: nodeId },
      select: { id: true },
    });
    return floors.map((f) => f.id);
  }

  private async assertExists(nodeType: NodeType, nodeId: string): Promise<void> {
    if (nodeType === 'headquarters') {
      const hq = await prisma.headquarters.findUnique({ where: { id: nodeId }, select: { id: true } });
      if (!hq) throw new NotFoundError('본부');
    } else if (nodeType === 'branch') {
      const br = await prisma.branch.findUnique({ where: { id: nodeId }, select: { id: true } });
      if (!br) throw new NotFoundError('지사');
    } else {
      const sub = await prisma.substation.findUnique({ where: { id: nodeId }, select: { id: true } });
      if (!sub) throw new NotFoundError('변전소');
    }
  }
}

export const rackModuleStatsService = new RackModuleStatsService();

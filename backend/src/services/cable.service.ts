import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';
import type { AssetRole } from '@prisma/client';

// ==================== Types ====================

export interface CableEndpointRef {
  // 단계4b — endpoint 는 단일 Asset 노드. assetId 가 곧 정밀 endpoint id(설비/모듈/분기).
  assetId: string | null;
  name: string;
  role: AssetRole | null;
  floorId: string | null;
}

export interface CableDetail {
  id: string;
  source: CableEndpointRef;
  target: CableEndpointRef;
  // endpoint 의 단일 Asset id (source/target.assetId 와 동일 값, 평탄 노출).
  sourceAssetId: string | null;
  targetAssetId: string | null;
  sourceRole: 'IN' | 'OUT' | null;
  targetRole: 'IN' | 'OUT' | null;
  number: number | null;
  length: number | null;
  pathPoints: unknown;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  specification: string | null;
  specParams: unknown;
  pathLength: number | null;
  bufferLength: number;
  totalLength: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Helpers ====================

const cableInclude = {
  // 단계4b — endpoint = 단일 Asset 노드. source/target asset 만 조인한다.
  // floorId(직접 배치면 자신) + parent.floorId(모듈은 랙) + grandparent.floorId
  // (분기는 feeder→분전반) 까지 끌어와 endpoint 의 anchor floor 를 derive.
  sourceAsset: {
    select: {
      id: true,
      name: true,
      floorId: true,
      assetType: { select: { role: true } },
      parent: { select: { floorId: true, parent: { select: { floorId: true } } } },
    },
  },
  targetAsset: {
    select: {
      id: true,
      name: true,
      floorId: true,
      assetType: { select: { role: true } },
      parent: { select: { floorId: true, parent: { select: { floorId: true } } } },
    },
  },
  category: { select: { name: true, groupId: true, group: { select: { name: true, color: true } } } },
} as const;

// ==================== Service ====================

class CableService {
  async getAll(): Promise<CableDetail[]> {
    const cables = await prisma.cable.findMany({
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });
    return cables.map((c) => this.mapToDetail(c));
  }

  async getById(id: string): Promise<CableDetail> {
    const cable = await prisma.cable.findUnique({ where: { id }, include: cableInclude });
    if (!cable) throw new NotFoundError('케이블');
    return this.mapToDetail(cable);
  }

  /**
   * 도면(Floor) 에 연결된 모든 케이블 조회.
   * endpoint asset 의 anchor floor(자신 / 부모 랙 / 분기→피더→분전반)가 매칭되는 케이블.
   */
  async getByFloorId(floorId: string): Promise<CableDetail[]> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceAsset: { floorId } },
          { targetAsset: { floorId } },
          { sourceAsset: { parent: { floorId } } },
          { targetAsset: { parent: { floorId } } },
          { sourceAsset: { parent: { parent: { floorId } } } },
          { targetAsset: { parent: { parent: { floorId } } } },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  /**
   * 변전소(Substation) 에 연결된 모든 케이블 조회.
   * endpoint asset(설비/모듈/분기 — 모두 substationId 보유)이 이 변전소 소속인 케이블.
   */
  async getBySubstationId(substationId: string): Promise<CableDetail[]> {
    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceAsset: { substationId } },
          { targetAsset: { substationId } },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  /**
   * 특정 자산(Asset) 에 연결된 모든 케이블 조회.
   * 자산 자체, 또는 그 자산의 자식(모듈/피더) 및 손자(분기) endpoint 케이블.
   */
  async getByAssetId(assetId: string): Promise<CableDetail[]> {
    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceAssetId: assetId },
          { targetAssetId: assetId },
          { sourceAsset: { parentAssetId: assetId } },
          { targetAsset: { parentAssetId: assetId } },
          { sourceAsset: { parent: { parentAssetId: assetId } } },
          { targetAsset: { parent: { parentAssetId: assetId } } },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  // 내부 — endpoint asset → endpoint ref. assetId/name/role/floorId(anchor) 노출.
  private endpointFromIncluded(
    side: 'source' | 'target',
    c: any,
  ): CableEndpointRef {
    const asset = side === 'source' ? c.sourceAsset : c.targetAsset;
    if (!asset) return { assetId: null, name: '', role: null, floorId: null };
    const floorId =
      asset.floorId ?? asset.parent?.floorId ?? asset.parent?.parent?.floorId ?? null;
    return {
      assetId: asset.id,
      name: asset.name,
      role: (asset.assetType?.role ?? null) as AssetRole | null,
      floorId,
    };
  }

  private mapToDetail(c: any): CableDetail {
    return {
      id: c.id,
      source: this.endpointFromIncluded('source', c),
      target: this.endpointFromIncluded('target', c),
      sourceAssetId: c.sourceAssetId ?? null,
      targetAssetId: c.targetAssetId ?? null,
      sourceRole: (c.sourceRole ?? null) as 'IN' | 'OUT' | null,
      targetRole: (c.targetRole ?? null) as 'IN' | 'OUT' | null,
      number: c.number ?? null,
      length: c.length,
      pathPoints: c.pathPoints,
      description: c.description,
      categoryId: c.categoryId ?? null,
      categoryName: c.category?.name ?? null,
      groupId: c.category?.groupId ?? null,
      groupName: c.category?.group?.name ?? null,
      groupColor: c.category?.group?.color ?? null,
      specification: c.category?.name ?? null,
      specParams: c.specParams ?? null,
      pathLength: c.pathLength ?? null,
      bufferLength: c.bufferLength ?? 4,
      totalLength: c.totalLength ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

}

export const cableService = new CableService();

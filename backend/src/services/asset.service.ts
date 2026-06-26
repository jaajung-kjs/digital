import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

export interface SlimAsset {
  id: string;
  name: string;
  substationId: string;
  substationName: string | null;
  parentAssetId: string | null;
  role: string | null;
  /** OFD 내 슬롯 위치 — 경로슬롯 -N 순번 파생용(같은 대국 슬롯 정렬 기준). */
  slotIndex: number | null;
}

/** prisma asset row(assetType + substation 포함)을 trace 용 최소 필드로 좁힌다. 순수 함수. */
export function toSlimAsset(a: {
  id: string; name: string; substationId: string; parentAssetId: string | null;
  assetType: { role?: string | null };
  substation?: { name: string | null } | null;
  slotIndex?: number | null;
}): SlimAsset {
  return {
    id: a.id,
    name: a.name,
    substationId: a.substationId,
    substationName: a.substation?.name ?? null,
    parentAssetId: a.parentAssetId ?? null,
    role: a.assetType?.role ?? null,
    slotIndex: a.slotIndex ?? null,
  };
}

export interface AssetDetail {
  id: string;
  substationId: string;
  assetTypeId: string;
  assetType: { id: string; name: string };
  name: string;
  parentAssetId: string | null;
  floorId: string | null;
  roomText: string | null;
  sourcePresetId: string | null;
  installDate: Date | null;
  manager: string | null;
  description: string | null;
  status: string | null;
  sortOrder: number;
  updatedAt: string;
}

const assetInclude = {
  assetType: {
    select: { id: true, name: true },
  },
} satisfies Prisma.AssetInclude;

type AssetRow = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;

export type NodeType = 'headquarters' | 'branch' | 'substation';

export interface AssetListItem {
  id: string;
  name: string;
  assetTypeName: string;
  substationId: string;
  substationName: string;
  floorId: string | null;
  floorName: string | null;
  roomText: string | null;
  parentAssetId: string | null;
  parentName: string | null;
  parentFloorName: string | null;
  installDate: Date | null;
  manager: string | null;
  status: string | null;
  lastMaintenanceDate: Date | null;
}

/** 본부/지사/변전소 노드 아래의 모든 변전소 id 를 모은다 (rackModuleStats 의 계층 패턴과 동일). */
async function collectSubstationIds(nodeType: NodeType, nodeId: string): Promise<string[]> {
  if (nodeType === 'substation') return [nodeId];
  if (nodeType === 'branch') {
    const subs = await prisma.substation.findMany({ where: { branchId: nodeId }, select: { id: true } });
    return subs.map((s) => s.id);
  }
  const subs = await prisma.substation.findMany({
    where: { branch: { headquartersId: nodeId } },
    select: { id: true },
  });
  return subs.map((s) => s.id);
}

class AssetService {
  private mapToDetail(a: AssetRow): AssetDetail {
    return {
      id: a.id, substationId: a.substationId, assetTypeId: a.assetTypeId,
      assetType: {
        id: a.assetType.id, name: a.assetType.name,
      },
      name: a.name, parentAssetId: a.parentAssetId, floorId: a.floorId ?? null, roomText: a.roomText,
      sourcePresetId: a.sourcePresetId ?? null,
      installDate: a.installDate,
      manager: a.manager, description: a.description,
      status: a.status, sortOrder: a.sortOrder,
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  /** 전 변전소 자산을 trace 용 최소 필드로(전역 cableTrace 피드). */
  async listAllSlim(): Promise<SlimAsset[]> {
    const rows = await prisma.asset.findMany({
      select: {
        id: true, name: true, substationId: true, parentAssetId: true, slotIndex: true,
        assetType: { select: { role: true } },
        substation: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toSlimAsset);
  }

  /** 노드(본부/지사/변전소) 범위의 자산 리스트 — 설치장소·담당자·마지막 점검일 포함. */
  async listByNode(nodeType: NodeType, nodeId: string): Promise<AssetListItem[]> {
    const substationIds = await collectSubstationIds(nodeType, nodeId);
    if (substationIds.length === 0) return [];
    const rows = await prisma.asset.findMany({
      where: { substationId: { in: substationIds } },
      include: {
        assetType: { select: { name: true } },
        substation: { select: { name: true } },
        floor: { select: { name: true } },
        // 마지막 점검일 = 가장 최근 InspectionLog.inspectionDate (점검 전용 테이블).
        inspectionLogs: {
          orderBy: { inspectionDate: 'desc' },
          take: 1,
          select: { inspectionDate: true },
        },
      },
      orderBy: [{ substationId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    // 랙 모듈은 자체 floor 가 없으므로 부모 랙의 name·floor 를 보여준다.
    // 부모 랙은 같은 변전소 범위라 이미 rows 에 포함 → id 로 조회(추가 쿼리 없음).
    const byId = new Map(rows.map((r) => [r.id, r]));
    return rows.map((r) => {
      const parent = r.parentAssetId ? byId.get(r.parentAssetId) ?? null : null;
      return {
      id: r.id,
      name: r.name,
      assetTypeName: r.assetType.name,
      substationId: r.substationId,
      substationName: r.substation.name,
      floorId: r.floorId ?? null,
      floorName: r.floor?.name ?? null,
      roomText: r.roomText ?? null,
      parentAssetId: r.parentAssetId ?? null,
      parentName: parent?.name ?? null,
      parentFloorName: parent?.floor?.name ?? null,
      installDate: r.installDate,
      manager: r.manager,
      status: r.status,
      lastMaintenanceDate: r.inspectionLogs[0]?.inspectionDate ?? null,
      };
    });
  }

  async getById(id: string): Promise<AssetDetail> {
    const row = await prisma.asset.findUnique({ where: { id }, include: assetInclude });
    if (!row) throw new NotFoundError('자산');
    return this.mapToDetail(row);
  }
}

export const assetService = new AssetService();

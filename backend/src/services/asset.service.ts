import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

export interface CreateAssetInput {
  substationId: string;
  assetTypeId: string;
  name: string;
  parentAssetId?: string | null;
  roomText?: string | null;
  attributes?: Record<string, unknown> | null;
  installDate?: string | null;
  warrantyUntil?: string | null;
  replaceDue?: string | null;
  manager?: string | null;
  description?: string | null;
  status?: string | null;
}

export interface UpdateAssetInput {
  assetTypeId?: string;
  name?: string;
  parentAssetId?: string | null;
  roomText?: string | null;
  attributes?: Record<string, unknown> | null;
  installDate?: string | null;
  warrantyUntil?: string | null;
  replaceDue?: string | null;
  manager?: string | null;
  description?: string | null;
  status?: string | null;
}

export interface AssetDetail {
  id: string;
  substationId: string;
  assetTypeId: string;
  assetType: { id: string; code: string; name: string; group: string | null; displayColor: string | null; fieldTemplate: unknown | null };
  name: string;
  parentAssetId: string | null;
  floorId: string | null;
  roomText: string | null;
  attributes: Record<string, unknown> | null;
  installDate: Date | null;
  warrantyUntil: Date | null;
  replaceDue: Date | null;
  manager: string | null;
  description: string | null;
  status: string | null;
  sortOrder: number;
  updatedAt: string;
}

const assetInclude = {
  assetType: {
    select: { id: true, code: true, name: true, group: true, displayColor: true, fieldTemplate: true },
  },
} satisfies Prisma.AssetInclude;

type AssetRow = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;

export type NodeType = 'headquarters' | 'branch' | 'substation';

export interface AssetListItem {
  id: string;
  name: string;
  assetTypeName: string;
  assetTypeColor: string | null;
  substationId: string;
  substationName: string;
  floorId: string | null;
  floorName: string | null;
  roomText: string | null;
  installDate: Date | null;
  manager: string | null;
  status: string | null;
  warrantyUntil: Date | null;
  replaceDue: Date | null;
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
        id: a.assetType.id, code: a.assetType.code, name: a.assetType.name,
        group: a.assetType.group, displayColor: a.assetType.displayColor,
        fieldTemplate: a.assetType.fieldTemplate ?? null,
      },
      name: a.name, parentAssetId: a.parentAssetId, floorId: a.floorId ?? null, roomText: a.roomText,
      attributes: (a.attributes as Record<string, unknown> | null) ?? null,
      installDate: a.installDate, warrantyUntil: a.warrantyUntil, replaceDue: a.replaceDue,
      manager: a.manager, description: a.description,
      status: a.status, sortOrder: a.sortOrder,
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  async listBySubstation(substationId: string): Promise<AssetDetail[]> {
    const rows = await prisma.asset.findMany({
      where: { substationId },
      include: assetInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.mapToDetail(r));
  }

  /** 노드(본부/지사/변전소) 범위의 자산 리스트 — 설치장소·담당자·마지막 점검일 포함. */
  async listByNode(nodeType: NodeType, nodeId: string): Promise<AssetListItem[]> {
    const substationIds = await collectSubstationIds(nodeType, nodeId);
    if (substationIds.length === 0) return [];
    const rows = await prisma.asset.findMany({
      where: { substationId: { in: substationIds } },
      include: {
        assetType: { select: { name: true, displayColor: true } },
        substation: { select: { name: true } },
        floor: { select: { name: true } },
        // logType 은 String('MAINTENANCE'|'FAILURE'|'REPAIR'); 마지막 정기점검일을 위해 MAINTENANCE 만.
        maintenanceLogs: {
          where: { logType: 'MAINTENANCE' },
          orderBy: { logDate: 'desc' },
          take: 1,
          select: { logDate: true },
        },
      },
      orderBy: [{ substationId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      assetTypeName: r.assetType.name,
      assetTypeColor: r.assetType.displayColor ?? null,
      substationId: r.substationId,
      substationName: r.substation.name,
      floorId: r.floorId ?? null,
      floorName: r.floor?.name ?? null,
      roomText: r.roomText ?? null,
      installDate: r.installDate,
      manager: r.manager,
      status: r.status,
      warrantyUntil: r.warrantyUntil,
      replaceDue: r.replaceDue,
      lastMaintenanceDate: r.maintenanceLogs[0]?.logDate ?? null,
    }));
  }

  async getById(id: string): Promise<AssetDetail> {
    const row = await prisma.asset.findUnique({ where: { id }, include: assetInclude });
    if (!row) throw new NotFoundError('자산');
    return this.mapToDetail(row);
  }

  async create(input: CreateAssetInput, userId: string): Promise<AssetDetail> {
    const row = await prisma.asset.create({
      data: {
        substationId: input.substationId,
        assetTypeId: input.assetTypeId,
        name: input.name,
        parentAssetId: input.parentAssetId ?? null,
        roomText: input.roomText ?? null,
        attributes: (input.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
        installDate: input.installDate ? new Date(input.installDate) : null,
        warrantyUntil: input.warrantyUntil ? new Date(input.warrantyUntil) : null,
        replaceDue: input.replaceDue ? new Date(input.replaceDue) : null,
        manager: input.manager ?? null,
        description: input.description ?? null,
        status: input.status ?? null,
        createdById: userId,
        updatedById: userId,
      },
      include: assetInclude,
    });
    return this.mapToDetail(row);
  }

  async update(id: string, input: UpdateAssetInput, userId: string): Promise<AssetDetail> {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('자산');
    const row = await prisma.asset.update({
      where: { id },
      data: {
        assetTypeId: input.assetTypeId,
        name: input.name,
        parentAssetId: input.parentAssetId,
        roomText: input.roomText,
        attributes: (input.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
        installDate: input.installDate === undefined ? undefined : input.installDate ? new Date(input.installDate) : null,
        warrantyUntil: input.warrantyUntil === undefined ? undefined : input.warrantyUntil ? new Date(input.warrantyUntil) : null,
        replaceDue: input.replaceDue === undefined ? undefined : input.replaceDue ? new Date(input.replaceDue) : null,
        manager: input.manager,
        description: input.description,
        status: input.status,
        updatedById: userId,
      },
      include: assetInclude,
    });
    return this.mapToDetail(row);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('자산');
    await prisma.asset.delete({ where: { id } });
  }

  async duplicate(id: string, userId: string): Promise<AssetDetail> {
    const src = await prisma.asset.findUnique({ where: { id } });
    if (!src) throw new NotFoundError('자산');
    const row = await prisma.asset.create({
      data: {
        substationId: src.substationId,
        assetTypeId: src.assetTypeId,
        name: `${src.name.replace(/ \(복제\)$/, '')} (복제)`,
        parentAssetId: src.parentAssetId,
        roomText: src.roomText,
        attributes: (src.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
        installDate: src.installDate,
        warrantyUntil: src.warrantyUntil,
        replaceDue: src.replaceDue,
        manager: src.manager,
        description: src.description,
        status: src.status,
        createdById: userId,
        updatedById: userId,
      },
      include: assetInclude,
    });
    return this.mapToDetail(row);
  }
}

export const assetService = new AssetService();

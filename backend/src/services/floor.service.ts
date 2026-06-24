import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import {
  assetToPlanEquipment,
  type PlacementKind,
} from './assetPlanMapper.js';

// ==================== Types ====================

export interface FloorListItem {
  id: string;
  substationId: string;
  name: string;
  floorNumber: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface FloorDetailBasic {
  id: string;
  substationId: string;
  name: string;
  floorNumber: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PlanEquipmentDTO {
  id: string;
  kind: PlacementKind | null;
  name: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  totalU: number | null;
  description: string | null;
  manager: string | null;
  height3d: number | null;
  frontImageUrl: string | null;
  rearImageUrl: string | null;
  properties: unknown;
}

interface PlanCableDTO {
  id: string;
  // 단계4b(통합 노드): endpoint = 단일 Asset id.
  sourceAssetId: string | null;
  targetAssetId: string | null;
  label: string | null;
  length: number | null;
  color: string | null;
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
}

export interface FloorPlanDetail {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  majorGridSize: number;
  backgroundColor: string;
  scaleRatio: number | null;
  backgroundDrawing: unknown;
  backgroundOpacity: number;
  equipment: PlanEquipmentDTO[];
  cables: PlanCableDTO[];
  version: number;
  updatedAt: Date;
}

export interface CreateFloorInput {
  name: string;
  floorNumber?: string;
  description?: string;
}

export interface UpdateFloorInput {
  name?: string;
  floorNumber?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// ==================== Shared ====================

type FloorRecord = Prisma.FloorGetPayload<Record<string, never>>;

function toFloorDetailBasic(r: FloorRecord): FloorDetailBasic {
  return {
    id: r.id,
    substationId: r.substationId,
    name: r.name,
    floorNumber: r.floorNumber,
    description: r.description,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ==================== Service ====================

class FloorService {
  async getListBySubstation(substationId: string): Promise<FloorListItem[]> {
    const substation = await prisma.substation.findUnique({ where: { id: substationId } });
    if (!substation) throw new NotFoundError('변전소');

    const floors = await prisma.floor.findMany({
      where: { substationId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return floors.map((f) => ({
      id: f.id,
      substationId: f.substationId,
      name: f.name,
      floorNumber: f.floorNumber,
      description: f.description,
      sortOrder: f.sortOrder,
      isActive: f.isActive,
    }));
  }

  async getById(id: string): Promise<FloorDetailBasic> {
    const floor = await prisma.floor.findUnique({ where: { id } });
    if (!floor) throw new NotFoundError('층');
    return toFloorDetailBasic(floor);
  }

  async getPlan(id: string, version?: number): Promise<FloorPlanDetail> {
    if (version !== undefined) {
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'Floor', entityId: id, actionDetail: `v${version}` },
        select: { newValues: true },
      });
      if (!log?.newValues) throw new NotFoundError('해당 버전');
      const snapshot = log.newValues as any;
      if (snapshot.plan) {
        return {
          ...snapshot.plan,
          scaleRatio: snapshot.plan.scaleRatio ?? null,
          backgroundDrawing: snapshot.plan.backgroundDrawing ?? null,
          backgroundOpacity: snapshot.plan.backgroundOpacity ?? 0.3,
          cables: snapshot.cables ?? [],
        };
      }
      throw new NotFoundError('해당 버전');
    }

    const floor = await prisma.floor.findUnique({ where: { id } });
    if (!floor) throw new NotFoundError('층');

    const [equipmentAssets, cables] = await Promise.all([
      prisma.asset.findMany({
        where: { floorId: id, parentAssetId: null },
        include: { assetType: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.cable.findMany({
        // 단계4b — endpoint asset 의 anchor floor(자신/부모 랙/분기→피더→분전반)로 스코핑.
        where: {
          OR: [
            { sourceAsset: { floorId: id } },
            { targetAsset: { floorId: id } },
            { sourceAsset: { parent: { floorId: id } } },
            { targetAsset: { parent: { floorId: id } } },
            { sourceAsset: { parent: { parent: { floorId: id } } } },
            { targetAsset: { parent: { parent: { floorId: id } } } },
          ],
        },
        include: {
          category: { select: { name: true, groupId: true, group: { select: { name: true, color: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      id: floor.id,
      name: floor.name,
      canvasWidth: floor.canvasWidth,
      canvasHeight: floor.canvasHeight,
      gridSize: floor.gridSize,
      majorGridSize: floor.majorGridSize,
      backgroundColor: floor.backgroundColor,
      scaleRatio: floor.scaleRatio ?? null,
      backgroundDrawing: floor.backgroundDrawing,
      backgroundOpacity: floor.backgroundOpacity,
      equipment: equipmentAssets.map((a) => assetToPlanEquipment(a)),
      cables: cables.map((c) => ({
        id: c.id,
        sourceAssetId: c.sourceAssetId,
        targetAssetId: c.targetAssetId,
        label: c.label,
        length: c.length,
        color: c.color,
        pathPoints: c.pathPoints,
        description: c.description,
        categoryId: c.categoryId,
        categoryName: c.category?.name ?? null,
        groupId: c.category?.groupId ?? null,
        groupName: c.category?.group?.name ?? null,
        groupColor: c.category?.group?.color ?? null,
        specification: c.category?.name ?? null,
        specParams: c.specParams,
        pathLength: c.pathLength,
        bufferLength: c.bufferLength ?? 4,
        totalLength: c.totalLength,
      })),
      version: floor.version,
      updatedAt: floor.updatedAt,
    };
  }

  async create(substationId: string, input: CreateFloorInput, userId: string): Promise<FloorDetailBasic> {
    const substation = await prisma.substation.findUnique({ where: { id: substationId } });
    if (!substation) throw new NotFoundError('변전소');

    const existing = await prisma.floor.findFirst({
      where: { substationId, name: input.name },
    });
    if (existing) throw new ConflictError('동일한 이름의 층이 이미 존재합니다.');

    const created = await prisma.floor.create({
      data: {
        substationId,
        name: input.name,
        floorNumber: input.floorNumber,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
    });

    return toFloorDetailBasic(created);
  }

  async update(id: string, input: UpdateFloorInput, userId: string): Promise<FloorDetailBasic> {
    const existing = await prisma.floor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('층');

    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.floor.findFirst({
        where: { substationId: existing.substationId, name: input.name, id: { not: id } },
      });
      if (nameExists) throw new ConflictError('동일한 이름의 층이 이미 존재합니다.');
    }

    const updated = await prisma.floor.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });

    return toFloorDetailBasic(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.floor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('층');
    await prisma.floor.delete({ where: { id } });
  }

  async getAuditLogs(floorId: string) {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Floor', entityId: floorId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        entityName: true,
        action: true,
        actionDetail: true,
        changedFields: true,
        newValues: true,
        context: true,
        userName: true,
        createdAt: true,
      },
    });

    return logs.map(({ newValues, ...rest }) => {
      const versionMatch = rest.actionDetail?.match(/^v(\d+)$/);
      return {
        ...rest,
        hasSnapshot: newValues !== null,
        version: versionMatch ? parseInt(versionMatch[1], 10) : null,
      };
    });
  }

  async getAuditLogSnapshot(floorId: string, auditLogId: string) {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const log = await prisma.auditLog.findFirst({
      where: { id: auditLogId, entityType: 'Floor', entityId: floorId },
    });
    if (!log) throw new NotFoundError('변경 이력');

    const snapshot = log.newValues as any;
    if (!snapshot) {
      throw new ConflictError('이 버전에는 되돌리기 데이터가 없습니다.');
    }

    if (snapshot.plan) {
      return {
        plan: snapshot.plan,
        cables: snapshot.cables ?? [],
      };
    }

    throw new ConflictError('이 버전에는 되돌리기 데이터가 없습니다.');
  }

  async patchAuditLogContext(floorId: string, logId: string, context: Record<string, unknown>) {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const log = await prisma.auditLog.findFirst({
      where: { id: logId, entityType: 'Floor', entityId: floorId },
    });
    if (!log) throw new NotFoundError('변경 이력');

    const existingContext = (log.context as Record<string, unknown>) || {};
    const merged = { ...existingContext, ...context };

    await prisma.auditLog.update({
      where: { id: logId },
      data: { context: merged as any },
    });

    return { id: logId, context: merged };
  }

  async deleteAuditLog(logId: string) {
    const log = await prisma.auditLog.findUnique({ where: { id: logId } });
    if (!log) throw new NotFoundError('변경 이력');
    await prisma.auditLog.delete({ where: { id: logId } });
  }

  // ==================== Work Orders (작업지시서 아카이브) ====================
  // #3 Task 3 — 커밋 시 활성 층 설계서를 작업지시서로 아카이브한다.
  // AuditLog 재사용: entityType='Floor', action='WORK_ORDER',
  // context = { constructionReport, reportOverrides?, summary? }. 버전 스냅샷
  // (actionDetail='v{n}', newValues) 과 같은 테이블이지만 action 으로 구분된다.

  /** 커밋 후 계산된 설계서를 작업지시서 AuditLog 행으로 아카이브한다. */
  async createWorkOrder(
    floorId: string,
    input: {
      report: Record<string, unknown>;
      overrides?: Record<string, unknown>;
      summary?: Record<string, unknown>;
    },
    user?: { userId?: string; userName?: string },
  ) {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const context: Record<string, unknown> = {
      constructionReport: input.report,
    };
    if (input.overrides) context.reportOverrides = input.overrides;
    if (input.summary) context.summary = input.summary;

    const created = await prisma.auditLog.create({
      data: {
        entityType: 'Floor',
        entityId: floorId,
        entityName: floor.name,
        action: 'WORK_ORDER',
        context: context as Prisma.InputJsonValue,
        userId: user?.userId ?? null,
        userName: user?.userName ?? null,
      },
      select: { id: true, createdAt: true, userName: true, context: true },
    });

    return {
      id: created.id,
      createdAt: created.createdAt,
      userName: created.userName,
      summary: (created.context as Record<string, unknown>)?.summary ?? null,
    };
  }

  /** 작업지시서 목록 — 메타데이터만(설계서 본문은 상세 조회로). */
  async getWorkOrders(floorId: string) {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Floor', entityId: floorId, action: 'WORK_ORDER' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, userName: true, context: true },
    });

    return logs.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      userName: l.userName,
      summary: (l.context as Record<string, unknown>)?.summary ?? null,
    }));
  }

  /** 작업지시서 상세 — 아카이브된 설계서(ConstructionReport) 전체. */
  async getWorkOrder(floorId: string, workOrderId: string) {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const log = await prisma.auditLog.findFirst({
      where: { id: workOrderId, entityType: 'Floor', entityId: floorId, action: 'WORK_ORDER' },
      select: { id: true, createdAt: true, userName: true, context: true },
    });
    if (!log) throw new NotFoundError('작업지시서');

    const ctx = (log.context as Record<string, unknown>) ?? {};
    return {
      id: log.id,
      createdAt: log.createdAt,
      userName: log.userName,
      context: ctx,
      constructionReport: ctx.constructionReport ?? null,
      reportOverrides: ctx.reportOverrides ?? null,
      summary: ctx.summary ?? null,
    };
  }
}

export const floorService = new FloorService();

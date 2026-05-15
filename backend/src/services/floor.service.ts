import prisma from '../config/prisma.js';
import { Prisma, CableType, EquipmentKind } from '@prisma/client';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { equipmentService } from './equipment.service.js';
import { assertOfdFiberPath } from './cable.service.js';
import { assertNoSlotCollision, assertSlotValid } from './rackModule.service.js';
import {
  calculateConstructionReport,
  type PlanSnapshot,
} from './constructionReport.service.js';

/** Build specification string from specTemplate format + specParams */
function buildSpecification(specTemplate: unknown, specParams: unknown): string | null {
  if (!specTemplate || !specParams || typeof specTemplate !== 'object') return null;
  const tmpl = specTemplate as { format?: string };
  const params = specParams as Record<string, unknown>;
  if (!tmpl.format) return null;
  let result = tmpl.format;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, String(value ?? ''));
  }
  return result;
}

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
  kind: EquipmentKind;
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
  sourceEquipmentId: string | null;
  sourceModuleId: string | null;
  targetEquipmentId: string | null;
  targetModuleId: string | null;
  cableType: string;
  label: string | null;
  length: number | null;
  color: string | null;
  pathPoints: unknown;
  description: string | null;
  fiberPathId: string | null;
  fiberPortNumber: number | null;
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  displayColor: string | null;
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
  fiberPaths: {
    id: string;
    ofdAId: string;
    ofdBId: string;
    portCount: number;
    description: string | null;
  }[];
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

interface PlanEquipmentInput {
  id?: string | null;
  tempId?: string;
  kind: EquipmentKind;
  name: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation?: number;
  totalU?: number | null;
  description?: string | null;
  manager?: string | null;
  installDate?: string | null;
  height3d?: number | null;
  properties?: unknown;
}

interface PlanCableInput {
  id?: string | null;
  source: { equipmentId?: string | null; moduleId?: string | null };
  target: { equipmentId?: string | null; moduleId?: string | null };
  cableType: string;
  label?: string | null;
  length?: number | null;
  color?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  categoryId?: string | null;
  specParams?: unknown;
  pathPoints?: unknown;
  pathLength?: number | null;
  bufferLength?: number | null;
  totalLength?: number | null;
  description?: string | null;
}

/**
 * 랙 모듈 입력. rackEquipmentId 는 부모 랙의 real id 또는 input.equipment[].tempId.
 */
interface PlanRackModuleInput {
  id?: string | null;
  tempId?: string;
  rackEquipmentId: string;
  categoryId: string;
  name: string;
  slotIndex: number;
  slotSpan: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

/**
 * 분전반 회로 입력. distributionEquipmentId 는 부모 분전반의 real id 또는
 * input.equipment[].tempId.
 */
interface PlanDistributionCircuitInput {
  id?: string | null;
  tempId?: string;
  distributionEquipmentId: string;
  feederName: string;
  branchName: string;
  description?: string | null;
  sortOrder?: number;
}

/**
 * Minimal shape we rely on from the parsed DWG. The full BackgroundDrawing
 * lives in `dwgImport.service.ts`; everything beyond `bounds` and `source`
 * passes through verbatim to the JSON column.
 */
type BackgroundDrawingInput = {
  source: { fileName: string; importedAt: string; fileType: 'DWG' | 'DXF' };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  [k: string]: unknown;
};

export interface UpdatePlanInput {
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  majorGridSize?: number;
  backgroundColor?: string;
  scaleRatio?: number | null;
  backgroundOpacity?: number;
  /** 3-state: undefined = unchanged, null = clear, object = replace. */
  backgroundDrawing?: BackgroundDrawingInput | null;
  equipment?: PlanEquipmentInput[];
  rackModules?: PlanRackModuleInput[];
  distributionCircuits?: PlanDistributionCircuitInput[];
  cables?: PlanCableInput[];
  fiberPaths?: {
    id?: string;
    ofdAId: string;
    ofdBId: string;
    portCount: number;
    description?: string | null;
  }[];
  deletedFiberPathIds?: string[];
}

// ==================== Shared ====================

type FloorRecord = Prisma.FloorGetPayload<Record<string, never>>;
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRealId(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

const ACTION_DETAIL_MAX_LEN = 100;
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
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
          fiberPaths: snapshot.fiberPaths ?? [],
        };
      }
      throw new NotFoundError('해당 버전');
    }

    const floor = await prisma.floor.findUnique({ where: { id } });
    if (!floor) throw new NotFoundError('층');

    const [equipment, cables, ofdEquipment] = await Promise.all([
      prisma.equipment.findMany({
        where: { floorId: id },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.cable.findMany({
        where: {
          OR: [
            { sourceEquipment: { floorId: id } },
            { targetEquipment: { floorId: id } },
            { sourceModule: { rack: { floorId: id } } },
            { targetModule: { rack: { floorId: id } } },
          ],
        },
        include: {
          category: { select: { code: true, name: true, displayColor: true, specTemplate: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.equipment.findMany({
        where: { floorId: id, kind: EquipmentKind.OFD },
        select: { id: true },
      }),
    ]);

    const ofdIds = ofdEquipment.map((e) => e.id);
    const fiberPaths = ofdIds.length > 0
      ? await prisma.fiberPath.findMany({
          where: { OR: [{ ofdAId: { in: ofdIds } }, { ofdBId: { in: ofdIds } }] },
          select: { id: true, ofdAId: true, ofdBId: true, portCount: true, description: true },
        })
      : [];

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
      equipment: equipment.map((e) => ({
        id: e.id,
        kind: e.kind,
        name: e.name,
        positionX: e.positionX,
        positionY: e.positionY,
        width: e.width2d,
        height: e.height2d,
        rotation: e.rotation,
        totalU: e.totalU,
        description: e.description,
        manager: e.manager,
        installDate: e.installDate?.toISOString().slice(0, 10) ?? null,
        height3d: e.height3d,
        frontImageUrl: e.frontImageUrl,
        rearImageUrl: e.rearImageUrl,
        properties: e.properties,
      })),
      cables: cables.map((c) => ({
        id: c.id,
        sourceEquipmentId: c.sourceEquipmentId,
        sourceModuleId: c.sourceModuleId,
        targetEquipmentId: c.targetEquipmentId,
        targetModuleId: c.targetModuleId,
        cableType: c.cableType,
        label: c.label,
        length: c.length,
        color: c.color,
        pathPoints: c.pathPoints,
        description: c.description,
        fiberPathId: c.fiberPathId,
        fiberPortNumber: c.fiberPortNumber,
        categoryId: c.categoryId,
        categoryCode: c.category?.code ?? null,
        categoryName: c.category?.name ?? null,
        displayColor: c.category?.displayColor ?? null,
        specification: buildSpecification(c.category?.specTemplate, c.specParams),
        specParams: c.specParams,
        pathLength: c.pathLength,
        bufferLength: c.bufferLength ?? 4,
        totalLength: c.totalLength,
      })),
      fiberPaths,
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

  /**
   * 도면 전체 저장 — State Reconciliation.
   *
   * 입력에는 도면 위 5종 객체(Equipment) + 케이블 + 광경로가 포함된다.
   * RackModule 은 이 엔드포인트 범위 밖 (P7 별도 입력으로 처리 예정).
   */
  async bulkUpdatePlan(
    id: string,
    input: UpdatePlanInput,
    userId: string
  ): Promise<{
    id: string;
    version: number;
    message: string;
    equipmentIdMap: Record<string, string>;
    rackModuleIdMap: Record<string, string>;
    distCircuitIdMap: Record<string, string>;
    fiberPathIdMap: Record<string, string>;
    auditLogId: string | null;
    constructionReport: ReturnType<typeof calculateConstructionReport> | null;
  }> {
    const floor = await prisma.floor.findUnique({ where: { id } });
    if (!floor) throw new NotFoundError('층');

    let newVersion = floor.version;
    const equipmentIdMap: Record<string, string> = {};
    const rackModuleIdMap: Record<string, string> = {};
    const distCircuitIdMap: Record<string, string> = {};
    let finalFiberPathIdMap: Record<string, string> = {};
    let auditLogId: string | null = null;
    let finalConstructionReport: ReturnType<typeof calculateConstructionReport> | null = null;

    await prisma.$transaction(async (tx) => {
      // ── Step 0: load current state ──
      const [dbEquipment, dbCables, dbRackModules, dbDistCircuits] = await Promise.all([
        tx.equipment.findMany({ where: { floorId: id } }),
        tx.cable.findMany({
          where: {
            OR: [
              { sourceEquipment: { floorId: id } },
              { targetEquipment: { floorId: id } },
              { sourceModule: { rack: { floorId: id } } },
              { targetModule: { rack: { floorId: id } } },
            ],
          },
          include: {
            category: { select: { code: true, name: true, displayColor: true, specTemplate: true } },
          },
        }),
        tx.rackModule.findMany({
          where: { rack: { floorId: id } },
        }),
        tx.distributionCircuit.findMany({
          where: { distribution: { floorId: id } },
        }),
      ]);

      const dbEquipmentIds = new Set(dbEquipment.map((e) => e.id));
      const dbEquipmentMap = new Map(dbEquipment.map((e) => [e.id, e]));
      const dbCableIds = new Set(dbCables.map((c) => c.id));
      const dbRackModuleIds = new Set(dbRackModules.map((m) => m.id));
      const dbDistCircuitIds = new Set(dbDistCircuits.map((c) => c.id));

      // ── Step 1: reconciliation diffs ──
      const receivedEquipmentIds = new Set(
        (input.equipment ?? []).filter((e) => isRealId(e.id)).map((e) => e.id!)
      );
      const deleteEquipmentIds = [...dbEquipmentIds].filter((eid) => !receivedEquipmentIds.has(eid));

      const receivedCableIds = new Set(
        (input.cables ?? []).filter((c) => isRealId(c.id)).map((c) => c.id!)
      );
      const deleteCableIds = [...dbCableIds].filter((cid) => !receivedCableIds.has(cid));

      // RackModules: input.rackModules undefined → 기존 유지 (full-replace 의도가 없는 경우).
      //              input.rackModules 가 배열이면 reconciliation (없는 항목은 delete).
      const rackModulesReceived = Array.isArray(input.rackModules);
      const receivedRackModuleIds = rackModulesReceived
        ? new Set(input.rackModules!.filter((m) => isRealId(m.id)).map((m) => m.id!))
        : new Set<string>();
      const deleteRackModuleIds = rackModulesReceived
        ? [...dbRackModuleIds].filter((mid) => !receivedRackModuleIds.has(mid))
        : [];

      // DistributionCircuits: rackModules 와 동일한 reconciliation 규칙.
      const distCircuitsReceived = Array.isArray(input.distributionCircuits);
      const receivedDistCircuitIds = distCircuitsReceived
        ? new Set(input.distributionCircuits!.filter((c) => isRealId(c.id)).map((c) => c.id!))
        : new Set<string>();
      const deleteDistCircuitIds = distCircuitsReceived
        ? [...dbDistCircuitIds].filter((cid) => !receivedDistCircuitIds.has(cid))
        : [];

      // ── Step 2: detect changes (lightweight — full diff handled by audit context) ──
      let hasStructuralChange = false;
      if (
        deleteEquipmentIds.length > 0 ||
        deleteCableIds.length > 0 ||
        deleteRackModuleIds.length > 0 ||
        deleteDistCircuitIds.length > 0
      ) {
        hasStructuralChange = true;
      }
      if (rackModulesReceived) {
        for (const m of input.rackModules!) {
          if (!isRealId(m.id)) {
            hasStructuralChange = true;
            break;
          }
        }
      }
      for (const eq of input.equipment ?? []) {
        if (!isRealId(eq.id)) {
          hasStructuralChange = true;
          break;
        }
        const cur = dbEquipmentMap.get(eq.id!);
        if (!cur) continue;
        if (
          eq.positionX !== cur.positionX ||
          eq.positionY !== cur.positionY ||
          eq.width !== cur.width2d ||
          eq.height !== cur.height2d ||
          (eq.rotation ?? 0) !== cur.rotation ||
          eq.kind !== cur.kind
        ) {
          hasStructuralChange = true;
          break;
        }
      }
      if (!hasStructuralChange) {
        for (const cable of input.cables ?? []) {
          if (!isRealId(cable.id)) {
            hasStructuralChange = true;
            break;
          }
        }
      }

      const canvasChanged =
        (input.canvasWidth !== undefined && input.canvasWidth !== floor.canvasWidth) ||
        (input.canvasHeight !== undefined && input.canvasHeight !== floor.canvasHeight) ||
        (input.gridSize !== undefined && input.gridSize !== floor.gridSize) ||
        (input.majorGridSize !== undefined && input.majorGridSize !== floor.majorGridSize) ||
        (input.backgroundColor !== undefined && input.backgroundColor !== floor.backgroundColor);
      if (canvasChanged) hasStructuralChange = true;
      // Background drawing change (import / replace / clear) is structural —
      // we want a versioned snapshot so users can roll back.
      if (input.backgroundDrawing !== undefined) hasStructuralChange = true;

      // ── Step 3: apply mutations ──
      if (deleteCableIds.length > 0) {
        await tx.cable.deleteMany({ where: { id: { in: deleteCableIds } } });
      }
      if (deleteEquipmentIds.length > 0) {
        await tx.equipment.deleteMany({
          where: { id: { in: deleteEquipmentIds }, floorId: id },
        });
      }

      // OFD uniqueness check on new OFDs
      if (input.equipment) {
        const newOfds = input.equipment.filter(
          (e) => e.kind === EquipmentKind.OFD && !isRealId(e.id),
        );
        if (newOfds.length > 0) {
          await equipmentService.validateOfdUniqueness(id);
        }
      }

      for (const equip of input.equipment ?? []) {
        if (isRealId(equip.id) && dbEquipmentIds.has(equip.id!)) {
          await tx.equipment.update({
            where: { id: equip.id! },
            data: {
              kind: equip.kind,
              name: equip.name,
              positionX: equip.positionX,
              positionY: equip.positionY,
              width2d: equip.width,
              height2d: equip.height,
              rotation: equip.rotation ?? 0,
              totalU: equip.kind === EquipmentKind.RACK ? equip.totalU ?? 42 : null,
              description: equip.description,
              manager: equip.manager,
              installDate: equip.installDate ? new Date(equip.installDate) : null,
              height3d: equip.height3d,
              properties: equip.properties as Prisma.InputJsonValue | undefined,
              updatedById: userId,
            },
          });
        } else {
          const created = await tx.equipment.create({
            data: {
              floorId: id,
              kind: equip.kind,
              name: equip.name,
              positionX: equip.positionX,
              positionY: equip.positionY,
              width2d: equip.width,
              height2d: equip.height,
              rotation: equip.rotation ?? 0,
              totalU: equip.kind === EquipmentKind.RACK ? equip.totalU ?? 42 : null,
              description: equip.description,
              manager: equip.manager,
              installDate: equip.installDate ? new Date(equip.installDate) : null,
              height3d: equip.height3d,
              properties: equip.properties as Prisma.InputJsonValue | undefined,
              createdById: userId,
              updatedById: userId,
            },
          });
          if (equip.tempId) equipmentIdMap[equip.tempId] = created.id;
          if (equip.id && equip.id !== created.id) equipmentIdMap[equip.id] = created.id;
        }
      }

      // ── RackModule reconciliation ──
      // 부모 랙 ID 는 equipmentIdMap 으로 tempId → real id 해석.
      // 슬롯 충돌 검사는 in-memory + DB 잔존 모듈 모두 고려.
      if (rackModulesReceived) {
        if (deleteRackModuleIds.length > 0) {
          await tx.rackModule.deleteMany({ where: { id: { in: deleteRackModuleIds } } });
        }

        // 처리 후 각 랙별 잔존 슬롯 추적 (충돌 검사용).
        // 초기 상태: DB 잔존 - 삭제분.
        const liveByRack = new Map<string, { id: string; slotIndex: number; slotSpan: number }[]>();
        for (const m of dbRackModules) {
          if (deleteRackModuleIds.includes(m.id)) continue;
          if (!liveByRack.has(m.rackEquipmentId)) liveByRack.set(m.rackEquipmentId, []);
          liveByRack.get(m.rackEquipmentId)!.push({
            id: m.id,
            slotIndex: m.slotIndex,
            slotSpan: m.slotSpan,
          });
        }

        for (const mod of input.rackModules!) {
          // 부모 랙 해석 (tempId 가능)
          const resolvedRackId = equipmentIdMap[mod.rackEquipmentId] ?? mod.rackEquipmentId;
          const rack = await tx.equipment.findUnique({
            where: { id: resolvedRackId },
            select: { id: true, kind: true },
          });
          if (!rack) {
            throw new ValidationError(
              `랙 모듈의 부모 설비를 찾을 수 없습니다 (rackEquipmentId=${mod.rackEquipmentId}).`,
            );
          }
          if (rack.kind !== EquipmentKind.RACK) {
            throw new ValidationError(
              `랙 모듈의 부모가 RACK 이 아닙니다 (kind=${rack.kind}).`,
            );
          }

          // 카테고리 확인 — categoryId 는 real (시드된 RackModuleCategory.id) 만 가능.
          const category = await tx.rackModuleCategory.findUnique({
            where: { id: mod.categoryId },
            select: { id: true },
          });
          if (!category) {
            throw new ValidationError(
              `랙 모듈 카테고리를 찾을 수 없습니다 (categoryId=${mod.categoryId}).`,
            );
          }

          // 슬롯 충돌 검사 — update 의 경우 자기 자신은 제외.
          const liveSlots = liveByRack.get(rack.id) ?? [];
          const isUpdate = isRealId(mod.id) && dbRackModuleIds.has(mod.id!);
          assertSlotValid(mod.slotIndex, mod.slotSpan);
          assertNoSlotCollision(
            mod.slotIndex,
            mod.slotSpan,
            liveSlots,
            isUpdate ? [mod.id!] : [],
          );

          if (isUpdate) {
            const updated = await tx.rackModule.update({
              where: { id: mod.id! },
              data: {
                rackEquipmentId: rack.id,
                categoryId: category.id,
                name: mod.name,
                slotIndex: mod.slotIndex,
                slotSpan: mod.slotSpan,
                installDate:
                  mod.installDate !== undefined && mod.installDate !== null
                    ? new Date(mod.installDate)
                    : mod.installDate === null
                      ? null
                      : undefined,
                manager: mod.manager,
                description: mod.description,
                properties: mod.properties as Prisma.InputJsonValue | undefined,
                sortOrder: mod.sortOrder,
                updatedById: userId,
              },
            });
            // 슬롯 추적 업데이트
            const arr = liveByRack.get(rack.id) ?? [];
            const idx = arr.findIndex((s) => s.id === updated.id);
            if (idx >= 0) {
              arr[idx] = { id: updated.id, slotIndex: updated.slotIndex, slotSpan: updated.slotSpan };
            } else {
              arr.push({ id: updated.id, slotIndex: updated.slotIndex, slotSpan: updated.slotSpan });
            }
            liveByRack.set(rack.id, arr);
          } else {
            const created = await tx.rackModule.create({
              data: {
                rackEquipmentId: rack.id,
                categoryId: category.id,
                name: mod.name,
                slotIndex: mod.slotIndex,
                slotSpan: mod.slotSpan,
                installDate: mod.installDate ? new Date(mod.installDate) : null,
                manager: mod.manager ?? null,
                description: mod.description ?? null,
                properties: (mod.properties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                sortOrder: mod.sortOrder ?? 0,
                createdById: userId,
                updatedById: userId,
              },
            });
            if (mod.tempId) rackModuleIdMap[mod.tempId] = created.id;
            if (mod.id && mod.id !== created.id) rackModuleIdMap[mod.id] = created.id;
            const arr = liveByRack.get(rack.id) ?? [];
            arr.push({ id: created.id, slotIndex: created.slotIndex, slotSpan: created.slotSpan });
            liveByRack.set(rack.id, arr);
          }
        }
      }

      // ── DistributionCircuit reconciliation ──
      // RackModule 과 동일 규칙. 부모 분전반 ID 는 equipmentIdMap 으로 tempId 해석.
      // 슬롯 같은 위치 제약은 없고 feeder/branch 자유 입력.
      if (distCircuitsReceived) {
        if (deleteDistCircuitIds.length > 0) {
          await tx.distributionCircuit.deleteMany({
            where: { id: { in: deleteDistCircuitIds } },
          });
        }
        for (const c of input.distributionCircuits!) {
          const resolvedDistId =
            equipmentIdMap[c.distributionEquipmentId] ?? c.distributionEquipmentId;
          const dist = await tx.equipment.findUnique({
            where: { id: resolvedDistId },
            select: { id: true, kind: true },
          });
          if (!dist) {
            throw new ValidationError(
              `분전반 회로의 부모 설비를 찾을 수 없습니다 (distributionEquipmentId=${c.distributionEquipmentId}).`,
            );
          }
          if (dist.kind !== EquipmentKind.DISTRIBUTION) {
            throw new ValidationError(
              `분전반 회로의 부모가 DISTRIBUTION 이 아닙니다 (kind=${dist.kind}).`,
            );
          }

          const isUpdate = isRealId(c.id) && dbDistCircuitIds.has(c.id!);
          if (isUpdate) {
            await tx.distributionCircuit.update({
              where: { id: c.id! },
              data: {
                distributionEquipmentId: dist.id,
                feederName: c.feederName,
                branchName: c.branchName,
                description: c.description,
                sortOrder: c.sortOrder,
                updatedById: userId,
              },
            });
          } else {
            const created = await tx.distributionCircuit.create({
              data: {
                distributionEquipmentId: dist.id,
                feederName: c.feederName,
                branchName: c.branchName,
                description: c.description ?? null,
                sortOrder: c.sortOrder ?? 0,
                createdById: userId,
                updatedById: userId,
              },
            });
            if (c.tempId) distCircuitIdMap[c.tempId] = created.id;
            if (c.id && c.id !== created.id) distCircuitIdMap[c.id] = created.id;
          }
        }
      }

      // Fiber paths
      const fiberPathIdMap: Record<string, string> = {};
      if (input.fiberPaths) {
        for (const fp of input.fiberPaths) {
          const resolvedOfdAId = equipmentIdMap[fp.ofdAId] ?? fp.ofdAId;
          const resolvedOfdBId = equipmentIdMap[fp.ofdBId] ?? fp.ofdBId;
          if (isRealId(fp.id)) {
            await tx.fiberPath.update({
              where: { id: fp.id },
              data: {
                ofdAId: resolvedOfdAId,
                ofdBId: resolvedOfdBId,
                portCount: fp.portCount,
                description: fp.description ?? null,
                updatedById: userId,
              },
            });
          } else {
            const created = await tx.fiberPath.create({
              data: {
                ofdAId: resolvedOfdAId,
                ofdBId: resolvedOfdBId,
                portCount: fp.portCount,
                description: fp.description ?? null,
                createdById: userId,
                updatedById: userId,
              },
            });
            if (fp.id) fiberPathIdMap[fp.id] = created.id;
          }
        }
      }

      if (input.deletedFiberPathIds && input.deletedFiberPathIds.length > 0) {
        await tx.fiberPath.deleteMany({
          where: { id: { in: input.deletedFiberPathIds } },
        });
      }

      // Cables
      // 한 번 조회한 endpoint kind 캐시 (같은 트랜잭션에서 반복 조회 방지)
      const equipmentKindCache = new Map<string, EquipmentKind>();
      const getEquipmentKind = async (eqId: string): Promise<EquipmentKind | null> => {
        if (equipmentKindCache.has(eqId)) return equipmentKindCache.get(eqId)!;
        const e = await tx.equipment.findUnique({
          where: { id: eqId },
          select: { kind: true },
        });
        if (!e) return null;
        equipmentKindCache.set(eqId, e.kind);
        return e.kind;
      };

      for (const cable of input.cables ?? []) {
        const srcEqId = cable.source.equipmentId
          ? equipmentIdMap[cable.source.equipmentId] ?? cable.source.equipmentId
          : null;
        const tgtEqId = cable.target.equipmentId
          ? equipmentIdMap[cable.target.equipmentId] ?? cable.target.equipmentId
          : null;
        const srcModId = cable.source.moduleId
          ? rackModuleIdMap[cable.source.moduleId] ?? cable.source.moduleId
          : null;
        const tgtModId = cable.target.moduleId
          ? rackModuleIdMap[cable.target.moduleId] ?? cable.target.moduleId
          : null;
        const resolvedFiberPathId = cable.fiberPathId
          ? fiberPathIdMap[cable.fiberPathId] ?? cable.fiberPathId
          : null;

        // Each side must have exactly one
        if ((!!srcEqId) === (!!srcModId)) {
          throw new ValidationError('source endpoint 는 equipmentId 또는 moduleId 중 하나여야 합니다.');
        }
        if ((!!tgtEqId) === (!!tgtModId)) {
          throw new ValidationError('target endpoint 는 equipmentId 또는 moduleId 중 하나여야 합니다.');
        }

        // RACK Equipment 는 endpoint 불가 (랙 안 모듈에 연결해야 한다)
        const srcKind = srcEqId ? await getEquipmentKind(srcEqId) : null;
        const tgtKind = tgtEqId ? await getEquipmentKind(tgtEqId) : null;
        if (srcEqId) {
          if (srcKind === null) {
            throw new ValidationError(`source 설비를 찾을 수 없습니다 (id=${srcEqId}).`);
          }
          if (srcKind === EquipmentKind.RACK) {
            throw new ValidationError('RACK 설비는 케이블 endpoint 가 될 수 없습니다 — 랙 안 모듈에 연결하세요.');
          }
        }
        if (tgtEqId) {
          if (tgtKind === null) {
            throw new ValidationError(`target 설비를 찾을 수 없습니다 (id=${tgtEqId}).`);
          }
          if (tgtKind === EquipmentKind.RACK) {
            throw new ValidationError('RACK 설비는 케이블 endpoint 가 될 수 없습니다 — 랙 안 모듈에 연결하세요.');
          }
        }

        // OFD endpoint 면 fiberPathId + fiberPortNumber 필수
        assertOfdFiberPath(srcKind, tgtKind, resolvedFiberPathId, cable.fiberPortNumber);

        if (isRealId(cable.id) && dbCableIds.has(cable.id!)) {
          await tx.cable.update({
            where: { id: cable.id! },
            data: {
              sourceEquipmentId: srcEqId,
              sourceModuleId: srcModId,
              targetEquipmentId: tgtEqId,
              targetModuleId: tgtModId,
              cableType: cable.cableType as CableType,
              label: cable.label,
              length: cable.length,
              color: cable.color,
              description: cable.description,
              fiberPathId: resolvedFiberPathId,
              fiberPortNumber: cable.fiberPortNumber ?? null,
              categoryId: cable.categoryId ?? null,
              specParams: cable.specParams as Prisma.InputJsonValue | undefined,
              pathPoints: cable.pathPoints as Prisma.InputJsonValue | undefined,
              pathLength: cable.pathLength,
              bufferLength: cable.bufferLength ?? undefined,
              totalLength: cable.totalLength,
              updatedById: userId,
            },
          });
        } else {
          if (resolvedFiberPathId && cable.fiberPortNumber && tgtEqId) {
            const existingOnPort = await tx.cable.findFirst({
              where: {
                fiberPathId: resolvedFiberPathId,
                fiberPortNumber: cable.fiberPortNumber,
                OR: [
                  { sourceEquipmentId: tgtEqId },
                  { targetEquipmentId: tgtEqId },
                ],
              },
            });
            if (existingOnPort) {
              throw new ConflictError(`경로 포트 ${cable.fiberPortNumber}번이 이미 사용 중입니다.`);
            }
          }
          await tx.cable.create({
            data: {
              sourceEquipmentId: srcEqId,
              sourceModuleId: srcModId,
              targetEquipmentId: tgtEqId,
              targetModuleId: tgtModId,
              cableType: cable.cableType as CableType,
              label: cable.label,
              length: cable.length,
              color: cable.color,
              description: cable.description,
              fiberPathId: resolvedFiberPathId,
              fiberPortNumber: cable.fiberPortNumber ?? null,
              categoryId: cable.categoryId ?? null,
              specParams: cable.specParams as Prisma.InputJsonValue | undefined,
              pathPoints: cable.pathPoints as Prisma.InputJsonValue | undefined,
              pathLength: cable.pathLength,
              bufferLength: cable.bufferLength ?? 4,
              totalLength: cable.totalLength,
              createdById: userId,
              updatedById: userId,
            },
          });
        }
      }

      // ── Step 4: bump floor ──
      // Background drawing patch (3-state) + auto-expand canvas if the
      // imported drawing is bigger than the current canvas. The expansion
      // logic was previously in dwgImport.service.ts's commit=true branch;
      // it now lives here so DWG changes are part of the same atomic save.
      let effectiveCanvasW = input.canvasWidth;
      let effectiveCanvasH = input.canvasHeight;
      if (input.backgroundDrawing) {
        const bounds = input.backgroundDrawing.bounds;
        const expandW = Math.max(effectiveCanvasW ?? floor.canvasWidth, Math.ceil(bounds.maxX));
        const expandH = Math.max(effectiveCanvasH ?? floor.canvasHeight, Math.ceil(bounds.maxY));
        if (expandW !== floor.canvasWidth) effectiveCanvasW = expandW;
        if (expandH !== floor.canvasHeight) effectiveCanvasH = expandH;
      }

      const updated = await tx.floor.update({
        where: { id },
        data: {
          canvasWidth: effectiveCanvasW,
          canvasHeight: effectiveCanvasH,
          gridSize: input.gridSize,
          majorGridSize: input.majorGridSize,
          backgroundColor: input.backgroundColor,
          ...(input.scaleRatio !== undefined ? { scaleRatio: input.scaleRatio } : {}),
          ...(input.backgroundOpacity !== undefined ? { backgroundOpacity: input.backgroundOpacity } : {}),
          ...(input.backgroundDrawing !== undefined
            ? {
                backgroundDrawing:
                  input.backgroundDrawing === null
                    ? Prisma.JsonNull
                    : (input.backgroundDrawing as unknown as Prisma.InputJsonValue),
              }
            : {}),
          ...(hasStructuralChange ? { version: { increment: 1 } } : {}),
          updatedById: userId,
        },
      });
      newVersion = updated.version;

      // ── Step 5: audit log (snapshot for structural changes) ──
      const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
      const actionDetail = hasStructuralChange
        ? truncate(`v${newVersion}`, ACTION_DETAIL_MAX_LEN)
        : truncate('정보 수정', ACTION_DETAIL_MAX_LEN);

      if (hasStructuralChange) {
        const snapshot = await captureFloorSnapshot(tx, id, updated, newVersion);
        const beforePlan: PlanSnapshot = {
          equipment: dbEquipment.map((e) => ({
            id: e.id,
            name: e.name,
            materialCategoryCode: kindToLegacyCode(e.kind),
            materialCategoryName: e.kind,
            specification: null,
            specParams: null,
            positionX: e.positionX,
            positionY: e.positionY,
          })),
          cables: dbCables.map((c) => ({
            id: c.id,
            cableType: c.cableType,
            materialCategoryCode: c.category?.code ?? null,
            materialCategoryName: c.category?.name ?? null,
            specification: buildSpecification(c.category?.specTemplate, c.specParams),
            totalLength: c.totalLength ?? null,
            sourceEquipmentId: c.sourceEquipmentId ?? c.sourceModuleId ?? '',
            targetEquipmentId: c.targetEquipmentId ?? c.targetModuleId ?? '',
            label: c.label ?? null,
          })),
        };
        const afterPlan: PlanSnapshot = {
          equipment: snapshot.plan.equipment.map((e: any) => ({
            id: e.id,
            name: e.name,
            materialCategoryCode: kindToLegacyCode(e.kind),
            materialCategoryName: e.kind,
            specification: null,
            specParams: null,
            positionX: e.positionX,
            positionY: e.positionY,
          })),
          cables: snapshot.cables.map((c: any) => ({
            id: c.id,
            cableType: c.cableType,
            materialCategoryCode: c.categoryCode ?? null,
            materialCategoryName: c.categoryName ?? null,
            specification: c.specification ?? null,
            totalLength: c.totalLength ?? null,
            sourceEquipmentId: c.source?.equipmentId ?? c.source?.moduleId ?? '',
            targetEquipmentId: c.target?.equipmentId ?? c.target?.moduleId ?? '',
            label: c.label ?? null,
          })),
        };
        const constructionReport = calculateConstructionReport(beforePlan, afterPlan);

        const auditEntry = await tx.auditLog.create({
          data: {
            entityType: 'Floor',
            entityId: id,
            entityName: floor.name,
            action: 'UPDATE',
            actionDetail,
            changedFields: [],
            newValues: snapshot as any,
            context: { constructionReport } as any,
            userId,
            userName: user?.name ?? null,
          },
        });
        auditLogId = auditEntry.id;
        finalConstructionReport = constructionReport;
      } else {
        const auditEntry = await tx.auditLog.create({
          data: {
            entityType: 'Floor',
            entityId: id,
            entityName: floor.name,
            action: 'UPDATE',
            actionDetail,
            changedFields: [],
            userId,
            userName: user?.name ?? null,
          },
        });
        auditLogId = auditEntry.id;
      }

      finalFiberPathIdMap = fiberPathIdMap;
    });

    return {
      id,
      version: newVersion,
      message: '저장되었습니다.',
      equipmentIdMap,
      rackModuleIdMap,
      distCircuitIdMap,
      fiberPathIdMap: finalFiberPathIdMap,
      auditLogId,
      constructionReport: finalConstructionReport,
    };
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
        fiberPaths: snapshot.fiberPaths ?? [],
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
}

/**
 * Map EquipmentKind back to legacy MaterialCategory.code so the existing
 * constructionTemplates BOM/labor lookups keep matching for now.
 *   RACK → 'EQP-RACK', OFD → 'EQP-OFD', DISTRIBUTION → 'EQP-DIST',
 *   GROUNDING → 'EQP-GROUND', HVAC → 'EQP-COOL'.
 *
 * RackModule-driven triggers (RTU/UPS/etc.) are NOT covered yet — those
 * categories were dropped along with MaterialCategory. P7+ will expose
 * RackModule kind so the report can hook into them.
 */
function kindToLegacyCode(kind: EquipmentKind | null | undefined): string | null {
  switch (kind) {
    case EquipmentKind.RACK: return 'EQP-RACK';
    case EquipmentKind.OFD: return 'EQP-OFD';
    case EquipmentKind.DISTRIBUTION: return 'EQP-DIST';
    case EquipmentKind.GROUNDING: return 'EQP-GROUND';
    case EquipmentKind.HVAC: return 'EQP-COOL';
    default: return null;
  }
}

async function captureFloorSnapshot(
  tx: TxClient,
  floorId: string,
  updated: { id: string; name: string; canvasWidth: number; canvasHeight: number; gridSize: number; majorGridSize: number; backgroundColor: string; updatedAt: Date },
  version: number,
) {
  const [equipment, cables] = await Promise.all([
    tx.equipment.findMany({
      where: { floorId },
      include: {
        photos: {
          select: { id: true, side: true, imageUrl: true, description: true, takenAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    tx.cable.findMany({
      where: {
        OR: [
          { sourceEquipment: { floorId } },
          { targetEquipment: { floorId } },
          { sourceModule: { rack: { floorId } } },
          { targetModule: { rack: { floorId } } },
        ],
      },
      include: {
        category: { select: { code: true, name: true, displayColor: true, specTemplate: true } },
      },
    }),
  ]);

  const ofdIds = equipment.filter((e) => e.kind === EquipmentKind.OFD).map((e) => e.id);
  const fiberPaths = ofdIds.length > 0
    ? await tx.fiberPath.findMany({
        where: { OR: [{ ofdAId: { in: ofdIds } }, { ofdBId: { in: ofdIds } }] },
        select: { id: true, ofdAId: true, ofdBId: true, portCount: true, description: true },
      })
    : [];

  return {
    plan: {
      id: updated.id,
      name: updated.name,
      canvasWidth: updated.canvasWidth,
      canvasHeight: updated.canvasHeight,
      gridSize: updated.gridSize,
      majorGridSize: updated.majorGridSize,
      backgroundColor: updated.backgroundColor,
      equipment: equipment.map((e) => ({
        id: e.id,
        kind: e.kind,
        name: e.name,
        positionX: e.positionX,
        positionY: e.positionY,
        width: e.width2d,
        height: e.height2d,
        rotation: e.rotation,
        totalU: e.totalU,
        description: e.description,
        manager: e.manager,
        installDate: e.installDate?.toISOString().slice(0, 10) ?? null,
        height3d: e.height3d,
        frontImageUrl: e.frontImageUrl,
        rearImageUrl: e.rearImageUrl,
        properties: e.properties,
        photos: e.photos.map((p) => ({
          id: p.id,
          side: p.side,
          imageUrl: p.imageUrl,
          description: p.description,
          takenAt: p.takenAt?.toISOString() ?? null,
        })),
      })),
      version,
      updatedAt: updated.updatedAt,
    },
    cables: cables.map((c) => ({
      id: c.id,
      sourceEquipmentId: c.sourceEquipmentId,
      sourceModuleId: c.sourceModuleId,
      targetEquipmentId: c.targetEquipmentId,
      targetModuleId: c.targetModuleId,
      cableType: c.cableType,
      label: c.label,
      length: c.length,
      color: c.color,
      pathPoints: c.pathPoints,
      description: c.description,
      fiberPathId: c.fiberPathId,
      fiberPortNumber: c.fiberPortNumber,
      categoryId: c.categoryId,
      categoryCode: c.category?.code ?? null,
      categoryName: c.category?.name ?? null,
      displayColor: c.category?.displayColor ?? null,
      specification: buildSpecification(c.category?.specTemplate, c.specParams),
      specParams: c.specParams,
      pathLength: c.pathLength,
      bufferLength: c.bufferLength,
      totalLength: c.totalLength,
    })),
    fiberPaths,
  };
}

export const floorService = new FloorService();

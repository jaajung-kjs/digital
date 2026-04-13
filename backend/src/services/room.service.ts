import prisma from '../config/prisma.js';
import { Prisma, EquipmentCategory, CableType } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { equipmentService } from './equipment.service.js';

// ==================== Types ====================

export interface RoomListItem {
  id: string;
  floorId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface RoomDetail {
  id: string;
  floorId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomPlanDetail {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  majorGridSize: number;
  backgroundColor: string;
  scaleRatio: number | null;
  elements: {
    id: string;
    elementType: string;
    properties: Record<string, unknown>;
    zIndex: number;
    isVisible: boolean;
  }[];
  equipment: {
    id: string;
    name: string;
    category: string;
    positionX: number | null;
    positionY: number | null;
    width: number | null;
    height: number | null;
    rotation: number;
    frontImageUrl: string | null;
    rearImageUrl: string | null;
    description: string | null;
    model: string | null;
    manufacturer: string | null;
    manager: string | null;
    height3d: number | null;
    materialCategoryId: string | null;
    materialCategoryCode: string | null;
    materialId: string | null;
    specParams: unknown;
    parentEquipmentId: string | null;
    startU: number | null;
    heightU: number;
  }[];
  cables: {
    id: string;
    sourceEquipmentId: string;
    targetEquipmentId: string;
    cableType: string;
    label: string | null;
    length: number | null;
    color: string | null;
    pathPoints: unknown;
    description: string | null;
    fiberPathId: string | null;
    fiberPortNumber: number | null;
    materialCategoryId: string | null;
    materialCategoryCode: string | null;
    displayColor: string | null;
    specParams: unknown;
    pathLength: number | null;
    bufferLength: number;
    totalLength: number | null;
    sourceEquipment: { id: string; name: string; rackId: string | null; roomId: string | null };
    targetEquipment: { id: string; name: string; rackId: string | null; roomId: string | null };
  }[];
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

export interface CreateRoomInput {
  name: string;
}

export interface UpdateRoomInput {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdatePlanInput {
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  majorGridSize?: number;
  backgroundColor?: string;
  scaleRatio?: number;
  elements?: {
    id?: string | null;
    elementType: string;
    properties: Record<string, unknown>;
    zIndex?: number;
    isVisible?: boolean;
    materialCategoryId?: string | null;
    specParams?: unknown;
    pathLength?: number | null;
  }[];
  equipment?: {
    id?: string | null;
    tempId?: string;
    name: string;
    category?: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    rotation?: number;
    description?: string | null;
    model?: string | null;
    manufacturer?: string | null;
    manager?: string | null;
    height3d?: number | null;
    materialCategoryId?: string | null;
    materialCategoryCode?: string | null;
    specParams?: any;
    // Rack-internal equipment fields
    parentEquipmentId?: string | null;
    startU?: number | null;
    heightU?: number | null;
  }[];
  cables?: {
    id?: string | null;
    sourceEquipmentId: string;
    targetEquipmentId: string;
    cableType: string;
    label?: string | null;
    length?: number | null;
    color?: string | null;
    fiberPathId?: string | null;
    fiberPortNumber?: number | null;
    materialCategoryId?: string | null;
    specParams?: any;
    pathPoints?: any;
    pathLength?: number;
    bufferLength?: number;
    totalLength?: number;
    description?: string | null;
  }[];
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

type RoomRecord = Prisma.RoomGetPayload<{}>;

function toRoomDetail(r: RoomRecord): RoomDetail {
  return {
    id: r.id,
    floorId: r.floorId,
    name: r.name,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ==================== Shared Constants & Helpers ====================

const DEFAULT_EQUIPMENT_WIDTH = 60;
const DEFAULT_EQUIPMENT_HEIGHT = 100;

const EQUIPMENT_SELECT = {
  id: true, name: true, category: true,
  positionX: true, positionY: true, width2d: true, height2d: true,
  rotation: true, frontImageUrl: true, rearImageUrl: true,
  description: true, model: true, manufacturer: true, manager: true, height3d: true,
  materialCategoryId: true, materialId: true, specParams: true,
  materialCategory: { select: { code: true } },
  rackId: true, startU: true, heightU: true,
} as const;

type EquipmentRow = Prisma.EquipmentGetPayload<{ select: typeof EQUIPMENT_SELECT }>;

function mapEquipmentRow(e: EquipmentRow, rackToEquipmentMap?: Map<string, string>) {
  return {
    id: e.id, name: e.name, category: e.category,
    positionX: e.positionX ?? 0, positionY: e.positionY ?? 0,
    width: e.width2d ?? DEFAULT_EQUIPMENT_WIDTH, height: e.height2d ?? DEFAULT_EQUIPMENT_HEIGHT,
    rotation: e.rotation ?? 0,
    frontImageUrl: e.frontImageUrl, rearImageUrl: e.rearImageUrl,
    description: e.description, model: e.model,
    manufacturer: e.manufacturer, manager: e.manager, height3d: e.height3d,
    materialCategoryId: e.materialCategoryId, materialCategoryCode: e.materialCategory?.code ?? null,
    materialId: e.materialId, specParams: e.specParams,
    parentEquipmentId: e.rackId && rackToEquipmentMap ? (rackToEquipmentMap.get(e.rackId) ?? null) : null,
    startU: e.startU, heightU: e.heightU,
  };
}

/** Normalize undefined→null for comparing optional fields against DB nulls */
function nullableChanged(incoming: unknown, current: unknown): boolean {
  return (incoming ?? null) !== current;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/** Check if a string is a valid UUID v4 (i.e., a real DB id, not a temp id) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRealId(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

/** Position tolerance for rack matching (pixels) */
const RACK_POSITION_TOLERANCE = 5;

// ==================== Change Detection ====================

interface DetailedChange {
  description: string;
  isStructural: boolean;
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function detectCanvasChanges(
  input: UpdatePlanInput,
  room: { canvasWidth: number; canvasHeight: number; gridSize: number; majorGridSize: number; backgroundColor: string },
): DetailedChange[] {
  const changes: DetailedChange[] = [];
  if (input.canvasWidth !== undefined && input.canvasWidth !== room.canvasWidth) {
    changes.push({ description: '캔버스 너비 변경', isStructural: true });
  }
  if (input.canvasHeight !== undefined && input.canvasHeight !== room.canvasHeight) {
    changes.push({ description: '캔버스 높이 변경', isStructural: true });
  }
  if (input.gridSize !== undefined && input.gridSize !== room.gridSize) {
    changes.push({ description: '그리드 크기 변경', isStructural: true });
  }
  if (input.majorGridSize !== undefined && input.majorGridSize !== room.majorGridSize) {
    changes.push({ description: '주요 그리드 크기 변경', isStructural: true });
  }
  if (input.backgroundColor !== undefined && input.backgroundColor !== room.backgroundColor) {
    changes.push({ description: '배경색 변경', isStructural: true });
  }
  return changes;
}

/** VarChar(100) limit for actionDetail column */
const ACTION_DETAIL_MAX_LEN = 100;

/**
 * Build a concise summary of changes for the audit log.
 * Groups individual changes into categories for readability.
 */
function buildChangeSummary(changes: DetailedChange[]): string[] {
  if (changes.length === 0) return [];

  // Group by category for concise output
  const summary: string[] = [];

  const equipAdd = changes.filter(c => c.isStructural && c.description.includes('추가') && !c.description.includes('요소') && !c.description.includes('케이블'));
  const equipDel = changes.filter(c => c.isStructural && c.description.includes('삭제') && !c.description.includes('요소') && !c.description.includes('케이블'));
  const equipMove = changes.filter(c => c.isStructural && c.description.includes('위치/크기'));
  const equipMeta = changes.filter(c => !c.isStructural && c.description.includes('정보 수정'));
  const elemAdd = changes.filter(c => c.description.includes('구조 요소') && c.description.includes('추가'));
  const elemDel = changes.filter(c => c.description.includes('구조 요소') && c.description.includes('삭제'));
  const cableChanges = changes.filter(c => c.description.includes('케이블'));
  const canvasChanges = changes.filter(c => c.description.includes('캔버스') || c.description.includes('그리드') || c.description.includes('배경색'));

  if (equipAdd.length > 0) summary.push(`설비 ${equipAdd.length}개 추가`);
  if (equipDel.length > 0) summary.push(`설비 ${equipDel.length}개 삭제`);
  if (equipMove.length > 0) summary.push(`설비 ${equipMove.length}개 이동/크기 변경`);
  if (equipMeta.length > 0) summary.push(`설비 ${equipMeta.length}개 정보 수정`);
  if (elemAdd.length > 0) summary.push(elemAdd[0].description);
  if (elemDel.length > 0) summary.push(elemDel[0].description);
  if (cableChanges.length > 0) {
    const total = cableChanges.reduce((n, c) => {
      const match = c.description.match(/(\d+)개/);
      return n + (match ? parseInt(match[1]) : 1);
    }, 0);
    summary.push(`케이블 ${total}건 변경`);
  }
  if (canvasChanges.length > 0) summary.push('캔버스 설정 변경');

  return summary;
}

// ==================== Snapshot Capture ====================

/**
 * Build a "before" snapshot from the already-loaded DB rows.
 * Same shape as captureRoomSnapshot so the frontend can diff old ↔ new.
 */
function buildOldSnapshot(
  room: { id: string; name: string; canvasWidth: number; canvasHeight: number; gridSize: number; majorGridSize: number; backgroundColor: string; version: number; updatedAt: Date },
  dbElements: { id: string; elementType?: string; properties?: unknown; zIndex?: number; isVisible?: boolean; materialCategoryId?: string | null; specParams?: unknown; pathLength?: number | null }[],
  dbEquipment: { id: string; name: string; category: string; positionX: number | null; positionY: number | null; width2d: number | null; height2d: number | null; rotation: number | null; description: string | null; model: string | null; manufacturer: string | null; manager: string | null; height3d: number | null; materialCategoryId: string | null; materialCategory: { code: string } | null; specParams?: unknown }[],
  dbCables: { id: string; sourceEquipmentId: string; targetEquipmentId: string; cableType: string; fiberPathId: string | null; fiberPortNumber: number | null }[],
) {
  return {
    plan: {
      id: room.id, name: room.name,
      canvasWidth: room.canvasWidth, canvasHeight: room.canvasHeight,
      gridSize: room.gridSize, majorGridSize: room.majorGridSize,
      backgroundColor: room.backgroundColor,
      elements: dbElements.map(e => ({
        id: e.id, elementType: e.elementType ?? '',
        properties: (e.properties ?? {}) as Record<string, unknown>,
        zIndex: e.zIndex ?? 0, isVisible: e.isVisible ?? true,
        materialCategoryId: e.materialCategoryId ?? null,
        specParams: e.specParams ?? null,
        pathLength: e.pathLength ?? null,
      })),
      equipment: dbEquipment.map(e => ({
        id: e.id, name: e.name, category: e.category,
        positionX: e.positionX ?? 0, positionY: e.positionY ?? 0,
        width: e.width2d ?? DEFAULT_EQUIPMENT_WIDTH, height: e.height2d ?? DEFAULT_EQUIPMENT_HEIGHT,
        rotation: e.rotation ?? 0,
        description: e.description, model: e.model,
        manufacturer: e.manufacturer, manager: e.manager, height3d: e.height3d,
        materialCategoryId: e.materialCategoryId, materialCategoryCode: e.materialCategory?.code ?? null,
        specParams: e.specParams ?? null,
      })),
      version: room.version, updatedAt: room.updatedAt,
    },
    cables: dbCables.map(c => ({
      id: c.id,
      sourceEquipmentId: c.sourceEquipmentId, targetEquipmentId: c.targetEquipmentId,
      cableType: c.cableType,
      fiberPathId: c.fiberPathId, fiberPortNumber: c.fiberPortNumber,
    })),
  };
}

/**
 * Build structured diff for AuditLog.context from reconciliation data.
 */
function buildStructuredDiff(
  input: UpdatePlanInput,
  dbEquipmentMap: Map<string, { id: string; name: string; category: string; positionX: number | null; positionY: number | null; width2d: number | null; height2d: number | null; rotation: number | null; materialCategory: { code: string } | null }>,
  dbCableMap: Map<string, { id: string; sourceEquipmentId: string; targetEquipmentId: string; cableType: string }>,
  deleteEquipmentIds: Set<string>,
  deleteCableIds: Set<string>,
  deleteElementIds: Set<string>,
) {
  const diff: Record<string, { created: unknown[]; deleted: unknown[]; modified: unknown[] }> = {
    equipment: { created: [], deleted: [], modified: [] },
    cables: { created: [], deleted: [], modified: [] },
    elements: { created: [], deleted: [], modified: [] },
  };

  // Equipment
  for (const eqId of deleteEquipmentIds) {
    const eq = dbEquipmentMap.get(eqId);
    if (eq) diff.equipment.deleted.push({ id: eq.id, name: eq.name, materialCategoryCode: eq.materialCategory?.code ?? null });
  }
  for (const eq of input.equipment ?? []) {
    if (!isRealId(eq.id)) {
      diff.equipment.created.push({ id: eq.id ?? null, name: eq.name, materialCategoryCode: eq.materialCategoryCode ?? null });
    } else {
      const cur = dbEquipmentMap.get(eq.id!);
      if (!cur) continue;
      const changes: string[] = [];
      const layoutChanged =
        eq.positionX !== (cur.positionX ?? 0) || eq.positionY !== (cur.positionY ?? 0) ||
        eq.width !== (cur.width2d ?? DEFAULT_EQUIPMENT_WIDTH) || eq.height !== (cur.height2d ?? DEFAULT_EQUIPMENT_HEIGHT) ||
        (eq.rotation ?? 0) !== (cur.rotation ?? 0);
      if (layoutChanged) changes.push('위치 변경');
      if (eq.name !== cur.name) changes.push('이름 변경');
      if (changes.length > 0) {
        diff.equipment.modified.push({ id: eq.id, name: cur.name, materialCategoryCode: cur.materialCategory?.code ?? null, changes });
      }
    }
  }

  // Cables
  for (const cId of deleteCableIds) {
    const c = dbCableMap.get(cId);
    if (c) diff.cables.deleted.push({ id: c.id, cableType: c.cableType });
  }
  for (const cable of input.cables ?? []) {
    if (!isRealId(cable.id)) {
      diff.cables.created.push({ id: cable.id ?? null, cableType: cable.cableType, totalLength: cable.totalLength ?? null });
    } else {
      const cur = dbCableMap.get(cable.id!);
      if (!cur) continue;
      const changes: string[] = [];
      if (cable.sourceEquipmentId !== cur.sourceEquipmentId || cable.targetEquipmentId !== cur.targetEquipmentId) changes.push('연결 변경');
      if (cable.cableType !== cur.cableType) changes.push('종류 변경');
      if (changes.length > 0) {
        diff.cables.modified.push({ id: cable.id, cableType: cable.cableType, changes });
      }
    }
  }

  // Elements
  for (const elId of deleteElementIds) {
    diff.elements.deleted.push({ id: elId });
  }
  for (const el of input.elements ?? []) {
    if (!isRealId(el.id)) {
      diff.elements.created.push({ id: el.id ?? null, elementType: el.elementType });
    }
    // element modifications are not tracked in detail
  }

  return diff;
}

async function captureRoomSnapshot(
  tx: TxClient,
  roomId: string,
  updated: { id: string; name: string; canvasWidth: number; canvasHeight: number; gridSize: number; majorGridSize: number; backgroundColor: string; updatedAt: Date },
  version: number,
) {
  const [snapshotElements, snapshotEquipmentWithPhotos, snapshotCables] = await Promise.all([
    tx.floorPlanElement.findMany({ where: { roomId }, orderBy: { zIndex: 'asc' } }),
    tx.equipment.findMany({
      where: { roomId },
      select: {
        ...EQUIPMENT_SELECT,
        photos: {
          select: { id: true, side: true, imageUrl: true, description: true, takenAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    tx.cable.findMany({
      where: { sourceEquipment: { roomId }, targetEquipment: { roomId } },
      include: {
        sourceEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
        targetEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
        materialCategory: { select: { code: true, displayColor: true } },
      },
    }),
  ]);

  // Collect OFD equipment IDs for fiber path query
  const ofdIds = snapshotEquipmentWithPhotos
    .filter(e => e.materialCategory?.code?.startsWith('EQP-OFD'))
    .map(e => e.id);

  const fiberPaths = ofdIds.length > 0
    ? await tx.fiberPath.findMany({
        where: { OR: [{ ofdAId: { in: ofdIds } }, { ofdBId: { in: ofdIds } }] },
        select: { id: true, ofdAId: true, ofdBId: true, portCount: true, description: true },
      })
    : [];

  return {
    plan: {
      id: updated.id, name: updated.name,
      canvasWidth: updated.canvasWidth, canvasHeight: updated.canvasHeight,
      gridSize: updated.gridSize, majorGridSize: updated.majorGridSize,
      backgroundColor: updated.backgroundColor,
      elements: snapshotElements.map((e) => ({
        id: e.id, elementType: e.elementType,
        properties: e.properties as Record<string, unknown>,
        zIndex: e.zIndex, isVisible: e.isVisible,
        materialCategoryId: e.materialCategoryId,
        specParams: e.specParams,
        pathLength: e.pathLength,
      })),
      equipment: snapshotEquipmentWithPhotos.map(e => ({
        ...mapEquipmentRow(e),
        photos: e.photos.map(p => ({
          id: p.id,
          side: p.side,
          imageUrl: p.imageUrl,
          description: p.description,
          takenAt: p.takenAt?.toISOString() ?? null,
        })),
      })),
      version, updatedAt: updated.updatedAt,
    },
    cables: snapshotCables.map((c) => ({
      id: c.id,
      sourceEquipmentId: c.sourceEquipmentId, targetEquipmentId: c.targetEquipmentId,
      cableType: c.cableType, label: c.label, length: c.length, color: c.color,
      pathPoints: c.pathPoints, description: c.description,
      fiberPathId: c.fiberPathId, fiberPortNumber: c.fiberPortNumber,
      materialCategoryId: c.materialCategoryId,
      materialCategoryCode: c.materialCategory?.code ?? null,
      displayColor: c.materialCategory?.displayColor ?? null,
      specParams: c.specParams,
      pathLength: c.pathLength,
      bufferLength: c.bufferLength,
      totalLength: c.totalLength,
      sourceEquipment: c.sourceEquipment, targetEquipment: c.targetEquipment,
    })),
    fiberPaths,
  };
}

// ==================== Service ====================

class RoomService {
  async getListByFloor(floorId: string): Promise<RoomListItem[]> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const rooms = await prisma.room.findMany({
      where: { floorId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return rooms.map((r) => ({
      id: r.id,
      floorId: r.floorId,
      name: r.name,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    }));
  }

  async getById(id: string): Promise<RoomDetail> {
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundError('실');
    return toRoomDetail(room);
  }

  async getPlan(id: string, version?: number): Promise<RoomPlanDetail> {
    // Version query: load from audit log snapshot
    if (version !== undefined) {
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'Room', entityId: id, actionDetail: `v${version}` },
        select: { newValues: true },
      });
      if (!log?.newValues) throw new NotFoundError('해당 버전');

      const snapshot = log.newValues as any;

      // New format: { plan, cables, fiberPaths }
      if (snapshot.plan) {
        return {
          ...snapshot.plan,
          scaleRatio: snapshot.plan.scaleRatio ?? null,
          cables: snapshot.cables ?? [],
          fiberPaths: snapshot.fiberPaths ?? [],
        };
      }

      // Legacy format: flat structure
      if (snapshot.elements && snapshot.equipment) {
        const room = await prisma.room.findUnique({ where: { id }, select: { name: true } });
        return {
          id,
          name: room?.name ?? '',
          canvasWidth: snapshot.canvasWidth,
          canvasHeight: snapshot.canvasHeight,
          gridSize: snapshot.gridSize,
          majorGridSize: snapshot.majorGridSize,
          backgroundColor: snapshot.backgroundColor,
          scaleRatio: snapshot.scaleRatio ?? null,
          elements: snapshot.elements,
          equipment: snapshot.equipment,
          cables: snapshot.cables ?? [],
          fiberPaths: [],
          version: 0,
          updatedAt: snapshot.updatedAt ?? new Date(),
        };
      }

      throw new NotFoundError('해당 버전');
    }

    // Current version: load from live DB
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        elements: {
          orderBy: { zIndex: 'asc' },
        },
      },
    });

    if (!room) throw new NotFoundError('실');

    const [equipment, racks, cables, allOfdEquipment] = await Promise.all([
      prisma.equipment.findMany({
        where: { roomId: id },
        select: EQUIPMENT_SELECT,
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.rack.findMany({
        where: { roomId: id },
        select: { id: true, positionX: true, positionY: true },
      }),
      prisma.cable.findMany({
        where: {
          OR: [
            { sourceEquipment: { OR: [{ rack: { roomId: id } }, { roomId: id }] } },
            { targetEquipment: { OR: [{ rack: { roomId: id } }, { roomId: id }] } },
          ],
        },
        include: {
          sourceEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
          targetEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
          materialCategory: { select: { code: true, displayColor: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.equipment.findMany({
        where: { roomId: id, materialCategory: { code: { startsWith: 'EQP-OFD' } } },
        select: { id: true },
      }),
    ]);

    // Build rackId → parentEquipmentId map by position matching
    const rackToEquipmentMap = new Map<string, string>();
    for (const rack of racks) {
      const parentEq = equipment.find(e =>
        e.materialCategory?.code?.startsWith('EQP-RACK') &&
        Math.abs((e.positionX ?? 0) - rack.positionX) < RACK_POSITION_TOLERANCE &&
        Math.abs((e.positionY ?? 0) - rack.positionY) < RACK_POSITION_TOLERANCE
      );
      if (parentEq) {
        rackToEquipmentMap.set(rack.id, parentEq.id);
      }
    }

    // Fiber paths connected to OFDs in this room
    const ofdIds = allOfdEquipment.map(e => e.id);
    const fiberPaths = ofdIds.length > 0
      ? await prisma.fiberPath.findMany({
          where: { OR: [{ ofdAId: { in: ofdIds } }, { ofdBId: { in: ofdIds } }] },
          select: { id: true, ofdAId: true, ofdBId: true, portCount: true, description: true },
        })
      : [];

    return {
      id: room.id,
      name: room.name,
      canvasWidth: room.canvasWidth,
      canvasHeight: room.canvasHeight,
      gridSize: room.gridSize,
      majorGridSize: room.majorGridSize,
      backgroundColor: room.backgroundColor,
      scaleRatio: room.scaleRatio ?? null,
      elements: room.elements.map((e) => ({
        id: e.id,
        elementType: e.elementType,
        properties: e.properties as Record<string, unknown>,
        zIndex: e.zIndex,
        isVisible: e.isVisible,
        materialCategoryId: e.materialCategoryId,
        specParams: e.specParams,
        pathLength: e.pathLength,
      })),
      equipment: equipment.map(e => mapEquipmentRow(e, rackToEquipmentMap)),
      cables: cables.map(c => ({
        id: c.id,
        sourceEquipmentId: c.sourceEquipmentId,
        targetEquipmentId: c.targetEquipmentId,
        cableType: c.cableType,
        label: c.label,
        length: c.length,
        color: c.color,
        pathPoints: c.pathPoints,
        description: c.description,
        fiberPathId: c.fiberPathId,
        fiberPortNumber: c.fiberPortNumber,
        materialCategoryId: c.materialCategoryId,
        materialCategoryCode: c.materialCategory?.code ?? null,
        displayColor: c.materialCategory?.displayColor ?? null,
        specParams: c.specParams,
        pathLength: c.pathLength,
        bufferLength: c.bufferLength ?? 4,
        totalLength: c.totalLength,
        sourceEquipment: c.sourceEquipment,
        targetEquipment: c.targetEquipment,
      })),
      fiberPaths,
      version: room.version,
      updatedAt: room.updatedAt,
    };
  }

  async create(floorId: string, input: CreateRoomInput, userId: string): Promise<RoomDetail> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const existing = await prisma.room.findFirst({
      where: { floorId, name: input.name },
    });
    if (existing) throw new ConflictError('동일한 이름의 실이 이미 존재합니다.');

    const room = await prisma.room.create({
      data: {
        floorId,
        name: input.name,
        createdById: userId,
        updatedById: userId,
      },
    });

    return toRoomDetail(room);
  }

  async update(id: string, input: UpdateRoomInput, userId: string): Promise<RoomDetail> {
    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('실');

    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.room.findFirst({
        where: { floorId: existing.floorId, name: input.name, id: { not: id } },
      });
      if (nameExists) throw new ConflictError('동일한 이름의 실이 이미 존재합니다.');
    }

    const room = await prisma.room.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });

    return toRoomDetail(room);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('실');
    await prisma.room.delete({ where: { id } });
  }

  /**
   * 도면 전체 저장 — State Reconciliation (Git-like save)
   *
   * Receives the COMPLETE desired state and reconciles against DB:
   * - Element/Equipment/Cable in received with valid UUID in DB → UPDATE
   * - Element/Equipment/Cable in received without ID or temp ID → CREATE
   * - Element/Equipment/Cable in DB but NOT in received → DELETE
   *
   * For backward compatibility, explicit deletedXxxIds arrays are still
   * accepted and merged with the reconciliation-computed deletions.
   *
   * Change detection determines whether the save is structural (layout change)
   * or metadata-only. Structural changes increment the version and capture a
   * full snapshot for historical preview.
   */
  async bulkUpdatePlan(
    id: string,
    input: UpdatePlanInput,
    userId: string
  ): Promise<{ id: string; version: number; message: string; equipmentIdMap: Record<string, string>; fiberPathIdMap: Record<string, string>; auditLogId: string | null }> {
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundError('실');

    let newVersion = room.version;
    const equipmentIdMap: Record<string, string> = {};
    let finalFiberPathIdMap: Record<string, string> = {};
    let auditLogId: string | null = null;

    await prisma.$transaction(async (tx) => {
      // ── Step 0: Load current DB state for reconciliation ──
      const [dbElements, dbEquipment, dbCables] = await Promise.all([
        tx.floorPlanElement.findMany({
          where: { roomId: id },
          select: {
            id: true, elementType: true, properties: true, zIndex: true, isVisible: true,
            materialCategoryId: true, specParams: true, pathLength: true,
          },
        }),
        tx.equipment.findMany({
          where: { roomId: id },
          select: {
            id: true, name: true, category: true,
            positionX: true, positionY: true, width2d: true, height2d: true,
            rotation: true, description: true, model: true, manufacturer: true,
            manager: true, height3d: true, materialCategoryId: true,
            materialCategory: { select: { code: true } },
            specParams: true,
          },
        }),
        tx.cable.findMany({
          where: {
            OR: [
              { sourceEquipment: { roomId: id } },
              { targetEquipment: { roomId: id } },
            ],
          },
          select: {
            id: true, sourceEquipmentId: true, targetEquipmentId: true,
            cableType: true, fiberPathId: true, fiberPortNumber: true,
          },
        }),
      ]);

      // Build old snapshot (Before state) for audit log oldValues
      const oldSnapshot = buildOldSnapshot(room, dbElements, dbEquipment, dbCables);

      const dbElementIds = new Set(dbElements.map(e => e.id));
      const dbEquipmentIds = new Set(dbEquipment.map(e => e.id));
      const dbEquipmentMap = new Map(dbEquipment.map(e => [e.id, e]));
      const dbCableIds = new Set(dbCables.map(c => c.id));
      const dbCableMap = new Map(dbCables.map(c => [c.id, c]));

      // ── Step 1: Compute reconciliation diffs ──

      // Elements diff
      const receivedElementIds = new Set(
        (input.elements ?? []).filter(e => isRealId(e.id)).map(e => e.id!)
      );
      const computedDeleteElementIds = [...dbElementIds].filter(id => !receivedElementIds.has(id));
      const deleteElementIds = new Set(computedDeleteElementIds);

      // Equipment diff
      const receivedEquipmentIds = new Set(
        (input.equipment ?? []).filter(e => isRealId(e.id)).map(e => e.id!)
      );
      const computedDeleteEquipmentIds = [...dbEquipmentIds].filter(id => !receivedEquipmentIds.has(id));
      const deleteEquipmentIds = new Set(computedDeleteEquipmentIds);

      // Cables diff (computed after equipment processing for tempId resolution)
      const receivedCableIds = new Set(
        (input.cables ?? []).filter(c => isRealId(c.id)).map(c => c.id!)
      );
      // Only delete cables where BOTH endpoints belong to this room's equipment
      const roomEquipmentIds = new Set([...dbEquipmentMap.keys()]);
      const computedDeleteCableIds = [...dbCableIds].filter(id => {
        if (receivedCableIds.has(id)) return false;
        const cable = dbCableMap.get(id);
        if (!cable) return false;
        const sourceInRoom = roomEquipmentIds.has(cable.sourceEquipmentId);
        const targetInRoom = roomEquipmentIds.has(cable.targetEquipmentId);
        return sourceInRoom && targetInRoom;
      });
      const deleteCableIds = new Set(computedDeleteCableIds);

      // ── Step 1.5: Detect changes BEFORE applying mutations ──
      const allChanges: DetailedChange[] = [];

      // Element changes
      if (deleteElementIds.size > 0) {
        allChanges.push({ description: `구조 요소 ${deleteElementIds.size}개 삭제`, isStructural: true });
      }
      const newElements = (input.elements ?? []).filter(e => !isRealId(e.id));
      if (newElements.length > 0) {
        allChanges.push({ description: `구조 요소 ${newElements.length}개 추가`, isStructural: true });
      }

      // Equipment changes
      for (const eqId of deleteEquipmentIds) {
        const existing = dbEquipmentMap.get(eqId);
        allChanges.push({ description: `${existing?.name ?? '설비'} 삭제`, isStructural: true });
      }
      for (const eq of input.equipment ?? []) {
        if (!isRealId(eq.id)) {
          allChanges.push({ description: `${eq.name} 추가`, isStructural: true });
          continue;
        }
        const cur = dbEquipmentMap.get(eq.id!);
        if (!cur) continue;
        const layoutChanged =
          eq.positionX !== (cur.positionX ?? 0) ||
          eq.positionY !== (cur.positionY ?? 0) ||
          eq.width !== (cur.width2d ?? DEFAULT_EQUIPMENT_WIDTH) ||
          eq.height !== (cur.height2d ?? DEFAULT_EQUIPMENT_HEIGHT) ||
          (eq.rotation ?? 0) !== (cur.rotation ?? 0);
        if (layoutChanged) {
          allChanges.push({ description: `${cur.name} 위치/크기 변경`, isStructural: true });
        }
        const metaFields: string[] = [];
        if (eq.name !== cur.name) metaFields.push('이름');
        if (nullableChanged(eq.description, cur.description)) metaFields.push('설명');
        if (nullableChanged(eq.model, cur.model)) metaFields.push('모델');
        if (nullableChanged(eq.manufacturer, cur.manufacturer)) metaFields.push('제조사');
        if (nullableChanged(eq.manager, cur.manager)) metaFields.push('담당자');
        if (nullableChanged(eq.height3d, cur.height3d)) metaFields.push('높이(3D)');
        if (eq.category !== undefined && eq.category !== cur.category) metaFields.push('카테고리');
        if (metaFields.length > 0) {
          allChanges.push({ description: `${cur.name} 정보 수정 (${metaFields.join(', ')})`, isStructural: false });
        }
      }

      // Cable changes
      if (deleteCableIds.size > 0) {
        allChanges.push({ description: `케이블 ${deleteCableIds.size}개 해제`, isStructural: true });
      }
      const newCables = (input.cables ?? []).filter(c => !isRealId(c.id));
      const updatedCables = (input.cables ?? []).filter(c => isRealId(c.id));
      if (newCables.length > 0) {
        allChanges.push({ description: `케이블 ${newCables.length}개 연결`, isStructural: true });
      }
      if (updatedCables.length > 0) {
        let topologyCount = 0;
        let metadataCount = 0;
        for (const cable of updatedCables) {
          const cur = dbCableMap.get(cable.id!);
          if (!cur) { topologyCount++; continue; }
          const topologyChanged =
            cable.sourceEquipmentId !== cur.sourceEquipmentId ||
            cable.targetEquipmentId !== cur.targetEquipmentId ||
            cable.cableType !== cur.cableType ||
            (cable.fiberPathId ?? null) !== cur.fiberPathId ||
            (cable.fiberPortNumber ?? null) !== cur.fiberPortNumber;
          if (topologyChanged) topologyCount++;
          else metadataCount++;
        }
        if (topologyCount > 0) {
          allChanges.push({ description: `케이블 ${topologyCount}개 연결 변경`, isStructural: true });
        }
        if (metadataCount > 0) {
          allChanges.push({ description: `케이블 ${metadataCount}개 정보 수정`, isStructural: false });
        }
      }

      // Canvas changes
      allChanges.push(...detectCanvasChanges(input, room));

      const hasStructuralChange = allChanges.some(c => c.isStructural);
      const hasAnyChange = allChanges.length > 0;

      // Build structured diff for audit context
      const structuredDiff = buildStructuredDiff(
        input, dbEquipmentMap, dbCableMap,
        deleteEquipmentIds, deleteCableIds, deleteElementIds,
      );

      // ── Step 2: Apply mutations ──

      // 2a. Delete elements
      if (deleteElementIds.size > 0) {
        await tx.floorPlanElement.deleteMany({
          where: { id: { in: [...deleteElementIds] }, roomId: id },
        });
      }

      // 2b. Delete cables (before equipment, since cascade from equipment delete
      //     would handle cables automatically, but we want explicit control for
      //     cables that are removed independently)
      if (deleteCableIds.size > 0) {
        await tx.cable.deleteMany({
          where: { id: { in: [...deleteCableIds] } },
        });
      }

      // 2c. Delete equipment + auto-delete associated Rack for EQP-RACK
      if (deleteEquipmentIds.size > 0) {
        // Check for EQP-RACK equipment being deleted → delete corresponding Rack
        const hasRackEquipment = [...deleteEquipmentIds].some(eqId => {
          const eq = dbEquipmentMap.get(eqId);
          return eq?.materialCategory?.code?.startsWith('EQP-RACK');
        });
        const roomRacksForDelete = hasRackEquipment
          ? await tx.rack.findMany({ where: { roomId: id } })
          : [];

        for (const eqId of deleteEquipmentIds) {
          const eq = dbEquipmentMap.get(eqId);
          if (eq?.materialCategory?.code?.startsWith('EQP-RACK')) {
            const matchingRack = roomRacksForDelete.find(r =>
              Math.abs(r.positionX - (eq.positionX ?? 0)) < RACK_POSITION_TOLERANCE &&
              Math.abs(r.positionY - (eq.positionY ?? 0)) < RACK_POSITION_TOLERANCE
            );
            if (matchingRack) {
              await tx.rack.delete({ where: { id: matchingRack.id } });
            }
          }
        }
        await tx.equipment.deleteMany({
          where: { id: { in: [...deleteEquipmentIds] }, roomId: id },
        });
      }

      // 2d. Upsert elements
      for (const element of input.elements ?? []) {
        if (isRealId(element.id) && dbElementIds.has(element.id)) {
          await tx.floorPlanElement.update({
            where: { id: element.id },
            data: {
              elementType: element.elementType,
              properties: element.properties as Prisma.InputJsonValue,
              zIndex: element.zIndex ?? 0,
              isVisible: element.isVisible ?? true,
              materialCategoryId: element.materialCategoryId,
              specParams: element.specParams as Prisma.InputJsonValue | undefined,
              pathLength: element.pathLength,
            },
          });
        } else if (!isRealId(element.id)) {
          await tx.floorPlanElement.create({
            data: {
              roomId: id,
              elementType: element.elementType,
              properties: element.properties as Prisma.InputJsonValue,
              zIndex: element.zIndex ?? 0,
              materialCategoryId: element.materialCategoryId,
              specParams: element.specParams as Prisma.InputJsonValue | undefined,
              pathLength: element.pathLength,
              isVisible: element.isVisible ?? true,
            },
          });
        }
      }

      // 2e. OFD uniqueness check
      if (input.equipment && input.equipment.length > 0) {
        const newOfdEquipment = input.equipment.filter(
          (e) => e.category === 'OFD' && !isRealId(e.id)
        );
        if (newOfdEquipment.length > 0) {
          await equipmentService.validateOfdUniqueness(id);
        }
      }

      // 2f. Upsert equipment
      for (const equip of input.equipment ?? []) {
        if (isRealId(equip.id) && dbEquipmentIds.has(equip.id)) {
          // UPDATE existing equipment
          await tx.equipment.update({
            where: { id: equip.id },
            data: {
              name: equip.name,
              category: equip.category as EquipmentCategory | undefined,
              positionX: equip.positionX,
              positionY: equip.positionY,
              width2d: equip.width,
              height2d: equip.height,
              rotation: equip.rotation ?? 0,
              description: equip.description,
              model: equip.model,
              manufacturer: equip.manufacturer,
              manager: equip.manager,
              height3d: equip.height3d,
              materialCategoryId: equip.materialCategoryId,
              specParams: equip.specParams as Prisma.InputJsonValue | undefined,
              updatedById: userId,
            },
          });
        } else {
          // CREATE new equipment
          const created = await tx.equipment.create({
            data: {
              roomId: id,
              name: equip.name,
              category: (equip.category as EquipmentCategory) ?? 'NETWORK',
              positionX: equip.positionX,
              positionY: equip.positionY,
              width2d: equip.width,
              height2d: equip.height,
              rotation: equip.rotation ?? 0,
              description: equip.description,
              model: equip.model,
              manufacturer: equip.manufacturer,
              manager: equip.manager,
              height3d: equip.height3d,
              materialCategoryId: equip.materialCategoryId,
              specParams: equip.specParams as Prisma.InputJsonValue | undefined,
              createdById: userId,
              updatedById: userId,
            },
          });
          // Map old ID → new ID so cables can resolve references
          if (equip.tempId) {
            equipmentIdMap[equip.tempId] = created.id;
          }
          // Also map the original real UUID (if equipment was recreated because it didn't exist in DB)
          if (equip.id && equip.id !== created.id) {
            equipmentIdMap[equip.id] = created.id;
          }

          // Auto-Rack creation for EQP-RACK equipment
          const matCode = equip.materialCategoryCode;
          if (matCode?.startsWith('EQP-RACK')) {
            // Check if a Rack already exists at this position (within tolerance)
            const existingRacks = await tx.rack.findMany({ where: { roomId: id } });
            const alreadyExists = existingRacks.some(r =>
              Math.abs(r.positionX - equip.positionX) < RACK_POSITION_TOLERANCE &&
              Math.abs(r.positionY - equip.positionY) < RACK_POSITION_TOLERANCE
            );
            if (!alreadyExists) {
              await tx.rack.create({
                data: {
                  roomId: id,
                  name: equip.name,
                  positionX: equip.positionX,
                  positionY: equip.positionY,
                  width: equip.width,
                  height: equip.height,
                  rotation: equip.rotation ?? 0,
                  totalU: 42,
                  createdById: userId,
                  updatedById: userId,
                },
              });
            }
          }
        }
      }

      // 2g. Resolve rack-internal equipment (parentEquipmentId → rackId)
      const rackInternalEquipment = (input.equipment ?? []).filter(e => e.parentEquipmentId);
      if (rackInternalEquipment.length > 0) {
        // Load all racks for this room
        const roomRacks = await tx.rack.findMany({ where: { roomId: id } });
        // Load all equipment (including newly created) to resolve parent positions
        const allEquipment = await tx.equipment.findMany({
          where: { roomId: id },
          select: { id: true, positionX: true, positionY: true, materialCategoryId: true, materialCategory: { select: { code: true } } },
        });

        for (const equip of rackInternalEquipment) {
          // Resolve parentEquipmentId (could be temp ID)
          const resolvedParentId = equipmentIdMap[equip.parentEquipmentId!] ?? equip.parentEquipmentId!;
          // Find the parent equipment to get its position
          const parentEq = allEquipment.find(e => e.id === resolvedParentId);
          if (!parentEq) continue;

          // Find the Rack at the same position as the parent equipment
          const matchingRack = roomRacks.find(r =>
            Math.abs(r.positionX - (parentEq.positionX ?? 0)) < RACK_POSITION_TOLERANCE &&
            Math.abs(r.positionY - (parentEq.positionY ?? 0)) < RACK_POSITION_TOLERANCE
          );
          if (!matchingRack) continue;

          // Resolve the equipment's own ID (could be temp ID)
          const resolvedEquipId = equip.tempId ? equipmentIdMap[equip.tempId] : equip.id;
          if (!resolvedEquipId) continue;

          await tx.equipment.update({
            where: { id: resolvedEquipId },
            data: {
              rackId: matchingRack.id,
              startU: equip.startU ?? null,
              heightU: equip.heightU ?? 1,
            },
          });
        }
      }

      // 2h. Process fiber paths (after equipment so tempIds are resolved)
      const fiberPathIdMap: Record<string, string> = {};
      if (input.fiberPaths && input.fiberPaths.length > 0) {
        for (const fp of input.fiberPaths) {
          const resolvedOfdAId = equipmentIdMap[fp.ofdAId] ?? fp.ofdAId;

          if (isRealId(fp.id)) {
            // UPDATE existing fiber path
            await tx.fiberPath.update({
              where: { id: fp.id },
              data: {
                ofdAId: resolvedOfdAId,
                ofdBId: fp.ofdBId,
                portCount: fp.portCount,
                description: fp.description ?? null,
                updatedById: userId,
              },
            });
          } else {
            // CREATE new fiber path
            const created = await tx.fiberPath.create({
              data: {
                ofdAId: resolvedOfdAId,
                ofdBId: fp.ofdBId,
                portCount: fp.portCount,
                description: fp.description ?? null,
                createdById: userId,
                updatedById: userId,
              },
            });
            if (fp.id) {
              fiberPathIdMap[fp.id] = created.id;
            }
          }
        }
      }

      // 2h-2. Delete fiber paths
      if (input.deletedFiberPathIds && input.deletedFiberPathIds.length > 0) {
        await tx.fiberPath.deleteMany({
          where: { id: { in: input.deletedFiberPathIds } },
        });
      }

      // 2i. Reconcile cables (after equipment and fiber paths so tempIds are resolved)
      for (const cable of input.cables ?? []) {
        const srcId = equipmentIdMap[cable.sourceEquipmentId] ?? cable.sourceEquipmentId;
        const tgtId = equipmentIdMap[cable.targetEquipmentId] ?? cable.targetEquipmentId;
        const resolvedFiberPathId = cable.fiberPathId
          ? (fiberPathIdMap[cable.fiberPathId] ?? cable.fiberPathId)
          : null;

        // Skip cables whose source/target equipment doesn't exist (unresolvable)
        if (!isRealId(srcId) || !isRealId(tgtId)) continue;

        // Verify endpoints actually exist in DB (guard against stale references)
        const [srcExists, tgtExists] = await Promise.all([
          tx.equipment.findUnique({ where: { id: srcId }, select: { id: true } }),
          tx.equipment.findUnique({ where: { id: tgtId }, select: { id: true } }),
        ]);
        if (!srcExists || !tgtExists) continue;

        if (isRealId(cable.id) && dbCableIds.has(cable.id!)) {
          // UPDATE existing cable
          await tx.cable.update({
            where: { id: cable.id! },
            data: {
              sourceEquipmentId: srcId,
              targetEquipmentId: tgtId,
              cableType: cable.cableType as CableType,
              label: cable.label,
              length: cable.length,
              color: cable.color,
              description: cable.description,
              fiberPathId: resolvedFiberPathId,
              fiberPortNumber: cable.fiberPortNumber ?? null,
              materialCategoryId: cable.materialCategoryId,
              specParams: cable.specParams as Prisma.InputJsonValue | undefined,
              pathPoints: cable.pathPoints as Prisma.InputJsonValue | undefined,
              pathLength: cable.pathLength,
              bufferLength: cable.bufferLength,
              totalLength: cable.totalLength,
              updatedById: userId,
            },
          });
        } else {
          // CREATE new cable
          // Port exclusivity: prevent duplicate fiber port assignment
          if (resolvedFiberPathId && cable.fiberPortNumber) {
            const existingOnPort = await tx.cable.findFirst({
              where: {
                fiberPathId: resolvedFiberPathId,
                fiberPortNumber: cable.fiberPortNumber,
                OR: [{ sourceEquipmentId: tgtId }, { targetEquipmentId: tgtId }],
              },
            });
            if (existingOnPort) {
              throw new ConflictError(`광경로 포트 ${cable.fiberPortNumber}번이 이미 사용 중입니다.`);
            }
          }
          await tx.cable.create({
            data: {
              sourceEquipmentId: srcId,
              targetEquipmentId: tgtId,
              cableType: cable.cableType as CableType,
              label: cable.label,
              length: cable.length,
              color: cable.color,
              description: cable.description,
              fiberPathId: resolvedFiberPathId,
              fiberPortNumber: cable.fiberPortNumber ?? null,
              materialCategoryId: cable.materialCategoryId,
              specParams: cable.specParams as Prisma.InputJsonValue | undefined,
              pathPoints: cable.pathPoints as Prisma.InputJsonValue | undefined,
              pathLength: cable.pathLength,
              bufferLength: cable.bufferLength,
              totalLength: cable.totalLength,
              createdById: userId,
              updatedById: userId,
            },
          });
        }
      }

      // ── Step 3: Conditional version increment ──
      const updated = await tx.room.update({
        where: { id },
        data: {
          canvasWidth: input.canvasWidth,
          canvasHeight: input.canvasHeight,
          gridSize: input.gridSize,
          majorGridSize: input.majorGridSize,
          backgroundColor: input.backgroundColor,
          ...(input.scaleRatio !== undefined ? { scaleRatio: input.scaleRatio } : {}),
          ...(hasStructuralChange ? { version: { increment: 1 } } : {}),
          updatedById: userId,
        },
      });
      newVersion = updated.version;

      // ── Step 4: Audit log ──
      if (!hasAnyChange) return; // No actual changes — skip audit entirely

      const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
      const changedFields = buildChangeSummary(allChanges);
      const actionDetail = hasStructuralChange
        ? truncate(`v${newVersion}`, ACTION_DETAIL_MAX_LEN)
        : truncate('정보 수정', ACTION_DETAIL_MAX_LEN);

      if (hasStructuralChange) {
        // Structural change: capture complete snapshot for historical preview
        const snapshot = await captureRoomSnapshot(tx, id, updated, newVersion);

        const auditEntry = await tx.auditLog.create({
          data: {
            entityType: 'Room', entityId: id, entityName: room.name,
            action: 'UPDATE', actionDetail,
            changedFields,
            oldValues: oldSnapshot as any,
            newValues: snapshot as any,
            context: { diff: structuredDiff } as any,
            userId, userName: user?.name ?? null,
          },
        });
        auditLogId = auditEntry.id;
      } else {
        // Metadata-only change: lightweight audit entry without snapshot
        const auditEntry = await tx.auditLog.create({
          data: {
            entityType: 'Room', entityId: id, entityName: room.name,
            action: 'UPDATE', actionDetail,
            changedFields,
            oldValues: oldSnapshot as any,
            context: { diff: structuredDiff } as any,
            userId, userName: user?.name ?? null,
          },
        });
        auditLogId = auditEntry.id;
      }

      finalFiberPathIdMap = fiberPathIdMap;
    });

    return {
      id: id,
      version: newVersion,
      message: '저장되었습니다.',
      equipmentIdMap,
      fiberPathIdMap: finalFiberPathIdMap,
      auditLogId,
    };
  }

  /**
   * 도면 변경 이력 조회
   */
  async getAuditLogs(roomId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('실');

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Room', entityId: roomId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        entityName: true,
        action: true,
        actionDetail: true,
        changedFields: true,
        // oldValues omitted — large payload, not needed for list
        newValues: true, // only used to derive hasSnapshot flag
        context: true,
        userName: true,
        createdAt: true,
      },
    });

    return logs.map(({ newValues, ...rest }) => {
      // Extract version number from actionDetail (e.g., "v7" → 7)
      const versionMatch = rest.actionDetail?.match(/^v(\d+)$/);
      return {
        ...rest,
        hasSnapshot: newValues !== null,
        version: versionMatch ? parseInt(versionMatch[1], 10) : null,
      };
    });
  }

  /**
   * 특정 변경 이력의 스냅샷 데이터 반환 (DB 수정 없음)
   */
  async getAuditLogSnapshot(roomId: string, auditLogId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('실');

    const log = await prisma.auditLog.findFirst({
      where: { id: auditLogId, entityType: 'Room', entityId: roomId },
    });
    if (!log) throw new NotFoundError('변경 이력');

    const snapshot = log.newValues as any;
    if (!snapshot) {
      throw new ConflictError('이 버전에는 되돌리기 데이터가 없습니다.');
    }

    // New format: { plan: RoomPlanDetail, cables: [...], fiberPaths: [...] }
    if (snapshot.plan) {
      return {
        plan: snapshot.plan,
        cables: snapshot.cables ?? [],
        fiberPaths: snapshot.fiberPaths ?? [],
      };
    }

    // Legacy format: { elements, equipment, cables, canvasWidth, ... }
    if (snapshot.elements && snapshot.equipment) {
      return {
        plan: {
          id: roomId,
          name: room?.name ?? '',
          canvasWidth: snapshot.canvasWidth,
          canvasHeight: snapshot.canvasHeight,
          gridSize: snapshot.gridSize,
          majorGridSize: snapshot.majorGridSize,
          backgroundColor: snapshot.backgroundColor,
          elements: snapshot.elements,
          equipment: snapshot.equipment,
          version: 0,
          updatedAt: log.createdAt,
        },
        cables: snapshot.cables ?? [],
        fiberPaths: [],
      };
    }

    throw new ConflictError('이 버전에는 되돌리기 데이터가 없습니다.');
  }

  /**
   * 도면 변경 이력 context 부분 업데이트 (merge)
   */
  async patchAuditLogContext(roomId: string, logId: string, context: Record<string, unknown>) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('실');

    const log = await prisma.auditLog.findFirst({
      where: { id: logId, entityType: 'Room', entityId: roomId },
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

  /**
   * 도면 변경 이력 삭제
   */
  async deleteAuditLog(logId: string) {
    const log = await prisma.auditLog.findUnique({ where: { id: logId } });
    if (!log) throw new NotFoundError('변경 이력');
    await prisma.auditLog.delete({ where: { id: logId } });
  }
}

export const roomService = new RoomService();

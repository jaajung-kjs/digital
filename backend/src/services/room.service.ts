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
  elements?: {
    id?: string | null;
    elementType: string;
    properties: Record<string, unknown>;
    zIndex?: number;
    isVisible?: boolean;
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
  }[];
  deletedElementIds?: string[];
  deletedEquipmentIds?: string[];
  deletedCableIds?: string[];
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
} as const;

type EquipmentRow = Prisma.EquipmentGetPayload<{ select: typeof EQUIPMENT_SELECT }>;

function mapEquipmentRow(e: EquipmentRow) {
  return {
    id: e.id, name: e.name, category: e.category,
    positionX: e.positionX ?? 0, positionY: e.positionY ?? 0,
    width: e.width2d ?? DEFAULT_EQUIPMENT_WIDTH, height: e.height2d ?? DEFAULT_EQUIPMENT_HEIGHT,
    rotation: e.rotation ?? 0,
    frontImageUrl: e.frontImageUrl, rearImageUrl: e.rearImageUrl,
    description: e.description, model: e.model,
    manufacturer: e.manufacturer, manager: e.manager, height3d: e.height3d,
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

// ==================== Change Detection ====================

interface DetailedChange {
  description: string;
  isStructural: boolean;
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Compare current DB equipment with input to detect what actually changed.
 */
async function detectEquipmentChanges(
  tx: TxClient,
  roomId: string,
  inputEquipment: UpdatePlanInput['equipment'],
  deletedEquipmentIds: string[] | undefined,
): Promise<DetailedChange[]> {
  const changes: DetailedChange[] = [];
  if (!inputEquipment?.length && !deletedEquipmentIds?.length) return changes;

  const currentEquipment = await tx.equipment.findMany({
    where: { roomId },
    select: {
      id: true, name: true, category: true,
      positionX: true, positionY: true, width2d: true, height2d: true,
      rotation: true, description: true, model: true, manufacturer: true,
      manager: true, height3d: true,
    },
  });
  const currentMap = new Map(currentEquipment.map(e => [e.id, e]));

  // Deleted equipment
  for (const id of deletedEquipmentIds ?? []) {
    const existing = currentMap.get(id);
    changes.push({ description: `${existing?.name ?? '설비'} 삭제`, isStructural: true });
  }

  for (const eq of inputEquipment ?? []) {
    if (!eq.id) {
      changes.push({ description: `${eq.name} 추가`, isStructural: true });
      continue;
    }
    const cur = currentMap.get(eq.id);
    if (!cur) continue;

    // Layout (structural)
    const layoutChanged =
      eq.positionX !== (cur.positionX ?? 0) ||
      eq.positionY !== (cur.positionY ?? 0) ||
      eq.width !== (cur.width2d ?? DEFAULT_EQUIPMENT_WIDTH) ||
      eq.height !== (cur.height2d ?? DEFAULT_EQUIPMENT_HEIGHT) ||
      (eq.rotation ?? 0) !== (cur.rotation ?? 0);
    if (layoutChanged) {
      changes.push({ description: `${cur.name} 위치/크기 변경`, isStructural: true });
    }

    // Metadata (non-structural)
    const metaFields: string[] = [];
    if (eq.name !== cur.name) metaFields.push('이름');
    if (nullableChanged(eq.description, cur.description)) metaFields.push('설명');
    if (nullableChanged(eq.model, cur.model)) metaFields.push('모델');
    if (nullableChanged(eq.manufacturer, cur.manufacturer)) metaFields.push('제조사');
    if (nullableChanged(eq.manager, cur.manager)) metaFields.push('담당자');
    if (nullableChanged(eq.height3d, cur.height3d)) metaFields.push('높이(3D)');
    if (eq.category !== undefined && eq.category !== cur.category) metaFields.push('카테고리');
    if (metaFields.length > 0) {
      changes.push({
        description: `${cur.name} 정보 수정 (${metaFields.join(', ')})`,
        isStructural: false,
      });
    }
  }

  return changes;
}

function detectElementChanges(
  inputElements: UpdatePlanInput['elements'],
  deletedElementIds: string[] | undefined,
): DetailedChange[] {
  const changes: DetailedChange[] = [];
  if (deletedElementIds?.length) {
    changes.push({ description: `구조 요소 ${deletedElementIds.length}개 삭제`, isStructural: true });
  }
  // Frontend always sends ALL elements — new ones have no id
  const newElements = inputElements?.filter(e => !e.id) ?? [];
  if (newElements.length > 0) {
    changes.push({ description: `구조 요소 ${newElements.length}개 추가`, isStructural: true });
  }
  // Existing elements are always resent by the frontend even when unchanged.
  // We cannot efficiently diff JSON properties, so we only detect adds/deletes.
  // Property-only element edits (e.g., moving a wall) will still be saved to DB
  // but won't trigger a version bump on their own — they're typically part of
  // a larger save that includes detectable equipment/cable changes.
  return changes;
}

async function detectCableChanges(
  tx: TxClient,
  inputCables: UpdatePlanInput['cables'],
  deletedCableIds: string[] | undefined,
): Promise<DetailedChange[]> {
  const changes: DetailedChange[] = [];
  if (deletedCableIds?.length) {
    changes.push({ description: `케이블 ${deletedCableIds.length}개 해제`, isStructural: true });
  }
  if (!inputCables?.length) return changes;

  const newCables = inputCables.filter(c => !c.id);
  const updatedCables = inputCables.filter(c => c.id);

  if (newCables.length > 0) {
    changes.push({ description: `케이블 ${newCables.length}개 연결`, isStructural: true });
  }

  // For updated cables, distinguish topology changes (structural) from metadata (label/color/length)
  if (updatedCables.length > 0) {
    const existingCables = await tx.cable.findMany({
      where: { id: { in: updatedCables.map(c => c.id!) } },
      select: { id: true, sourceEquipmentId: true, targetEquipmentId: true, cableType: true, fiberPathId: true, fiberPortNumber: true },
    });
    const existingMap = new Map(existingCables.map(c => [c.id, c]));

    let topologyCount = 0;
    let metadataCount = 0;
    for (const cable of updatedCables) {
      const cur = existingMap.get(cable.id!);
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
      changes.push({ description: `케이블 ${topologyCount}개 연결 변경`, isStructural: true });
    }
    if (metadataCount > 0) {
      changes.push({ description: `케이블 ${metadataCount}개 정보 수정`, isStructural: false });
    }
  }

  return changes;
}

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

async function captureRoomSnapshot(
  tx: TxClient,
  roomId: string,
  updated: { id: string; name: string; canvasWidth: number; canvasHeight: number; gridSize: number; majorGridSize: number; backgroundColor: string; updatedAt: Date },
  version: number,
) {
  const [snapshotElements, snapshotEquipment, snapshotCables] = await Promise.all([
    tx.floorPlanElement.findMany({ where: { roomId }, orderBy: { zIndex: 'asc' } }),
    tx.equipment.findMany({ where: { roomId }, select: EQUIPMENT_SELECT, orderBy: { sortOrder: 'asc' } }),
    tx.cable.findMany({
      where: { sourceEquipment: { roomId }, targetEquipment: { roomId } },
      include: {
        sourceEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
        targetEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
      },
    }),
  ]);

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
      })),
      equipment: snapshotEquipment.map(mapEquipmentRow),
      version, updatedAt: updated.updatedAt,
    },
    cables: snapshotCables.map((c) => ({
      id: c.id,
      sourceEquipmentId: c.sourceEquipmentId, targetEquipmentId: c.targetEquipmentId,
      cableType: c.cableType, label: c.label, length: c.length, color: c.color,
      pathPoints: c.pathPoints, description: c.description,
      fiberPathId: c.fiberPathId, fiberPortNumber: c.fiberPortNumber,
      sourceEquipment: c.sourceEquipment, targetEquipment: c.targetEquipment,
    })),
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

  async getPlan(id: string): Promise<RoomPlanDetail> {
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        elements: {
          where: { isVisible: true },
          orderBy: { zIndex: 'asc' },
        },
      },
    });

    if (!room) throw new NotFoundError('실');

    const equipment = await prisma.equipment.findMany({
      where: { roomId: id },
      select: EQUIPMENT_SELECT,
      orderBy: { sortOrder: 'asc' },
    });

    return {
      id: room.id,
      name: room.name,
      canvasWidth: room.canvasWidth,
      canvasHeight: room.canvasHeight,
      gridSize: room.gridSize,
      majorGridSize: room.majorGridSize,
      backgroundColor: room.backgroundColor,
      elements: room.elements.map((e) => ({
        id: e.id,
        elementType: e.elementType,
        properties: e.properties as Record<string, unknown>,
        zIndex: e.zIndex,
        isVisible: e.isVisible,
      })),
      equipment: equipment.map(mapEquipmentRow),
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
   * 도면 전체 저장 (벌크 업데이트)
   *
   * Change detection determines whether the save is structural (layout change)
   * or metadata-only. Structural changes increment the version and capture a
   * full snapshot for historical preview. Metadata-only changes are recorded
   * as a lightweight audit entry without a snapshot.
   */
  async bulkUpdatePlan(
    id: string,
    input: UpdatePlanInput,
    userId: string
  ): Promise<{ id: string; version: number; message: string; equipmentIdMap: Record<string, string> }> {
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundError('실');

    let newVersion = room.version;
    const equipmentIdMap: Record<string, string> = {};

    await prisma.$transaction(async (tx) => {
      // ── Step 1: Detect changes BEFORE applying mutations ──
      const equipmentChanges = await detectEquipmentChanges(tx, id, input.equipment, input.deletedEquipmentIds);
      const elementChanges = detectElementChanges(input.elements, input.deletedElementIds);
      const cableChanges = await detectCableChanges(tx, input.cables, input.deletedCableIds);
      const canvasChanges = detectCanvasChanges(input, room);

      const allChanges = [...equipmentChanges, ...elementChanges, ...cableChanges, ...canvasChanges];
      const hasStructuralChange = allChanges.some(c => c.isStructural);
      const hasAnyChange = allChanges.length > 0;

      // ── Step 2: Apply mutations (same as before) ──
      if (input.deletedElementIds && input.deletedElementIds.length > 0) {
        await tx.floorPlanElement.deleteMany({
          where: { id: { in: input.deletedElementIds }, roomId: id },
        });
      }

      if (input.deletedCableIds && input.deletedCableIds.length > 0) {
        await tx.cable.deleteMany({
          where: { id: { in: input.deletedCableIds } },
        });
      }

      if (input.deletedEquipmentIds && input.deletedEquipmentIds.length > 0) {
        await tx.equipment.deleteMany({
          where: { id: { in: input.deletedEquipmentIds }, roomId: id },
        });
      }

      if (input.elements && input.elements.length > 0) {
        for (const element of input.elements) {
          if (element.id) {
            await tx.floorPlanElement.update({
              where: { id: element.id },
              data: {
                elementType: element.elementType,
                properties: element.properties as Prisma.InputJsonValue,
                zIndex: element.zIndex ?? 0,
                isVisible: element.isVisible ?? true,
              },
            });
          } else {
            await tx.floorPlanElement.create({
              data: {
                roomId: id,
                elementType: element.elementType,
                properties: element.properties as Prisma.InputJsonValue,
                zIndex: element.zIndex ?? 0,
                isVisible: element.isVisible ?? true,
              },
            });
          }
        }
      }

      // OFD 변전소당 1개 제약 검사 (equipmentService의 공유 메서드 재사용)
      if (input.equipment && input.equipment.length > 0) {
        const newOfdEquipment = input.equipment.filter(
          (e) => e.category === 'OFD' && !e.id
        );
        if (newOfdEquipment.length > 0) {
          await equipmentService.validateOfdUniqueness(id);
        }
      }

      if (input.equipment && input.equipment.length > 0) {
        for (const equip of input.equipment) {
          if (equip.id) {
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
                updatedById: userId,
              },
            });
          } else {
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
                createdById: userId,
                updatedById: userId,
              },
            });
            if (equip.tempId) {
              equipmentIdMap[equip.tempId] = created.id;
            }
          }
        }
      }

      // Cable create/update (after equipment so tempIds are resolved)
      if (input.cables && input.cables.length > 0) {
        for (const cable of input.cables) {
          const srcId = equipmentIdMap[cable.sourceEquipmentId] ?? cable.sourceEquipmentId;
          const tgtId = equipmentIdMap[cable.targetEquipmentId] ?? cable.targetEquipmentId;

          if (cable.id) {
            await tx.cable.update({
              where: { id: cable.id },
              data: {
                sourceEquipmentId: srcId,
                targetEquipmentId: tgtId,
                cableType: cable.cableType as CableType,
                label: cable.label,
                length: cable.length,
                color: cable.color,
                fiberPathId: cable.fiberPathId ?? null,
                fiberPortNumber: cable.fiberPortNumber ?? null,
                updatedById: userId,
              },
            });
          } else {
            // Port exclusivity: prevent duplicate fiber port assignment
            if (cable.fiberPathId && cable.fiberPortNumber) {
              const existingOnPort = await tx.cable.findFirst({
                where: {
                  fiberPathId: cable.fiberPathId,
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
                fiberPathId: cable.fiberPathId ?? null,
                fiberPortNumber: cable.fiberPortNumber ?? null,
                createdById: userId,
                updatedById: userId,
              },
            });
          }
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

        await tx.auditLog.create({
          data: {
            entityType: 'Room', entityId: id, entityName: room.name,
            action: 'UPDATE', actionDetail,
            changedFields, newValues: snapshot as any,
            userId, userName: user?.name ?? null,
          },
        });
      } else {
        // Metadata-only change: lightweight audit entry without snapshot
        // newValues omitted (SQL NULL) — hasSnapshot check relies on this
        await tx.auditLog.create({
          data: {
            entityType: 'Room', entityId: id, entityName: room.name,
            action: 'UPDATE', actionDetail,
            changedFields,
            userId, userName: user?.name ?? null,
          },
        });
      }
    });

    return {
      id: id,
      version: newVersion,
      message: '저장되었습니다.',
      equipmentIdMap,
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
        newValues: true,
        userName: true,
        createdAt: true,
      },
    });

    return logs.map(({ newValues, ...rest }) => ({
      ...rest,
      hasSnapshot: newValues !== null,
    }));
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

    // New format: { plan: RoomPlanDetail, cables: [...] }
    if (snapshot.plan) {
      return {
        plan: snapshot.plan,
        cables: snapshot.cables ?? [],
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
      };
    }

    throw new ConflictError('이 버전에는 되돌리기 데이터가 없습니다.');
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

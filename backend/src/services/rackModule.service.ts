import prisma from '../config/prisma.js';
import { Prisma, EquipmentKind } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';

// ==================== Types ====================

export interface RackModuleDetail {
  id: string;
  rackEquipmentId: string;
  categoryId: string;
  categoryCode: string | null;
  categoryName: string | null;
  categoryDisplayColor: string | null;
  categoryDefaultSlotSpan: number;
  name: string;
  slotIndex: number;
  slotSpan: number;
  installDate: Date | null;
  manager: string | null;
  description: string | null;
  properties: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRackModuleInput {
  rackEquipmentId: string;
  categoryId: string;
  name?: string;                // 비우면 서버가 자동 생성
  slotIndex: number;
  slotSpan: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

export interface UpdateRackModuleInput {
  name?: string;
  slotIndex?: number;
  slotSpan?: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

export interface BatchUpdateItem {
  id: string;
  slotIndex: number;
  slotSpan: number;
}

export const RACK_SLOT_COUNT = 12 as const;

// ==================== Helpers ====================

const moduleInclude = {
  category: {
    select: {
      id: true,
      code: true,
      name: true,
      displayColor: true,
      defaultSlotSpan: true,
    },
  },
} as const;

interface ExistingSlot {
  id: string;
  slotIndex: number;
  slotSpan: number;
}

export function assertSlotValid(slotIndex: number, slotSpan: number): void {
  if (slotIndex < 0 || slotIndex >= RACK_SLOT_COUNT) {
    throw new ValidationError('slotIndex 는 0..11 이어야 합니다.');
  }
  if (slotSpan < 1 || slotIndex + slotSpan > RACK_SLOT_COUNT) {
    throw new ValidationError('slotSpan 이 슬롯 범위를 벗어났습니다.');
  }
}

export function assertNoSlotCollision(
  slotIndex: number,
  slotSpan: number,
  existing: ExistingSlot[],
  excludeIds: string[] = [],
): void {
  const aStart = slotIndex;
  const aEnd = slotIndex + slotSpan;
  for (const m of existing) {
    if (excludeIds.includes(m.id)) continue;
    const bStart = m.slotIndex;
    const bEnd = m.slotIndex + m.slotSpan;
    if (aStart < bEnd && bStart < aEnd) {
      throw new ConflictError(`슬롯 ${aStart}-${aEnd - 1} 이 모듈 ${m.id} 와 겹칩니다.`);
    }
  }
}

async function generateModuleName(
  rackEquipmentId: string,
  categoryId: string,
  categoryName: string,
): Promise<string> {
  const escaped = categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}-(\\d+)$`);
  const existing = await prisma.rackModule.findMany({
    where: { rackEquipmentId, categoryId },
    select: { name: true },
  });
  let maxN = 0;
  for (const { name } of existing) {
    const match = name.match(pattern);
    if (match) maxN = Math.max(maxN, parseInt(match[1], 10));
  }
  return `${categoryName}-${maxN + 1}`;
}

// ==================== Mapping ====================

function mapDetail(row: Prisma.RackModuleGetPayload<{ include: typeof moduleInclude }>): RackModuleDetail {
  return {
    id: row.id,
    rackEquipmentId: row.rackEquipmentId,
    categoryId: row.categoryId,
    categoryCode: row.category?.code ?? null,
    categoryName: row.category?.name ?? null,
    categoryDisplayColor: row.category?.displayColor ?? null,
    categoryDefaultSlotSpan: row.category?.defaultSlotSpan ?? 1,
    name: row.name,
    slotIndex: row.slotIndex,
    slotSpan: row.slotSpan,
    installDate: row.installDate,
    manager: row.manager,
    description: row.description,
    properties: row.properties,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ==================== Service ====================

async function getByRackId(rackId: string): Promise<RackModuleDetail[]> {
  const rack = await prisma.equipment.findUnique({
    where: { id: rackId },
    select: { id: true, kind: true },
  });
  if (!rack) throw new NotFoundError('랙 설비');
  if (rack.kind !== EquipmentKind.RACK) {
    throw new ValidationError(
      `해당 설비는 RACK 이 아닙니다 (kind=${rack.kind}). 랙 모듈은 RACK 설비에만 속합니다.`,
    );
  }
  const modules = await prisma.rackModule.findMany({
    where: { rackEquipmentId: rackId },
    include: moduleInclude,
    orderBy: [{ slotIndex: 'asc' }, { createdAt: 'asc' }],
  });
  return modules.map(mapDetail);
}

async function getById(id: string): Promise<RackModuleDetail> {
  const module = await prisma.rackModule.findUnique({
    where: { id },
    include: moduleInclude,
  });
  if (!module) throw new NotFoundError('랙 모듈');
  return mapDetail(module);
}

async function create(input: CreateRackModuleInput, userId: string | null): Promise<RackModuleDetail> {
  assertSlotValid(input.slotIndex, input.slotSpan);

  const rack = await prisma.equipment.findUnique({
    where: { id: input.rackEquipmentId },
    select: { id: true, kind: true },
  });
  if (!rack || rack.kind !== EquipmentKind.RACK) {
    throw new NotFoundError('랙 설비를 찾을 수 없습니다.');
  }

  const category = await prisma.rackModuleCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true, name: true, isActive: true },
  });
  if (!category || !category.isActive) {
    throw new NotFoundError('카테고리를 찾을 수 없거나 비활성 상태입니다.');
  }

  const siblings = await prisma.rackModule.findMany({
    where: { rackEquipmentId: input.rackEquipmentId },
    select: { id: true, slotIndex: true, slotSpan: true },
  });
  assertNoSlotCollision(input.slotIndex, input.slotSpan, siblings);

  const name = (input.name?.trim()) || await generateModuleName(
    input.rackEquipmentId,
    input.categoryId,
    category.name,
  );

  const row = await prisma.rackModule.create({
    data: {
      rackEquipmentId: input.rackEquipmentId,
      categoryId: input.categoryId,
      name,
      slotIndex: input.slotIndex,
      slotSpan: input.slotSpan,
      installDate: input.installDate ? new Date(input.installDate) : null,
      manager: input.manager ?? null,
      description: input.description ?? null,
      properties: input.properties as Prisma.InputJsonValue | undefined,
      sortOrder: input.sortOrder ?? input.slotIndex,
      createdById: userId,
      updatedById: userId,
    },
    include: moduleInclude,
  });
  return mapDetail(row);
}

async function update(
  id: string,
  input: UpdateRackModuleInput,
  userId: string | null,
): Promise<RackModuleDetail> {
  const existing = await prisma.rackModule.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('모듈을 찾을 수 없습니다.');

  const newIndex = input.slotIndex ?? existing.slotIndex;
  const newSpan = input.slotSpan ?? existing.slotSpan;
  if (input.slotIndex !== undefined || input.slotSpan !== undefined) {
    assertSlotValid(newIndex, newSpan);
    const siblings = await prisma.rackModule.findMany({
      where: { rackEquipmentId: existing.rackEquipmentId },
      select: { id: true, slotIndex: true, slotSpan: true },
    });
    assertNoSlotCollision(newIndex, newSpan, siblings, [id]);
  }

  const row = await prisma.rackModule.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      slotIndex: newIndex,
      slotSpan: newSpan,
      installDate:
        input.installDate === undefined
          ? undefined
          : input.installDate
            ? new Date(input.installDate)
            : null,
      manager: input.manager === undefined ? undefined : input.manager,
      description: input.description === undefined ? undefined : input.description,
      properties: input.properties as Prisma.InputJsonValue | undefined,
      sortOrder: input.sortOrder,
      updatedById: userId,
    },
    include: moduleInclude,
  });
  return mapDetail(row);
}

async function batchUpdate(
  items: BatchUpdateItem[],
  userId: string | null,
): Promise<RackModuleDetail[]> {
  if (items.length === 0) return [];

  const ids = items.map((i) => i.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new ValidationError('batch update 항목에 중복된 모듈 ID가 있습니다.');
  }
  const existing = await prisma.rackModule.findMany({
    where: { id: { in: ids } },
    select: { id: true, rackEquipmentId: true },
  });
  if (existing.length !== items.length) {
    throw new NotFoundError('일부 모듈을 찾을 수 없습니다.');
  }
  const rackId = existing[0].rackEquipmentId;
  if (!existing.every((m) => m.rackEquipmentId === rackId)) {
    throw new ValidationError('batch update는 같은 랙 내 모듈만 허용됩니다.');
  }

  // 모든 항목에 대해 slot 범위 검증
  for (const it of items) assertSlotValid(it.slotIndex, it.slotSpan);

  // 적용 후 가상 상태로 교집합 검사
  const siblings = await prisma.rackModule.findMany({
    where: { rackEquipmentId: rackId },
    select: { id: true, slotIndex: true, slotSpan: true },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const projected = siblings.map((s) => itemMap.get(s.id) ?? s);
  for (const it of items) {
    const others = projected.filter((p) => p.id !== it.id);
    assertNoSlotCollision(it.slotIndex, it.slotSpan, others);
  }

  // 트랜잭션으로 일괄 적용
  const updated = await prisma.$transaction(
    items.map((it) =>
      prisma.rackModule.update({
        where: { id: it.id },
        data: {
          slotIndex: it.slotIndex,
          slotSpan: it.slotSpan,
          updatedById: userId,
        },
        include: moduleInclude,
      }),
    ),
  );
  return updated.map(mapDetail);
}

async function remove(id: string): Promise<void> {
  const existing = await prisma.rackModule.findUnique({
    where: { id },
    include: {
      sourceCables: { select: { id: true } },
      targetCables: { select: { id: true } },
    },
  });
  if (!existing) throw new NotFoundError('랙 모듈');

  const connectionCount = existing.sourceCables.length + existing.targetCables.length;
  if (connectionCount > 0) {
    throw new ConflictError(
      `연결된 케이블이 ${connectionCount}개 있어 삭제할 수 없습니다. 케이블을 먼저 제거하세요.`,
    );
  }

  await prisma.rackModule.delete({ where: { id } });
}

export const rackModuleService = {
  getByRackId,
  getById,
  create,
  update,
  batchUpdate,
  remove,
};

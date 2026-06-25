import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { assetToRackModule } from './assetPlanMapper.js';

// ==================== Types ====================

export interface RackModuleDetail {
  id: string;
  rackEquipmentId: string;
  categoryId: string;
  categoryName: string | null;
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

export const RACK_SLOT_COUNT = 12 as const;

// ==================== Helpers ====================

const moduleInclude = { assetType: true } as const;

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

// ==================== Mapping ====================

function mapDetail(
  row: Prisma.AssetGetPayload<{ include: typeof moduleInclude }>,
): RackModuleDetail {
  return assetToRackModule(row);
}

// ==================== Service ====================

async function getByRackId(rackId: string): Promise<RackModuleDetail[]> {
  const rack = await prisma.asset.findUnique({
    where: { id: rackId },
    select: { id: true, assetType: { select: { role: true } } },
  });
  if (!rack) throw new NotFoundError('랙 설비');
  if (rack.assetType.role !== 'rack') {
    throw new ValidationError(
      `해당 설비는 RACK 이 아닙니다 (role=${rack.assetType.role}). 랙 모듈은 RACK 설비에만 속합니다.`,
    );
  }
  const modules = await prisma.asset.findMany({
    where: { parentAssetId: rackId },
    include: moduleInclude,
    orderBy: [{ slotIndex: 'asc' }, { createdAt: 'asc' }],
  });
  return modules.map(mapDetail);
}

async function getById(id: string): Promise<RackModuleDetail> {
  const module = await prisma.asset.findUnique({
    where: { id },
    include: moduleInclude,
  });
  if (!module) throw new NotFoundError('랙 모듈');
  return mapDetail(module);
}

export const rackModuleService = {
  getByRackId,
  getById,
};

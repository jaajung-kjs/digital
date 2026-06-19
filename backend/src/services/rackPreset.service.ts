import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { RACK_SLOT_COUNT } from './rackModule.service.js';

// ==================== Types ====================

export interface RackPresetModule {
  slotIndex: number;
  slotSpan: number;
  categoryCode: string;
  defaultName: string | null;
}

export interface RackPresetDetail {
  id: string;
  code: string;
  name: string;
  totalU: number;
  canvasWidth: number;
  canvasHeight: number;
  description: string | null;
  modules: RackPresetModule[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RackPresetModuleInput {
  slotIndex: number;
  slotSpan: number;
  categoryCode: string;
  defaultName?: string | null;
}

export interface CreateRackPresetInput {
  code?: string;
  name: string;
  totalU: number;
  canvasWidth: number;
  canvasHeight: number;
  description?: string | null;
  modules: RackPresetModuleInput[];
  sortOrder?: number;
}

export interface UpdateRackPresetInput {
  name?: string;
  totalU?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  description?: string | null;
  modules?: RackPresetModuleInput[];
  sortOrder?: number;
  isActive?: boolean;
}

// ==================== Helpers ====================

/**
 * Validate the modules[] array of a preset:
 * - slotIndex >= 0, slotSpan >= 1
 * - slotIndex + slotSpan - 1 < RACK_SLOT_COUNT (0-based slots; fixed 12-slot grid)
 * - no slot collisions among modules
 * - every categoryCode resolves to an existing AssetType (모듈 타입 카탈로그)
 *
 * NOTE: totalU is accepted for API signature stability but is NOT used for
 * bounds validation — the display grid is always RACK_SLOT_COUNT (12) slots.
 */
async function validatePresetModules(
  modules: RackPresetModuleInput[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _totalU: number,
): Promise<RackPresetModule[]> {
  // 슬롯 검사 + 정규화
  const normalized: RackPresetModule[] = [];
  for (const m of modules) {
    if (m.slotIndex < 0) {
      throw new ValidationError(`프리셋 모듈 slotIndex 는 0 이상이어야 합니다 (입력값: ${m.slotIndex}).`);
    }
    if (m.slotSpan < 1) {
      throw new ValidationError(`프리셋 모듈 slotSpan 는 1 이상이어야 합니다 (입력값: ${m.slotSpan}).`);
    }
    const endSlot = m.slotIndex + m.slotSpan - 1;
    if (endSlot >= RACK_SLOT_COUNT) {
      throw new ValidationError(
        `프리셋 모듈 ${m.categoryCode} 가 슬롯 ${RACK_SLOT_COUNT - 1} 를 초과합니다 (slot ${m.slotIndex}-${endSlot}).`,
      );
    }
    normalized.push({
      slotIndex: m.slotIndex,
      slotSpan: m.slotSpan,
      categoryCode: m.categoryCode,
      defaultName: m.defaultName ?? null,
    });
  }

  // 슬롯 겹침
  const sorted = [...normalized].sort((a, b) => a.slotIndex - b.slotIndex);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const aEnd = a.slotIndex + a.slotSpan - 1;
    if (aEnd >= b.slotIndex) {
      const bEnd = b.slotIndex + b.slotSpan - 1;
      throw new ConflictError(
        `프리셋 모듈 슬롯 충돌: ${a.categoryCode} (slot ${a.slotIndex}-${aEnd}) ↔ ${b.categoryCode} (slot ${b.slotIndex}-${bEnd}).`,
      );
    }
  }

  // 카테고리(=AssetType) 존재 확인. categoryCode 는 AssetType.code 와 동일.
  const codes = Array.from(new Set(normalized.map((m) => m.categoryCode)));
  const existing = await prisma.assetType.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((c) => c.code));
  for (const code of codes) {
    if (!existingCodes.has(code)) {
      throw new ValidationError(
        `프리셋 모듈 categoryCode "${code}" 가 AssetType 에 존재하지 않습니다.`,
      );
    }
  }

  return normalized;
}

function shortId(): string {
  // Crockford-ish base32 short ID — 6자리로 충분
  const chars = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ==================== Service ====================

class RackPresetService {
  private mapToDetail(p: {
    id: string;
    code: string;
    name: string;
    totalU: number;
    canvasWidth: number;
    canvasHeight: number;
    modules: unknown;
    description: string | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): RackPresetDetail {
    const rawModules = Array.isArray(p.modules) ? (p.modules as Array<Record<string, unknown>>) : [];
    const modules: RackPresetModule[] = rawModules.map((m) => ({
      slotIndex: Number(m.slotIndex ?? 0),
      slotSpan: Number(m.slotSpan ?? 1),
      categoryCode: String(m.categoryCode ?? ''),
      defaultName: m.defaultName == null ? null : String(m.defaultName),
    }));
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      totalU: p.totalU,
      canvasWidth: p.canvasWidth,
      canvasHeight: p.canvasHeight,
      description: p.description,
      modules,
      sortOrder: p.sortOrder,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async getAll(): Promise<RackPresetDetail[]> {
    const presets = await prisma.rackPreset.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return presets.map((p) => this.mapToDetail(p));
  }

  async getById(id: string): Promise<RackPresetDetail> {
    const preset = await prisma.rackPreset.findUnique({ where: { id } });
    if (!preset) throw new NotFoundError('랙 프리셋');
    return this.mapToDetail(preset);
  }

  async create(input: CreateRackPresetInput, userId: string): Promise<RackPresetDetail> {
    if (input.canvasWidth <= 0 || input.canvasHeight <= 0) {
      throw new ValidationError('canvasWidth/Height 는 0 보다 커야 합니다.');
    }

    const validatedModules = await validatePresetModules(input.modules, input.totalU);

    // code: 명시적이면 사용, 아니면 USR-{shortId}. 충돌 시 재시도.
    let code = input.code;
    if (code) {
      const existing = await prisma.rackPreset.findUnique({ where: { code } });
      if (existing) throw new ConflictError(`동일한 code 의 프리셋이 이미 존재합니다: ${code}`);
    } else {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = `USR-${shortId()}`;
        const conflict = await prisma.rackPreset.findUnique({ where: { code: candidate } });
        if (!conflict) {
          code = candidate;
          break;
        }
      }
      if (!code) {
        throw new ConflictError('프리셋 code 자동 생성 실패 — 다시 시도하거나 code 를 명시하세요.');
      }
    }

    const created = await prisma.rackPreset.create({
      data: {
        code,
        name: input.name,
        totalU: input.totalU,
        canvasWidth: input.canvasWidth,
        canvasHeight: input.canvasHeight,
        description: input.description ?? null,
        modules: validatedModules as unknown as Prisma.InputJsonValue,
        sortOrder: input.sortOrder ?? 0,
        createdById: userId,
        updatedById: userId,
      },
    });
    return this.mapToDetail(created);
  }

  async update(
    id: string,
    input: UpdateRackPresetInput,
    userId: string,
  ): Promise<RackPresetDetail> {
    const existing = await prisma.rackPreset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('랙 프리셋');

    if (input.canvasWidth !== undefined && input.canvasWidth <= 0) {
      throw new ValidationError('canvasWidth 는 0 보다 커야 합니다.');
    }
    if (input.canvasHeight !== undefined && input.canvasHeight <= 0) {
      throw new ValidationError('canvasHeight 는 0 보다 커야 합니다.');
    }

    const newTotalU = input.totalU ?? existing.totalU;
    let validatedModules: RackPresetModule[] | undefined;
    if (input.modules !== undefined) {
      validatedModules = await validatePresetModules(input.modules, newTotalU);
    } else if (input.totalU !== undefined && input.totalU !== existing.totalU) {
      // totalU 만 변경되어도 기존 modules 가 새 totalU 안에 들어가는지 재검사
      const currentModules = (Array.isArray(existing.modules)
        ? (existing.modules as Array<Record<string, unknown>>)
        : []
      ).map((m) => ({
        slotIndex: Number(m.slotIndex ?? 0),
        slotSpan: Number(m.slotSpan ?? 1),
        categoryCode: String(m.categoryCode ?? ''),
        defaultName: m.defaultName == null ? null : String(m.defaultName),
      })) as RackPresetModuleInput[];
      validatedModules = await validatePresetModules(currentModules, newTotalU);
    }

    const updated = await prisma.rackPreset.update({
      where: { id },
      data: {
        name: input.name,
        totalU: input.totalU,
        canvasWidth: input.canvasWidth,
        canvasHeight: input.canvasHeight,
        description: input.description,
        modules: validatedModules
          ? (validatedModules as unknown as Prisma.InputJsonValue)
          : undefined,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        updatedById: userId,
      },
    });
    return this.mapToDetail(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.rackPreset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('랙 프리셋');
    await prisma.rackPreset.delete({ where: { id } });
  }
}

export const rackPresetService = new RackPresetService();

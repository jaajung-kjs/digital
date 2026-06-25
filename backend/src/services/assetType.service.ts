import { randomUUID } from 'node:crypto';
import prisma from '../config/prisma.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export interface CreateAssetTypeInput {
  name: string;
  code?: string;
  categoryId?: string | null;
  displayColor?: string | null;
  defaultSlotSpan?: number;
  isContainer?: boolean;
  sortOrder?: number;
}

export interface UpdateAssetTypeInput {
  name?: string;
  categoryId?: string | null;
  displayColor?: string | null;
  defaultSlotSpan?: number;
  sortOrder?: number;
}

export interface AssetTypeDetail {
  id: string;
  code: string;
  name: string;
  role: string;
  categoryId: string | null;
  isContainer: boolean;
  fieldTemplate: unknown | null;
  requiredToCreate: unknown | null;
  iconName: string | null;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
  laborType: string | null;
  installHoursPerUnit: number | null;
  removeHoursPerUnit: number | null;
  relocateHoursPerUnit: number | null;
}

class AssetTypeService {
  private mapToDetail(t: {
    id: string; code: string; name: string;
    role: string; categoryId: string | null;
    isContainer: boolean; fieldTemplate: unknown; requiredToCreate: unknown;
    iconName: string | null; displayColor: string | null;
    sortOrder: number; isActive: boolean;
    laborType?: string | null;
    installHoursPerUnit?: number | null;
    removeHoursPerUnit?: number | null;
    relocateHoursPerUnit?: number | null;
  }): AssetTypeDetail {
    return {
      id: t.id, code: t.code, name: t.name,
      role: t.role, categoryId: t.categoryId ?? null,
      isContainer: t.isContainer, fieldTemplate: t.fieldTemplate ?? null,
      requiredToCreate: t.requiredToCreate ?? null, iconName: t.iconName,
      displayColor: t.displayColor,
      sortOrder: t.sortOrder, isActive: t.isActive,
      laborType: t.laborType ?? null,
      installHoursPerUnit: t.installHoursPerUnit ?? null,
      removeHoursPerUnit: t.removeHoursPerUnit ?? null,
      relocateHoursPerUnit: t.relocateHoursPerUnit ?? null,
    };
  }

  async getAll(): Promise<AssetTypeDetail[]> {
    const rows = await prisma.assetType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map((r) => this.mapToDetail(r));
  }

  async getById(id: string): Promise<AssetTypeDetail> {
    const row = await prisma.assetType.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('자산 종류');
    return this.mapToDetail(row);
  }

  // code 는 내부 로직(분류·프리셋 categoryCode)용 식별자 — 사용자는 name 만 입력하므로
  // 미지정 시 충돌 없는 'MOD-XXXXXXXX' 를 생성한다.
  private async generateCode(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const code = `MOD-${randomUUID().slice(0, 8).toUpperCase()}`;
      const dup = await prisma.assetType.findUnique({ where: { code } });
      if (!dup) return code;
    }
    throw new ConflictError('자산 종류 코드를 생성하지 못했습니다. 다시 시도해주세요.');
  }

  async create(input: CreateAssetTypeInput): Promise<AssetTypeDetail> {
    const code = input.code?.trim() || (await this.generateCode());
    const dup = await prisma.assetType.findUnique({ where: { code } });
    if (dup) throw new ConflictError(`이미 존재하는 코드입니다: ${code}`);
    // 미지정 시 device 타입 끝에 붙도록 sortOrder 자동 부여.
    const last = await prisma.assetType.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.assetType.create({
      data: {
        code,
        name: input.name.trim(),
        role: 'device',
        categoryId: input.categoryId ?? null,
        displayColor: input.displayColor ?? null,
        defaultSlotSpan: input.defaultSlotSpan ?? 1,
        isContainer: input.isContainer ?? false,
        sortOrder: input.sortOrder ?? (last._max.sortOrder ?? 0) + 1,
      },
    });
    return this.mapToDetail(row);
  }

  async update(id: string, input: UpdateAssetTypeInput): Promise<AssetTypeDetail> {
    const existing = await prisma.assetType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('자산 종류');
    if (existing.role !== 'device' && input.categoryId !== undefined) {
      throw new ConflictError('시스템 종류는 분류를 변경할 수 없습니다(이름만 수정 가능).');
    }
    const row = await prisma.assetType.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.displayColor !== undefined ? { displayColor: input.displayColor } : {}),
        ...(input.defaultSlotSpan !== undefined ? { defaultSlotSpan: input.defaultSlotSpan } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return this.mapToDetail(row);
  }

  // hard delete — soft(isActive=false) 가 아니라 실제 삭제. 단, 이 종류를 쓰는 자산이
  // 남아 있으면 FK(Restrict) 로 막히므로, 사용자가 원인을 알 수 있게 먼저 차단한다.
  async delete(id: string): Promise<void> {
    const existing = await prisma.assetType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('자산 종류');
    if (existing.role !== 'device') {
      throw new ConflictError('시스템 종류는 삭제할 수 없습니다.');
    }
    const inUse = await prisma.asset.count({ where: { assetTypeId: id } });
    if (inUse > 0) {
      throw new ConflictError(`이 종류를 사용 중인 자산 ${inUse}개가 있어 삭제할 수 없습니다.`);
    }
    await prisma.assetType.delete({ where: { id } });
  }
}

export const assetTypeService = new AssetTypeService();

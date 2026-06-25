import prisma from '../config/prisma.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export interface CreateAssetTypeInput {
  name: string;
  categoryId?: string | null;
  sortOrder?: number;
}

export interface UpdateAssetTypeInput {
  name?: string;
  categoryId?: string | null;
  sortOrder?: number;
}

export interface AssetTypeDetail {
  id: string;
  name: string;
  role: string;
  categoryId: string | null;
  sortOrder: number;
  laborType: string | null;
  installHoursPerUnit: number | null;
  removeHoursPerUnit: number | null;
  relocateHoursPerUnit: number | null;
}

class AssetTypeService {
  private mapToDetail(t: {
    id: string; name: string;
    role: string; categoryId: string | null;
    sortOrder: number;
    laborType?: string | null;
    installHoursPerUnit?: number | null;
    removeHoursPerUnit?: number | null;
    relocateHoursPerUnit?: number | null;
  }): AssetTypeDetail {
    return {
      id: t.id, name: t.name,
      role: t.role, categoryId: t.categoryId ?? null,
      sortOrder: t.sortOrder,
      laborType: t.laborType ?? null,
      installHoursPerUnit: t.installHoursPerUnit ?? null,
      removeHoursPerUnit: t.removeHoursPerUnit ?? null,
      relocateHoursPerUnit: t.relocateHoursPerUnit ?? null,
    };
  }

  async getAll(): Promise<AssetTypeDetail[]> {
    const rows = await prisma.assetType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.mapToDetail(r));
  }

  async getById(id: string): Promise<AssetTypeDetail> {
    const row = await prisma.assetType.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('자산 종류');
    return this.mapToDetail(row);
  }

  async create(input: CreateAssetTypeInput): Promise<AssetTypeDetail> {
    // 미지정 시 device 타입 끝에 붙도록 sortOrder 자동 부여.
    const last = await prisma.assetType.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.assetType.create({
      data: {
        name: input.name.trim(),
        role: 'device',
        categoryId: input.categoryId ?? null,
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

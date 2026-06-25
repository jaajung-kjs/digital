import prisma from '../config/prisma.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export interface AssetCategoryDetail {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateAssetCategoryInput { name: string; sortOrder?: number }
export interface UpdateAssetCategoryInput { name?: string; sortOrder?: number; isActive?: boolean }

class AssetCategoryService {
  private map(c: { id: string; name: string; sortOrder: number; isActive: boolean }): AssetCategoryDetail {
    return { id: c.id, name: c.name, sortOrder: c.sortOrder, isActive: c.isActive };
  }

  async getAll(): Promise<AssetCategoryDetail[]> {
    const rows = await prisma.assetCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async create(input: CreateAssetCategoryInput): Promise<AssetCategoryDetail> {
    const row = await prisma.assetCategory.create({
      data: { name: input.name.trim(), sortOrder: input.sortOrder ?? 0 },
    });
    return this.map(row);
  }

  async update(id: string, input: UpdateAssetCategoryInput): Promise<AssetCategoryDetail> {
    const existing = await prisma.assetCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('자산 분류');
    const row = await prisma.assetCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return this.map(row);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.assetCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('자산 분류');
    const inUse = await prisma.assetType.count({ where: { categoryId: id } });
    if (inUse > 0) {
      throw new ConflictError(`이 분류를 사용 중인 종류 ${inUse}개가 있어 삭제할 수 없습니다.`);
    }
    await prisma.assetCategory.delete({ where: { id } });
  }
}

export const assetCategoryService = new AssetCategoryService();

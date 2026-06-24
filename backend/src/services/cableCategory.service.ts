import prisma from '../config/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

export interface CreateCableCategoryInput { name: string; groupId: string; sortOrder?: number }
export interface UpdateCableCategoryInput { name?: string; groupId?: string; sortOrder?: number; isActive?: boolean }

// ==================== Types ====================

export interface CableCategoryDetail {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type CableCategoryRow = {
  id: string; name: string; groupId: string | null;
  sortOrder: number; isActive: boolean; createdAt: Date; updatedAt: Date;
  group?: { id: string; name: string; color: string | null } | null;
};

// ==================== Service ====================

class CableCategoryService {
  private mapToDetail(c: CableCategoryRow): CableCategoryDetail {
    return {
      id: c.id,
      name: c.name,
      groupId: c.groupId ?? null,
      groupName: c.group?.name ?? null,
      groupColor: c.group?.color ?? null,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  async getAll(): Promise<CableCategoryDetail[]> {
    const categories = await prisma.cableCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { group: true },
    });
    return categories.map((c) => this.mapToDetail(c));
  }

  async getById(id: string): Promise<CableCategoryDetail> {
    const category = await prisma.cableCategory.findUnique({ where: { id }, include: { group: true } });
    if (!category) throw new NotFoundError('케이블 카테고리');
    return this.mapToDetail(category);
  }

  private async requireGroup(groupId: string): Promise<{ id: string; name: string }> {
    const g = await prisma.cableGroup.findUnique({ where: { id: groupId } });
    if (!g) throw new ValidationError(`존재하지 않는 그룹입니다: ${groupId}`);
    return g;
  }

  async create(input: CreateCableCategoryInput): Promise<CableCategoryDetail> {
    const group = await this.requireGroup(input.groupId);
    const row = await prisma.cableCategory.create({
      data: { name: input.name.trim(), groupId: group.id, sortOrder: input.sortOrder ?? 0 },
      include: { group: true },
    });
    return this.mapToDetail(row);
  }

  async update(id: string, input: UpdateCableCategoryInput): Promise<CableCategoryDetail> {
    const existing = await prisma.cableCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('케이블 카테고리');
    const group = input.groupId !== undefined ? await this.requireGroup(input.groupId) : null;
    const row = await prisma.cableCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(group ? { groupId: group.id } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { group: true },
    });
    return this.mapToDetail(row);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.cableCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('케이블 카테고리');
    const inUse = await prisma.cable.count({ where: { categoryId: id } });
    if (inUse > 0) {
      throw new ConflictError(`이 분류를 사용 중인 케이블 ${inUse}개가 있어 삭제할 수 없습니다.`);
    }
    await prisma.cableCategory.delete({ where: { id } });
  }
}

export const cableCategoryService = new CableCategoryService();

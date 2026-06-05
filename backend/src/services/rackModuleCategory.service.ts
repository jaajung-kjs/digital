import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface RackModuleCategoryDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayColor: string | null;
  defaultSlotSpan: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Service ====================

class RackModuleCategoryService {
  // 모듈/장치 타입(= 배치 종류가 없는 AssetType)을 기존 RackModuleCategory DTO 형태로 매핑.
  // AssetType 에는 description 컬럼이 없어 null 로 채운다.
  private mapToDetail(t: {
    id: string;
    code: string;
    name: string;
    displayColor: string | null;
    defaultSlotSpan: number;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): RackModuleCategoryDetail {
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      description: null,
      displayColor: t.displayColor,
      defaultSlotSpan: t.defaultSlotSpan,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async getAll(): Promise<RackModuleCategoryDetail[]> {
    const types = await prisma.assetType.findMany({
      where: { isActive: true, placementKind: null },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return types.map((t) => this.mapToDetail(t));
  }

  async getById(id: string): Promise<RackModuleCategoryDetail> {
    const type = await prisma.assetType.findUnique({ where: { id } });
    if (!type || type.placementKind !== null || !type.isActive) throw new NotFoundError('랙 모듈 카테고리');
    return this.mapToDetail(type);
  }
}

export const rackModuleCategoryService = new RackModuleCategoryService();

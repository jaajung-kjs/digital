import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

export interface AssetTypeDetail {
  id: string;
  code: string;
  name: string;
  group: string | null;
  isContainer: boolean;
  fieldTemplate: unknown | null;
  requiredToCreate: unknown | null;
  iconName: string | null;
  displayColor: string | null;
  placementKind: string | null;
  connectionKind: string | null;
  sortOrder: number;
  isActive: boolean;
}

class AssetTypeService {
  private mapToDetail(t: {
    id: string; code: string; name: string; group: string | null;
    isContainer: boolean; fieldTemplate: unknown; requiredToCreate: unknown;
    iconName: string | null; displayColor: string | null; placementKind: string | null;
    connectionKind: string | null;
    sortOrder: number; isActive: boolean;
  }): AssetTypeDetail {
    return {
      id: t.id, code: t.code, name: t.name, group: t.group,
      isContainer: t.isContainer, fieldTemplate: t.fieldTemplate ?? null,
      requiredToCreate: t.requiredToCreate ?? null, iconName: t.iconName,
      displayColor: t.displayColor, placementKind: t.placementKind ?? null,
      connectionKind: t.connectionKind ?? null,
      sortOrder: t.sortOrder, isActive: t.isActive,
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
}

export const assetTypeService = new AssetTypeService();

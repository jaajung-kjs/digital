import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface BomMaterialDetail {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
  iconName: string | null;
  unit: string | null;
  specTemplate: unknown;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Service ====================

class BomMaterialService {
  private mapToDetail(m: {
    id: string;
    code: string;
    name: string;
    parentId: string | null;
    description: string | null;
    iconName: string | null;
    unit: string | null;
    specTemplate: unknown;
    displayColor: string | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): BomMaterialDetail {
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      parentId: m.parentId,
      description: m.description,
      iconName: m.iconName,
      unit: m.unit,
      specTemplate: m.specTemplate,
      displayColor: m.displayColor,
      sortOrder: m.sortOrder,
      isActive: m.isActive,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  /** Flat list — frontend can build the tree via parentId. */
  async getAll(): Promise<BomMaterialDetail[]> {
    const materials = await prisma.bomMaterial.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return materials.map((m) => this.mapToDetail(m));
  }

  async getById(id: string): Promise<BomMaterialDetail> {
    const material = await prisma.bomMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundError('BOM 자재');
    return this.mapToDetail(material);
  }
}

export const bomMaterialService = new BomMaterialService();

import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

export interface BranchListItem {
  id: string;
  headquartersId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  substationCount: number;
  createdAt: Date;
}

export interface CreateBranchInput {
  name: string;
}

export interface UpdateBranchInput {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

class BranchService {
  async getListByHeadquarters(headquartersId: string): Promise<BranchListItem[]> {
    const hq = await prisma.headquarters.findUnique({ where: { id: headquartersId } });
    if (!hq) throw new NotFoundError('본부');

    const items = await prisma.branch.findMany({
      where: { headquartersId, isActive: true },
      include: {
        _count: { select: { substations: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return items.map((b) => ({
      id: b.id,
      headquartersId: b.headquartersId,
      name: b.name,
      sortOrder: b.sortOrder,
      isActive: b.isActive,
      substationCount: b._count.substations,
      createdAt: b.createdAt,
    }));
  }

  async create(headquartersId: string, input: CreateBranchInput, userId: string): Promise<BranchListItem> {
    const hq = await prisma.headquarters.findUnique({ where: { id: headquartersId } });
    if (!hq) throw new NotFoundError('본부');

    const existing = await prisma.branch.findFirst({
      where: { headquartersId, name: input.name },
    });
    if (existing) throw new ConflictError('동일한 이름의 지사가 이미 존재합니다.');

    const created = await prisma.branch.create({
      data: {
        headquartersId,
        name: input.name,
        createdById: userId,
        updatedById: userId,
      },
      include: { _count: { select: { substations: true } } },
    });

    return {
      id: created.id,
      headquartersId: created.headquartersId,
      name: created.name,
      sortOrder: created.sortOrder,
      isActive: created.isActive,
      substationCount: created._count.substations,
      createdAt: created.createdAt,
    };
  }

  async update(id: string, input: UpdateBranchInput, userId: string): Promise<BranchListItem> {
    const existing = await prisma.branch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('지사');

    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.branch.findFirst({
        where: { headquartersId: existing.headquartersId, name: input.name, id: { not: id } },
      });
      if (nameExists) throw new ConflictError('동일한 이름의 지사가 이미 존재합니다.');
    }

    const updated = await prisma.branch.update({
      where: { id },
      data: { ...input, updatedById: userId },
      include: { _count: { select: { substations: true } } },
    });

    return {
      id: updated.id,
      headquartersId: updated.headquartersId,
      name: updated.name,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
      substationCount: updated._count.substations,
      createdAt: updated.createdAt,
    };
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.branch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('지사');
    await prisma.branch.delete({ where: { id } });
  }

  async getSubstations(branchId: string) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundError('지사');

    const substations = await prisma.substation.findMany({
      where: { branchId, isActive: true },
      include: {
        _count: { select: { floors: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return substations.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      floorCount: s._count.floors,
    }));
  }
}

export const branchService = new BranchService();

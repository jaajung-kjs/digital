import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

export interface HeadquartersListItem {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  branchCount: number;
  createdAt: Date;
}

export interface CreateHeadquartersInput {
  name: string;
}

export interface UpdateHeadquartersInput {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

class HeadquartersService {
  async getList(): Promise<HeadquartersListItem[]> {
    const items = await prisma.headquarters.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { branches: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return items.map((h) => ({
      id: h.id,
      name: h.name,
      sortOrder: h.sortOrder,
      isActive: h.isActive,
      branchCount: h._count.branches,
      createdAt: h.createdAt,
    }));
  }

  async create(input: CreateHeadquartersInput, userId: string): Promise<HeadquartersListItem> {
    const existing = await prisma.headquarters.findFirst({
      where: { name: input.name },
    });
    if (existing) {
      throw new ConflictError('동일한 이름의 본부가 이미 존재합니다.');
    }

    const created = await prisma.headquarters.create({
      data: {
        name: input.name,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        _count: { select: { branches: true } },
      },
    });

    return {
      id: created.id,
      name: created.name,
      sortOrder: created.sortOrder,
      isActive: created.isActive,
      branchCount: created._count.branches,
      createdAt: created.createdAt,
    };
  }

  async update(id: string, input: UpdateHeadquartersInput, userId: string): Promise<HeadquartersListItem> {
    const existing = await prisma.headquarters.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('본부');

    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.headquarters.findFirst({
        where: { name: input.name, id: { not: id } },
      });
      if (nameExists) throw new ConflictError('동일한 이름의 본부가 이미 존재합니다.');
    }

    const updated = await prisma.headquarters.update({
      where: { id },
      data: { ...input, updatedById: userId },
      include: { _count: { select: { branches: true } } },
    });

    return {
      id: updated.id,
      name: updated.name,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
      branchCount: updated._count.branches,
      createdAt: updated.createdAt,
    };
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.headquarters.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('본부');
    await prisma.headquarters.delete({ where: { id } });
  }
}

export const headquartersService = new HeadquartersService();

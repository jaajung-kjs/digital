import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
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

const HQ_COUNT_INCLUDE = {
  _count: { select: { branches: true } },
};

type HqWithCount = Prisma.HeadquartersGetPayload<{ include: typeof HQ_COUNT_INCLUDE }>;

function toListItem(h: HqWithCount): HeadquartersListItem {
  return {
    id: h.id,
    name: h.name,
    sortOrder: h.sortOrder,
    isActive: h.isActive,
    branchCount: h._count.branches,
    createdAt: h.createdAt,
  };
}

class HeadquartersService {
  async getList(): Promise<HeadquartersListItem[]> {
    const items = await prisma.headquarters.findMany({
      where: { isActive: true },
      include: HQ_COUNT_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return items.map(toListItem);
  }

  async create(input: CreateHeadquartersInput, userId: string): Promise<HeadquartersListItem> {
    const existing = await prisma.headquarters.findFirst({
      where: { name: input.name },
    });
    if (existing) throw new ConflictError('동일한 이름의 본부가 이미 존재합니다.');

    const created = await prisma.headquarters.create({
      data: {
        name: input.name,
        createdById: userId,
        updatedById: userId,
      },
      include: HQ_COUNT_INCLUDE,
    });

    return toListItem(created);
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
      include: HQ_COUNT_INCLUDE,
    });

    return toListItem(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.headquarters.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('본부');
    await prisma.headquarters.delete({ where: { id } });
  }
}

export const headquartersService = new HeadquartersService();

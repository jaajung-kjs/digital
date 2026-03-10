import prisma from '../config/prisma.js';

type ReorderableType = 'headquarters' | 'branch' | 'substation' | 'floor' | 'room';

const PRISMA_MODEL_MAP: Record<ReorderableType, keyof typeof prisma> = {
  headquarters: 'headquarters',
  branch: 'branch',
  substation: 'substation',
  floor: 'floor',
  room: 'room',
};

class OrganizationService {
  async reorder(type: string, items: { id: string; sortOrder: number }[]): Promise<void> {
    const model = PRISMA_MODEL_MAP[type as ReorderableType];
    if (!model) throw new Error(`Unknown type: ${type}`);

    await prisma.$transaction(
      items.map((item) =>
        (prisma[model] as any).update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );
  }
}

export const organizationService = new OrganizationService();

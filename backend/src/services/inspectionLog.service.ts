import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

/** Serialized to JSON — Date fields become ISO strings via res.json() */
export interface InspectionLogDetail {
  id: string;
  assetId: string;
  inspectionDate: string;
  inspector: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
}

export interface CreateInspectionLogInput {
  inspectionDate: string;
  inspector: string;
  content?: string | null;
}

export interface UpdateInspectionLogInput {
  inspectionDate?: string;
  inspector?: string;
  content?: string | null;
}

const LOG_INCLUDE = {
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} as const;

// ==================== Service ====================

class InspectionLogService {
  /** 자산의 점검 이력 — 최근 점검일 순. 가장 첫 항목이 자산 현황의 "마지막 점검일". */
  async getByAssetId(assetId: string): Promise<InspectionLogDetail[]> {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundError('자산');
    }

    const logs = await prisma.inspectionLog.findMany({
      where: { assetId },
      include: LOG_INCLUDE,
      orderBy: [{ inspectionDate: 'desc' }, { createdAt: 'desc' }],
    });

    return logs.map((l) => this.mapToDetail(l));
  }

  async create(
    assetId: string,
    input: CreateInspectionLogInput,
    userId: string
  ): Promise<InspectionLogDetail> {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundError('자산');
    }

    const log = await prisma.inspectionLog.create({
      data: {
        assetId,
        inspectionDate: new Date(input.inspectionDate),
        inspector: input.inspector,
        content: input.content ?? null,
        createdById: userId,
        updatedById: userId,
      },
      include: LOG_INCLUDE,
    });

    return this.mapToDetail(log);
  }

  async update(
    id: string,
    input: UpdateInspectionLogInput,
    userId: string
  ): Promise<InspectionLogDetail> {
    const existing = await prisma.inspectionLog.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('점검 이력');
    }

    const log = await prisma.inspectionLog.update({
      where: { id },
      data: {
        inspectionDate: input.inspectionDate ? new Date(input.inspectionDate) : undefined,
        inspector: input.inspector,
        content: input.content !== undefined ? input.content : undefined,
        updatedById: userId,
      },
      include: LOG_INCLUDE,
    });

    return this.mapToDetail(log);
  }

  async delete(id: string): Promise<void> {
    const log = await prisma.inspectionLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundError('점검 이력');
    }

    await prisma.inspectionLog.delete({ where: { id } });
  }

  private mapToDetail(l: any): InspectionLogDetail {
    return {
      id: l.id,
      assetId: l.assetId,
      inspectionDate: l.inspectionDate.toISOString(),
      inspector: l.inspector,
      content: l.content,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      createdByName: l.createdBy?.name ?? null,
      updatedByName: l.updatedBy?.name ?? null,
    };
  }
}

export const inspectionLogService = new InspectionLogService();

import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface MaintenanceLogDetail {
  id: string;
  equipmentId: string;
  logType: string;
  title: string;
  description: string | null;
  logDate: Date | null;
  severity: string | null;
  status: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  updatedByName: string | null;
}

export interface CreateMaintenanceLogInput {
  logType: string;
  title: string;
  description?: string;
  logDate?: string;
  severity?: string;
  status?: string;
}

export interface UpdateMaintenanceLogInput {
  logType?: string;
  title?: string;
  description?: string;
  logDate?: string;
  severity?: string;
  status?: string;
  resolvedAt?: string;
}

const LOG_INCLUDE = {
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} as const;

// ==================== Service ====================

class MaintenanceLogService {
  async getByEquipmentId(equipmentId: string): Promise<MaintenanceLogDetail[]> {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    const logs = await prisma.maintenanceLog.findMany({
      where: { equipmentId },
      include: LOG_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((l) => this.mapToDetail(l));
  }

  async create(
    equipmentId: string,
    input: CreateMaintenanceLogInput,
    userId: string
  ): Promise<MaintenanceLogDetail> {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    const log = await prisma.maintenanceLog.create({
      data: {
        equipmentId,
        logType: input.logType,
        title: input.title,
        description: input.description,
        logDate: input.logDate ? new Date(input.logDate) : null,
        severity: input.severity,
        status: input.status ?? 'OPEN',
        createdById: userId,
        updatedById: userId,
      },
      include: LOG_INCLUDE,
    });

    return this.mapToDetail(log);
  }

  async update(
    id: string,
    input: UpdateMaintenanceLogInput,
    userId: string
  ): Promise<MaintenanceLogDetail> {
    const existing = await prisma.maintenanceLog.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('유지보수 이력');
    }

    const log = await prisma.maintenanceLog.update({
      where: { id },
      data: {
        logType: input.logType,
        title: input.title,
        description: input.description,
        logDate: input.logDate !== undefined
          ? (input.logDate ? new Date(input.logDate) : null)
          : undefined,
        severity: input.severity,
        status: input.status,
        resolvedAt: input.resolvedAt !== undefined
          ? (input.resolvedAt ? new Date(input.resolvedAt) : null)
          : undefined,
        updatedById: userId,
      },
      include: LOG_INCLUDE,
    });

    return this.mapToDetail(log);
  }

  async delete(id: string): Promise<void> {
    const log = await prisma.maintenanceLog.findUnique({
      where: { id },
    });

    if (!log) {
      throw new NotFoundError('유지보수 이력');
    }

    await prisma.maintenanceLog.delete({
      where: { id },
    });
  }

  private mapToDetail(l: any): MaintenanceLogDetail {
    return {
      id: l.id,
      equipmentId: l.equipmentId,
      logType: l.logType,
      title: l.title,
      description: l.description,
      logDate: l.logDate,
      severity: l.severity,
      status: l.status,
      resolvedAt: l.resolvedAt,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      createdByName: l.createdBy?.name ?? null,
      updatedByName: l.updatedBy?.name ?? null,
    };
  }
}

export const maintenanceLogService = new MaintenanceLogService();

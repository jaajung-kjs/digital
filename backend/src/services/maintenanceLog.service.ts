import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface MaintenanceLogDetail {
  id: string;
  equipmentId: string;
  logType: string;
  title: string;
  description: string | null;
  severity: string | null;
  status: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMaintenanceLogInput {
  logType: string;
  title: string;
  description?: string;
  severity?: string;
  status?: string;
}

export interface UpdateMaintenanceLogInput {
  logType?: string;
  title?: string;
  description?: string;
  severity?: string;
  status?: string;
  resolvedAt?: string;
}

// ==================== Service ====================

class MaintenanceLogService {
  /**
   * 설비 유지보수 이력 조회
   */
  async getByEquipmentId(equipmentId: string): Promise<MaintenanceLogDetail[]> {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    const logs = await prisma.maintenanceLog.findMany({
      where: { equipmentId },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((l) => this.mapToDetail(l));
  }

  /**
   * 유지보수 이력 생성
   */
  async create(
    equipmentId: string,
    input: CreateMaintenanceLogInput
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
        severity: input.severity,
        status: input.status ?? 'OPEN',
      },
    });

    return this.mapToDetail(log);
  }

  /**
   * 유지보수 이력 수정
   */
  async update(
    id: string,
    input: UpdateMaintenanceLogInput
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
        severity: input.severity,
        status: input.status,
        resolvedAt: input.resolvedAt !== undefined
          ? (input.resolvedAt ? new Date(input.resolvedAt) : null)
          : undefined,
      },
    });

    return this.mapToDetail(log);
  }

  /**
   * 유지보수 이력 삭제
   */
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
      severity: l.severity,
      status: l.status,
      resolvedAt: l.resolvedAt,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  }
}

export const maintenanceLogService = new MaintenanceLogService();

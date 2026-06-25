import prisma from '../config/prisma.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export interface CableGroupDetail {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  laborType: string | null;
  installHoursPerMeter: number | null;
  removeHoursPerMeter: number | null;
  relocateHoursPerMeter: number | null;
}
export interface CreateCableGroupInput { name: string; color?: string | null; sortOrder?: number }
export interface UpdateCableGroupInput { name?: string; color?: string | null; sortOrder?: number }

class CableGroupService {
  private map(g: {
    id: string; name: string; color: string | null; sortOrder: number;
    laborType?: string | null;
    installHoursPerMeter?: number | null; removeHoursPerMeter?: number | null; relocateHoursPerMeter?: number | null;
  }): CableGroupDetail {
    return {
      id: g.id, name: g.name, color: g.color, sortOrder: g.sortOrder,
      laborType: g.laborType ?? null,
      installHoursPerMeter: g.installHoursPerMeter ?? null,
      removeHoursPerMeter: g.removeHoursPerMeter ?? null,
      relocateHoursPerMeter: g.relocateHoursPerMeter ?? null,
    };
  }

  async getAll(): Promise<CableGroupDetail[]> {
    const rows = await prisma.cableGroup.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => this.map(r));
  }

  async create(input: CreateCableGroupInput): Promise<CableGroupDetail> {
    const row = await prisma.cableGroup.create({ data: { name: input.name.trim(), color: input.color ?? null, sortOrder: input.sortOrder ?? 0 } });
    return this.map(row);
  }

  async update(id: string, input: UpdateCableGroupInput): Promise<CableGroupDetail> {
    const existing = await prisma.cableGroup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('케이블 그룹');
    const row = await prisma.cableGroup.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return this.map(row);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.cableGroup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('케이블 그룹');
    const inUse = await prisma.cableCategory.count({ where: { groupId: id } });
    if (inUse > 0) throw new ConflictError(`이 그룹을 사용 중인 종류 ${inUse}개가 있어 삭제할 수 없습니다.`);
    await prisma.cableGroup.delete({ where: { id } });
  }
}

export const cableGroupService = new CableGroupService();

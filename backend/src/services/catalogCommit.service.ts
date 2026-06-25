import prisma from '../config/prisma.js';
import { ConflictError, ValidationError } from '../utils/errors.js';

interface CollDelta<C, U> { creates: C[]; updates: { id: string; patch: U }[]; deletes: { id: string }[] }
export interface CatalogCommitInput {
  assetCategories?: CollDelta<{ id: string; name: string; sortOrder?: number }, { name?: string; sortOrder?: number }>;
  assetTypes?: CollDelta<{ id: string; name: string; categoryId: string | null }, { name?: string; categoryId?: string | null; laborType?: string | null; installHoursPerUnit?: number | null; removeHoursPerUnit?: number | null; relocateHoursPerUnit?: number | null }>;
  cableGroups?: CollDelta<{ id: string; name: string; color?: string | null }, { name?: string; color?: string | null; sortOrder?: number; laborType?: string | null; installHoursPerMeter?: number | null; removeHoursPerMeter?: number | null; relocateHoursPerMeter?: number | null }>;
  cableCategories?: CollDelta<{ id: string; name: string; groupId: string }, { name?: string; groupId?: string }>;
}

/**
 * 카탈로그(설비종류+분류) 변경을 한 트랜잭션으로 원자 적용.
 * 순서: 분류 생성/수정 → 타입 생성/수정/삭제 → 분류 삭제(FK). role 보유 타입은 삭제·분류변경 금지.
 * 신규 id 는 클라이언트 uuid(타입이 같은 commit 의 새 분류를 FK 로 즉시 참조 — remapping 불요).
 */
export async function commitCatalog(input: CatalogCommitInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = tx as unknown as typeof prisma;
    const cat = input.assetCategories;
    const ty = input.assetTypes;

    if (cat) {
      for (const c of cat.creates) {
        await t.assetCategory.create({ data: { id: c.id, name: c.name.trim(), sortOrder: c.sortOrder ?? 0 } });
      }
      for (const u of cat.updates) {
        await t.assetCategory.update({
          where: { id: u.id },
          data: {
            ...(u.patch.name !== undefined ? { name: u.patch.name.trim() } : {}),
            ...(u.patch.sortOrder !== undefined ? { sortOrder: u.patch.sortOrder } : {}),
          },
        });
      }
    }

    if (ty) {
      for (const c of ty.creates) {
        await t.assetType.create({
          data: { id: c.id, name: c.name.trim(), role: 'device', categoryId: c.categoryId },
        });
      }
      for (const u of ty.updates) {
        const ex = await t.assetType.findUnique({ where: { id: u.id } });
        if (!ex) throw new ValidationError(`존재하지 않는 종류: ${u.id}`);
        if (ex.role !== 'device' && u.patch.categoryId !== undefined) {
          throw new ConflictError('시스템 종류는 분류를 변경할 수 없습니다(이름만 수정 가능).');
        }
        await t.assetType.update({
          where: { id: u.id },
          data: {
            ...(u.patch.name !== undefined ? { name: u.patch.name.trim() } : {}),
            ...(u.patch.categoryId !== undefined ? { categoryId: u.patch.categoryId } : {}),
            ...(u.patch.laborType !== undefined ? { laborType: u.patch.laborType } : {}),
            ...(u.patch.installHoursPerUnit !== undefined ? { installHoursPerUnit: u.patch.installHoursPerUnit } : {}),
            ...(u.patch.removeHoursPerUnit !== undefined ? { removeHoursPerUnit: u.patch.removeHoursPerUnit } : {}),
            ...(u.patch.relocateHoursPerUnit !== undefined ? { relocateHoursPerUnit: u.patch.relocateHoursPerUnit } : {}),
          },
        });
      }
      for (const d of ty.deletes) {
        const ex = await t.assetType.findUnique({ where: { id: d.id } });
        if (!ex) continue;
        if (ex.role !== 'device') throw new ConflictError('시스템 종류는 삭제할 수 없습니다.');
        const inUse = await t.asset.count({ where: { assetTypeId: d.id } });
        if (inUse > 0) throw new ConflictError(`이 종류를 사용 중인 자산 ${inUse}개가 있어 삭제할 수 없습니다.`);
        await t.assetType.delete({ where: { id: d.id } });
      }
    }

    if (cat) {
      for (const d of cat.deletes) {
        const inUse = await t.assetType.count({ where: { categoryId: d.id } });
        if (inUse > 0) throw new ConflictError(`이 분류를 사용 중인 종류 ${inUse}개가 있어 삭제할 수 없습니다.`);
        await t.assetCategory.delete({ where: { id: d.id } });
      }
    }

    // ── 케이블 그룹/종류 ──
    const cg = input.cableGroups;
    const cc = input.cableCategories;
    if (cg) {
      for (const c of cg.creates) await t.cableGroup.create({ data: { id: c.id, name: c.name.trim(), color: c.color ?? null } });
      for (const u of cg.updates) await t.cableGroup.update({ where: { id: u.id }, data: {
        ...(u.patch.name !== undefined ? { name: u.patch.name.trim() } : {}),
        ...(u.patch.color !== undefined ? { color: u.patch.color } : {}),
        ...(u.patch.sortOrder !== undefined ? { sortOrder: u.patch.sortOrder } : {}),
        ...(u.patch.laborType !== undefined ? { laborType: u.patch.laborType } : {}),
        ...(u.patch.installHoursPerMeter !== undefined ? { installHoursPerMeter: u.patch.installHoursPerMeter } : {}),
        ...(u.patch.removeHoursPerMeter !== undefined ? { removeHoursPerMeter: u.patch.removeHoursPerMeter } : {}),
        ...(u.patch.relocateHoursPerMeter !== undefined ? { relocateHoursPerMeter: u.patch.relocateHoursPerMeter } : {}),
      } });
    }
    if (cc) {
      for (const c of cc.creates) {
        if (c.groupId) {
          const g = await t.cableGroup.findUnique({ where: { id: c.groupId } });
          if (!g) throw new ValidationError(`존재하지 않는 그룹: ${c.groupId}`);
        }
        await t.cableCategory.create({ data: { id: c.id, name: c.name.trim(), groupId: c.groupId } });
      }
      for (const u of cc.updates) {
        if (u.patch.groupId !== undefined) {
          const g = await t.cableGroup.findUnique({ where: { id: u.patch.groupId } });
          if (!g) throw new ValidationError(`존재하지 않는 그룹: ${u.patch.groupId}`);
        }
        await t.cableCategory.update({ where: { id: u.id }, data: { ...(u.patch.name !== undefined ? { name: u.patch.name.trim() } : {}), ...(u.patch.groupId !== undefined ? { groupId: u.patch.groupId } : {}) } });
      }
      for (const d of cc.deletes) {
        const inUse = await t.cable.count({ where: { categoryId: d.id } });
        if (inUse > 0) throw new ConflictError(`이 종류를 사용 중인 케이블 ${inUse}개가 있어 삭제할 수 없습니다.`);
        await t.cableCategory.delete({ where: { id: d.id } });
      }
    }
    if (cg) {
      for (const d of cg.deletes) {
        const inUse = await t.cableCategory.count({ where: { groupId: d.id } });
        if (inUse > 0) throw new ConflictError(`이 그룹을 사용 중인 종류 ${inUse}개가 있어 삭제할 수 없습니다.`);
        await t.cableGroup.delete({ where: { id: d.id } });
      }
    }
  });
}

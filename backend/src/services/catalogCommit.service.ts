import { randomUUID } from 'node:crypto';
import prisma from '../config/prisma.js';
import { ConflictError, ValidationError } from '../utils/errors.js';

interface CollDelta<C, U> { creates: C[]; updates: { id: string; patch: U }[]; deletes: { id: string }[] }
export interface CatalogCommitInput {
  assetCategories?: CollDelta<{ id: string; name: string; sortOrder?: number }, { name?: string; sortOrder?: number }>;
  assetTypes?: CollDelta<{ id: string; name: string; categoryId: string | null }, { name?: string; categoryId?: string | null }>;
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
          data: { id: c.id, code: `MOD-${randomUUID().slice(0, 8).toUpperCase()}`, name: c.name.trim(), role: 'device', categoryId: c.categoryId, requiredToCreate: ['name'] },
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
  });
}

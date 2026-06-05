import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { collectConflicts, VersionConflictError } from './concurrency.js';

export interface AssetCommitInput {
  creates: { tempId: string; assetTypeId: string; name: string; parentAssetId?: string | null;
    roomText?: string | null; attributes?: Record<string, unknown> | null;
    installDate?: string | null; manager?: string | null; status?: string | null;
    warrantyUntil?: string | null; replaceDue?: string | null }[];
  updates: { id: string; baseVersion: string | null; patch: Record<string, unknown> }[];
  deletes: { id: string; baseVersion: string | null }[];
}

const dateOrNull = (v: unknown) => (v ? new Date(v as string) : null);

class AssetCommitService {
  async commit(substationId: string, input: AssetCommitInput, userId: string) {
    return prisma.$transaction(async (tx) => {
      const ids = [...input.updates.map((u) => u.id), ...input.deletes.map((d) => d.id)];
      const rows = ids.length
        ? await tx.asset.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true, name: true } })
        : [];
      const current = new Map(rows.map((r) => [r.id, r.updatedAt]));
      const nameById = new Map(rows.map((r) => [r.id, r.name]));
      const conflicts = [
        ...collectConflicts('assets', current, input.updates.map((u) => ({ id: u.id, baseVersion: u.baseVersion, name: nameById.get(u.id) }))),
        ...collectConflicts('assets', current, input.deletes.map((d) => ({ id: d.id, baseVersion: d.baseVersion, name: nameById.get(d.id) }))),
      ];
      if (conflicts.length) throw new VersionConflictError(conflicts);

      const idMap: Record<string, string> = {};
      for (const c of input.creates) {
        const created = await tx.asset.create({
          data: {
            substationId, assetTypeId: c.assetTypeId, name: c.name,
            parentAssetId: c.parentAssetId ?? null, roomText: c.roomText ?? null,
            attributes: (c.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
            installDate: dateOrNull(c.installDate), manager: c.manager ?? null, status: c.status ?? null,
            warrantyUntil: dateOrNull(c.warrantyUntil), replaceDue: dateOrNull(c.replaceDue),
            createdById: userId, updatedById: userId,
          },
        });
        idMap[c.tempId] = created.id;
      }
      for (const u of input.updates) {
        const p = u.patch;
        await tx.asset.update({
          where: { id: u.id },
          data: {
            name: p.name as string | undefined,
            roomText: p.roomText as string | null | undefined,
            attributes: (p.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
            installDate: p.installDate === undefined ? undefined : dateOrNull(p.installDate),
            manager: p.manager as string | null | undefined,
            status: p.status as string | null | undefined,
            warrantyUntil: p.warrantyUntil === undefined ? undefined : dateOrNull(p.warrantyUntil),
            replaceDue: p.replaceDue === undefined ? undefined : dateOrNull(p.replaceDue),
            updatedById: userId,
          },
        });
      }
      if (input.deletes.length) {
        await tx.asset.deleteMany({ where: { id: { in: input.deletes.map((d) => d.id) } } });
      }
      const touched = [...input.updates.map((u) => u.id), ...Object.values(idMap)];
      const updated = touched.length
        ? await tx.asset.findMany({ where: { id: { in: touched } }, select: { id: true, updatedAt: true } })
        : [];
      return { idMap, updated: updated.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() })) };
    });
  }
}
export const assetCommitService = new AssetCommitService();

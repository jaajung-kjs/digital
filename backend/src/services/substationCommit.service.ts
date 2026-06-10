import { Prisma, CableType } from '@prisma/client';
import prisma from '../config/prisma.js';
import { collectConflicts, VersionConflictError, type ConflictItem } from './concurrency.js';
import type { SubstationCommitInput } from '../schemas/substationCommit.schema.js';
import {
  assertCableEndpointsValid,
  assertRackParentValid,
  assertDistParentValid,
  assertSlotValid,
  assertNoSlotCollision,
} from './planApply.js';

/**
 * 통합 변전소 커밋 (SSOT-2a).
 *
 * assets(+placement) / cables / rackModules / distributionCircuits / fiberPaths
 * + 선택적 floor 를 하나의 delta 페이로드로 받아 단일 트랜잭션에 커밋한다.
 *
 *  - per-entity OCC: 각 컬렉션의 update/delete 대상 baseVersion 을 현재
 *    updatedAt.toISOString() 와 비교(assetCommit 동일 규약). 하나라도 stale 면
 *    전체 409 (롤백).
 *  - tempId 교차 해소: assets 의 create tempId → real id 를 먼저 만들고,
 *    cables/rackModules/distCircuits/fiberPaths 의 참조에서 치환.
 *  - 검증은 bulkUpdatePlan 과 동일한 planApply 공유 헬퍼 사용.
 *
 * NOTE: rackModules / distributionCircuits 는 Asset(자식) / DistributionCircuit
 *       테이블에 저장된다 (별도 RackModule 모델 없음).
 */

type Tx = Prisma.TransactionClient;

/**
 * 단계2(통합 노드): 단일 Asset endpoint(assetId)를 legacy endpoint 컬럼으로 파생.
 * - 랙 모듈(parentAssetId 있음) → moduleId
 * - 그 외(설비) → equipmentId
 * 회로(branch) asset 은 dev 에 0개 — 여기 도달 시 equipmentId 로 둔다(legacy null 아님).
 * assetId 가 null/undefined 면 모두 null.
 */
async function deriveLegacyEndpoint(
  tx: Tx,
  assetId: string | null | undefined,
): Promise<{ equipmentId: string | null; moduleId: string | null }> {
  if (!assetId) return { equipmentId: null, moduleId: null };
  const a = await tx.asset.findUnique({
    where: { id: assetId },
    select: { id: true, parentAssetId: true },
  });
  if (!a) return { equipmentId: null, moduleId: null };
  return a.parentAssetId
    ? { equipmentId: null, moduleId: a.id }
    : { equipmentId: a.id, moduleId: null };
}

const dateOrNull = (v: unknown) => (v ? new Date(v as string) : null);
/** undefined → undefined(미변경), 그 외 → Date|null. patch 의 날짜 필드용. */
const patchDate = (v: unknown) => (v === undefined ? undefined : v ? new Date(v as string) : null);
const toInt = (v: unknown) => (v == null ? undefined : Math.trunc(Number(v)));

export interface CommitResult {
  idMaps: {
    assets: Record<string, string>;
    cables: Record<string, string>;
    rackModules: Record<string, string>;
    distributionCircuits: Record<string, string>;
    fiberPaths: Record<string, string>;
  };
  updated: {
    assets: { id: string; updatedAt: string }[];
    cables: { id: string; updatedAt: string }[];
    rackModules: { id: string; updatedAt: string }[];
    distributionCircuits: { id: string; updatedAt: string }[];
    fiberPaths: { id: string; updatedAt: string }[];
    floor?: { id: string; updatedAt: string };
  };
}

/** 컬렉션의 update/delete 대상 id 들을 모아 현재 updatedAt 맵 + 이름 맵을 만든다. */
async function loadOcc(
  rows: { id: string; updatedAt: Date; name?: string | null }[],
): Promise<{ current: Map<string, Date>; nameById: Map<string, string | null> }> {
  return {
    current: new Map(rows.map((r) => [r.id, r.updatedAt])),
    nameById: new Map(rows.map((r) => [r.id, r.name ?? null])),
  };
}

export async function commitSubstation(
  substationId: string,
  input: SubstationCommitInput,
  userId: string,
): Promise<CommitResult> {
  try {
    return await prisma.$transaction(
      (tx) => run(tx, substationId, input, userId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  } catch (e) {
    // REPEATABLE READ 직렬화 실패(P2034) → 동시 변경 충돌 409.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
      throw new VersionConflictError([{ collection: 'commit', id: '', name: '동시 변경 충돌' }]);
    }
    throw e;
  }
}

async function run(
  tx: Tx,
  substationId: string,
  input: SubstationCommitInput,
  userId: string,
): Promise<CommitResult> {
  const idMaps: CommitResult['idMaps'] = {
    assets: {}, cables: {}, rackModules: {}, distributionCircuits: {}, fiberPaths: {},
  };
  const updated: CommitResult['updated'] = {
    assets: [], cables: [], rackModules: [], distributionCircuits: [], fiberPaths: [],
  };

  // ── 1) per-entity OCC across all present collections ──
  const conflicts: ConflictItem[] = [];

  // assets
  if (input.assets) {
    const ids = [...input.assets.updates.map((u) => u.id), ...input.assets.deletes.map((d) => d.id)];
    const rows = ids.length
      ? await tx.asset.findMany({ where: { id: { in: ids }, substationId }, select: { id: true, updatedAt: true, name: true } })
      : [];
    const { current, nameById } = await loadOcc(rows);
    conflicts.push(
      ...collectConflicts('assets', current, input.assets.updates.map((u) => ({ id: u.id, baseVersion: u.baseVersion, name: nameById.get(u.id) ?? undefined }))),
      ...collectConflicts('assets', current, input.assets.deletes.map((d) => ({ id: d.id, baseVersion: d.baseVersion, name: nameById.get(d.id) ?? undefined }))),
    );
  }
  // cables
  if (input.cables) {
    const ids = [...input.cables.updates.map((u) => u.id), ...input.cables.deletes.map((d) => d.id)];
    // C1: cable 은 substationId 컬럼이 없어 endpoint asset/회로의 substationId 로 스코핑.
    const rows = ids.length
      ? await tx.cable.findMany({
          where: {
            id: { in: ids },
            OR: [
              { sourceEquipment: { substationId } },
              { targetEquipment: { substationId } },
              { sourceModule: { substationId } },
              { targetModule: { substationId } },
              { sourceCircuit: { distribution: { substationId } } },
              { targetCircuit: { distribution: { substationId } } },
            ],
          },
          select: { id: true, updatedAt: true },
        })
      : [];
    const { current } = await loadOcc(rows);
    conflicts.push(
      ...collectConflicts('cables', current, input.cables.updates.map((u) => ({ id: u.id, baseVersion: u.baseVersion }))),
      ...collectConflicts('cables', current, input.cables.deletes.map((d) => ({ id: d.id, baseVersion: d.baseVersion }))),
    );
  }
  // rackModules (stored as Asset rows)
  if (input.rackModules) {
    const ids = [...input.rackModules.updates.map((u) => u.id), ...input.rackModules.deletes.map((d) => d.id)];
    const rows = ids.length
      ? await tx.asset.findMany({ where: { id: { in: ids }, substationId }, select: { id: true, updatedAt: true, name: true } })
      : [];
    const { current, nameById } = await loadOcc(rows);
    conflicts.push(
      ...collectConflicts('rackModules', current, input.rackModules.updates.map((u) => ({ id: u.id, baseVersion: u.baseVersion, name: nameById.get(u.id) ?? undefined }))),
      ...collectConflicts('rackModules', current, input.rackModules.deletes.map((d) => ({ id: d.id, baseVersion: d.baseVersion, name: nameById.get(d.id) ?? undefined }))),
    );
  }
  // distributionCircuits
  if (input.distributionCircuits) {
    const ids = [...input.distributionCircuits.updates.map((u) => u.id), ...input.distributionCircuits.deletes.map((d) => d.id)];
    // C1: 부모 분전반 asset 의 substationId 로 스코핑.
    const rows = ids.length
      ? await tx.distributionCircuit.findMany({
          where: { id: { in: ids }, distribution: { substationId } },
          select: { id: true, updatedAt: true },
        })
      : [];
    const { current } = await loadOcc(rows);
    conflicts.push(
      ...collectConflicts('distributionCircuits', current, input.distributionCircuits.updates.map((u) => ({ id: u.id, baseVersion: u.baseVersion }))),
      ...collectConflicts('distributionCircuits', current, input.distributionCircuits.deletes.map((d) => ({ id: d.id, baseVersion: d.baseVersion }))),
    );
  }
  // fiberPaths
  if (input.fiberPaths) {
    const ids = [...input.fiberPaths.updates.map((u) => u.id), ...input.fiberPaths.deletes.map((d) => d.id)];
    // C1: OFD endpoint asset 의 substationId 로 스코핑 (양 끝 중 하나라도 이 변전소).
    const rows = ids.length
      ? await tx.fiberPath.findMany({
          where: { id: { in: ids }, OR: [{ ofdA: { substationId } }, { ofdB: { substationId } }] },
          select: { id: true, updatedAt: true },
        })
      : [];
    const { current } = await loadOcc(rows);
    conflicts.push(
      ...collectConflicts('fiberPaths', current, input.fiberPaths.updates.map((u) => ({ id: u.id, baseVersion: u.baseVersion }))),
      ...collectConflicts('fiberPaths', current, input.fiberPaths.deletes.map((d) => ({ id: d.id, baseVersion: d.baseVersion }))),
    );
  }
  // floor
  let floorRow: { id: string; updatedAt: Date; name: string } | null = null;
  if (input.floor) {
    // C2: floor 가 이 변전소 소유인지 검증 (다른 변전소 floor 변조 차단).
    floorRow = await tx.floor.findFirst({
      where: { id: input.floor.id, substationId },
      select: { id: true, updatedAt: true, name: true },
    });
    if (!floorRow) {
      conflicts.push({ collection: 'floor', id: input.floor.id });
    } else if (input.floor.baseVersion != null && floorRow.updatedAt.toISOString() !== input.floor.baseVersion) {
      conflicts.push({ collection: 'floor', id: floorRow.id, name: floorRow.name });
    }
  }

  if (conflicts.length) throw new VersionConflictError(conflicts);

  // ── 2) assets first (so tempIds resolve for refs) ──
  if (input.assets) {
    const a = input.assets;

    // NOTE: 변전소당 OFD 1개 제약은 제거됨 — 변전소는 여러 광단국(OFD)을 가질 수 있다.

    for (const c of a.creates) {
      const created = await tx.asset.create({
        data: {
          substationId,
          assetTypeId: c.assetTypeId,
          name: c.name,
          parentAssetId: c.parentAssetId ?? null,
          roomText: c.roomText ?? null,
          attributes: (c.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
          installDate: dateOrNull(c.installDate),
          manager: c.manager ?? null,
          status: c.status ?? null,
          warrantyUntil: dateOrNull(c.warrantyUntil),
          replaceDue: dateOrNull(c.replaceDue),
          // placement
          floorId: c.floorId ?? null,
          positionX: c.positionX ?? null,
          positionY: c.positionY ?? null,
          width2d: c.width2d ?? null,
          height2d: c.height2d ?? null,
          rotation: toInt(c.rotation) ?? 0,
          totalU: c.totalU ?? null,
          createdById: userId,
          updatedById: userId,
        },
      });
      idMaps.assets[c.tempId] = created.id;
    }

    for (const u of a.updates) {
      const p = u.patch;
      // C1: 변전소 스코핑 — 다른 변전소 asset 이면 매치 실패 → P2025 (롤백).
      await tx.asset.update({
        where: { id: u.id, substationId },
        data: {
          assetTypeId: p.assetTypeId as string | undefined,
          name: p.name as string | undefined,
          parentAssetId: p.parentAssetId as string | null | undefined,
          roomText: p.roomText as string | null | undefined,
          attributes: (p.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
          installDate: patchDate(p.installDate),
          manager: p.manager as string | null | undefined,
          status: p.status as string | null | undefined,
          warrantyUntil: patchDate(p.warrantyUntil),
          replaceDue: patchDate(p.replaceDue),
          // placement
          floorId: p.floorId as string | null | undefined,
          positionX: p.positionX as number | null | undefined,
          positionY: p.positionY as number | null | undefined,
          width2d: p.width2d as number | null | undefined,
          height2d: p.height2d as number | null | undefined,
          rotation: p.rotation === undefined ? undefined : toInt(p.rotation),
          totalU: p.totalU as number | null | undefined,
          updatedById: userId,
        },
      });
    }

    if (a.deletes.length) {
      await tx.asset.deleteMany({ where: { id: { in: a.deletes.map((d) => d.id) }, substationId } });
    }

    const touched = [...a.updates.map((u) => u.id), ...Object.values(idMaps.assets)];
    if (touched.length) {
      const rows = await tx.asset.findMany({ where: { id: { in: touched } }, select: { id: true, updatedAt: true } });
      updated.assets = rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() }));
    }
  }

  const resolveAsset = (id: string | null | undefined): string | null =>
    id ? idMaps.assets[id] ?? id : null;

  // ── 3) rackModules (Asset children) ──
  if (input.rackModules) {
    const m = input.rackModules;

    if (m.deletes.length) {
      // C1: 랙 모듈도 Asset 행이므로 substationId 로 스코핑.
      await tx.asset.deleteMany({ where: { id: { in: m.deletes.map((d) => d.id) }, substationId } });
    }

    // 슬롯 충돌 검사용 live 슬롯 추적 (랙별). 초기: 관련 랙의 DB 잔존 모듈.
    const liveByRack = new Map<string, { id: string; slotIndex: number; slotSpan: number }[]>();
    const ensureLive = async (rackId: string) => {
      if (liveByRack.has(rackId)) return liveByRack.get(rackId)!;
      const sibs = await tx.asset.findMany({
        where: { parentAssetId: rackId },
        select: { id: true, slotIndex: true, slotSpan: true },
      });
      const deletedIds = new Set(m.deletes.map((d) => d.id));
      const arr = sibs
        .filter((s) => !deletedIds.has(s.id))
        .map((s) => ({ id: s.id, slotIndex: s.slotIndex ?? 0, slotSpan: s.slotSpan ?? 1 }));
      liveByRack.set(rackId, arr);
      return arr;
    };

    for (const c of m.creates) {
      const rackId = resolveAsset(c.rackEquipmentId)!;
      await assertRackParentValid(tx, rackId, c.categoryId);
      assertSlotValid(c.slotIndex, c.slotSpan);
      const arr = await ensureLive(rackId);
      assertNoSlotCollision(c.slotIndex, c.slotSpan, arr);
      const created = await tx.asset.create({
        data: {
          substationId,
          assetTypeId: c.categoryId,
          name: c.name,
          parentAssetId: rackId,
          slotIndex: c.slotIndex,
          slotSpan: c.slotSpan,
          installDate: dateOrNull(c.installDate),
          manager: c.manager ?? null,
          description: c.description ?? null,
          attributes: (c.properties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          sortOrder: c.sortOrder ?? 0,
          createdById: userId,
          updatedById: userId,
        },
      });
      idMaps.rackModules[c.tempId] = created.id;
      arr.push({ id: created.id, slotIndex: c.slotIndex, slotSpan: c.slotSpan });
    }

    for (const u of m.updates) {
      const p = u.patch;
      const rackId = p.rackEquipmentId ? resolveAsset(p.rackEquipmentId as string) : undefined;
      if (rackId && p.categoryId) {
        await assertRackParentValid(tx, rackId, p.categoryId as string);
      }
      // W1: 부분 패치(slotIndex 또는 slotSpan 또는 부모만)도 검증되도록 현재 행에
      //     패치를 병합한 값으로 슬롯 유효성·충돌을 검사.
      const touchesSlot =
        p.slotIndex !== undefined || p.slotSpan !== undefined || p.rackEquipmentId !== undefined;
      if (touchesSlot) {
        const cur = await tx.asset.findUnique({
          where: { id: u.id },
          select: { parentAssetId: true, slotIndex: true, slotSpan: true },
        });
        const mergedRackId = rackId ?? cur?.parentAssetId ?? null;
        const mergedSlotIndex = (p.slotIndex as number | undefined) ?? cur?.slotIndex ?? 0;
        const mergedSlotSpan = (p.slotSpan as number | undefined) ?? cur?.slotSpan ?? 1;
        assertSlotValid(mergedSlotIndex, mergedSlotSpan);
        if (mergedRackId) {
          const arr = await ensureLive(mergedRackId);
          assertNoSlotCollision(mergedSlotIndex, mergedSlotSpan, arr, [u.id]);
        }
      }
      await tx.asset.update({
        where: { id: u.id, substationId },
        data: {
          parentAssetId: rackId,
          assetTypeId: p.categoryId as string | undefined,
          name: p.name as string | undefined,
          slotIndex: p.slotIndex as number | undefined,
          slotSpan: p.slotSpan as number | undefined,
          installDate: patchDate(p.installDate),
          manager: p.manager as string | null | undefined,
          description: p.description as string | null | undefined,
          attributes: (p.properties ?? undefined) as Prisma.InputJsonValue | undefined,
          sortOrder: p.sortOrder as number | undefined,
          updatedById: userId,
        },
      });
    }

    const touched = [...m.updates.map((u) => u.id), ...Object.values(idMaps.rackModules)];
    if (touched.length) {
      const rows = await tx.asset.findMany({ where: { id: { in: touched } }, select: { id: true, updatedAt: true } });
      updated.rackModules = rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() }));
    }
  }

  // ── 4) distributionCircuits ──
  if (input.distributionCircuits) {
    const dc = input.distributionCircuits;

    if (dc.deletes.length) {
      // C1: 부모 분전반 asset 의 substationId 로 스코핑.
      await tx.distributionCircuit.deleteMany({
        where: { id: { in: dc.deletes.map((d) => d.id) }, distribution: { substationId } },
      });
    }

    for (const c of dc.creates) {
      const distId = resolveAsset(c.distributionEquipmentId)!;
      await assertDistParentValid(tx, distId);
      const created = await tx.distributionCircuit.create({
        data: {
          distributionEquipmentId: distId,
          feederName: c.feederName,
          branchName: c.branchName,
          description: c.description ?? null,
          sortOrder: c.sortOrder ?? 0,
          createdById: userId,
          updatedById: userId,
        },
      });
      idMaps.distributionCircuits[c.tempId] = created.id;
    }

    for (const u of dc.updates) {
      const p = u.patch;
      const distId = p.distributionEquipmentId ? resolveAsset(p.distributionEquipmentId as string) ?? undefined : undefined;
      if (distId) await assertDistParentValid(tx, distId);
      await tx.distributionCircuit.update({
        where: { id: u.id },
        data: {
          distributionEquipmentId: distId,
          feederName: p.feederName as string | undefined,
          branchName: p.branchName as string | undefined,
          description: p.description as string | null | undefined,
          sortOrder: p.sortOrder as number | undefined,
          updatedById: userId,
        },
      });
    }

    const touched = [...dc.updates.map((u) => u.id), ...Object.values(idMaps.distributionCircuits)];
    if (touched.length) {
      const rows = await tx.distributionCircuit.findMany({ where: { id: { in: touched } }, select: { id: true, updatedAt: true } });
      updated.distributionCircuits = rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() }));
    }
  }

  // ── 5) fiberPaths ──
  if (input.fiberPaths) {
    const fp = input.fiberPaths;

    if (fp.deletes.length) {
      // C1: OFD endpoint asset 의 substationId 로 스코핑.
      await tx.fiberPath.deleteMany({
        where: {
          id: { in: fp.deletes.map((d) => d.id) },
          OR: [{ ofdA: { substationId } }, { ofdB: { substationId } }],
        },
      });
    }

    for (const c of fp.creates) {
      const created = await tx.fiberPath.create({
        data: {
          ofdAId: resolveAsset(c.ofdAId)!,
          ofdBId: resolveAsset(c.ofdBId)!,
          portCount: c.portCount,
          description: c.description ?? null,
          createdById: userId,
          updatedById: userId,
        },
      });
      idMaps.fiberPaths[c.tempId] = created.id;
    }

    for (const u of fp.updates) {
      const p = u.patch;
      await tx.fiberPath.update({
        where: { id: u.id },
        data: {
          ofdAId: p.ofdAId ? resolveAsset(p.ofdAId as string)! : undefined,
          ofdBId: p.ofdBId ? resolveAsset(p.ofdBId as string)! : undefined,
          portCount: p.portCount as number | undefined,
          description: p.description as string | null | undefined,
          updatedById: userId,
        },
      });
    }

    const touched = [...fp.updates.map((u) => u.id), ...Object.values(idMaps.fiberPaths)];
    if (touched.length) {
      const rows = await tx.fiberPath.findMany({ where: { id: { in: touched } }, select: { id: true, updatedAt: true } });
      updated.fiberPaths = rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() }));
    }
  }

  const resolveModule = (id: string | null | undefined): string | null =>
    id ? idMaps.rackModules[id] ?? id : null;
  const resolveCircuit = (id: string | null | undefined): string | null =>
    id ? idMaps.distributionCircuits[id] ?? id : null;
  const resolveFiber = (id: string | null | undefined): string | null =>
    id ? idMaps.fiberPaths[id] ?? id : null;

  // ── 6) cables (refs resolved + validated) ──
  if (input.cables) {
    const cab = input.cables;

    if (cab.deletes.length) {
      // C1: endpoint asset/회로의 substationId 로 스코핑.
      await tx.cable.deleteMany({
        where: {
          id: { in: cab.deletes.map((d) => d.id) },
          OR: [
            { sourceEquipment: { substationId } },
            { targetEquipment: { substationId } },
            { sourceModule: { substationId } },
            { targetModule: { substationId } },
            { sourceCircuit: { distribution: { substationId } } },
            { targetCircuit: { distribution: { substationId } } },
          ],
        },
      });
    }

    for (const c of cab.creates) {
      // 단계2: 단일 assetId 가 제공되면 canonical 로 보고 legacy endpoint 를 파생.
      // (랙 모듈 → moduleId, 그 외 → equipmentId) — nested source/target 보다 우선.
      const srcAssetId = c.source.equipmentId == null && c.source.moduleId == null && c.source.circuitId == null
        ? resolveAsset(c.sourceAssetId)
        : null;
      const tgtAssetId = c.target.equipmentId == null && c.target.moduleId == null && c.target.circuitId == null
        ? resolveAsset(c.targetAssetId)
        : null;
      const srcFromAsset = srcAssetId ? await deriveLegacyEndpoint(tx, srcAssetId) : null;
      const tgtFromAsset = tgtAssetId ? await deriveLegacyEndpoint(tx, tgtAssetId) : null;

      const ep = {
        srcEqId: srcFromAsset ? srcFromAsset.equipmentId : resolveAsset(c.source.equipmentId),
        srcModId: srcFromAsset ? srcFromAsset.moduleId : resolveModule(c.source.moduleId),
        srcCircuitId: srcFromAsset ? null : resolveCircuit(c.source.circuitId),
        tgtEqId: tgtFromAsset ? tgtFromAsset.equipmentId : resolveAsset(c.target.equipmentId),
        tgtModId: tgtFromAsset ? tgtFromAsset.moduleId : resolveModule(c.target.moduleId),
        tgtCircuitId: tgtFromAsset ? null : resolveCircuit(c.target.circuitId),
        fiberPathId: resolveFiber(c.fiberPathId),
        fiberPortNumber: c.fiberPortNumber ?? undefined,
      };
      await assertCableEndpointsValid(tx, [ep]);
      // *_asset_id: 해소된 legacy endpoint(설비/모듈)에서 파생. 회로 endpoint 는 null(구 경로).
      const sourceAssetId = ep.srcEqId ?? ep.srcModId ?? null;
      const targetAssetId = ep.tgtEqId ?? ep.tgtModId ?? null;
      const created = await tx.cable.create({
        data: {
          sourceEquipmentId: ep.srcEqId,
          sourceModuleId: ep.srcModId,
          sourceCircuitId: ep.srcCircuitId,
          targetEquipmentId: ep.tgtEqId,
          targetModuleId: ep.tgtModId,
          targetCircuitId: ep.tgtCircuitId,
          sourceAssetId,
          targetAssetId,
          cableType: c.cableType as CableType,
          label: c.label ?? null,
          length: c.length ?? null,
          color: c.color ?? null,
          description: c.description ?? null,
          fiberPathId: ep.fiberPathId,
          fiberPortNumber: c.fiberPortNumber ?? null,
          categoryId: c.categoryId ?? null,
          specParams: c.specParams as Prisma.InputJsonValue | undefined,
          pathPoints: c.pathPoints as Prisma.InputJsonValue | undefined,
          pathLength: c.pathLength ?? null,
          bufferLength: c.bufferLength ?? 4,
          totalLength: c.totalLength ?? null,
          createdById: userId,
          updatedById: userId,
        },
      });
      idMaps.cables[c.tempId] = created.id;
    }

    for (const u of cab.updates) {
      const p = u.patch;
      const existing = await tx.cable.findUniqueOrThrow({
        where: { id: u.id },
        select: {
          sourceEquipmentId: true, sourceModuleId: true, sourceCircuitId: true,
          targetEquipmentId: true, targetModuleId: true, targetCircuitId: true,
          fiberPathId: true, fiberPortNumber: true,
        },
      });
      // 단계2: patch 에 단일 assetId 가 있으면 canonical 로 보고 legacy endpoint 파생.
      const srcFromAsset = p.sourceAssetId !== undefined
        ? await deriveLegacyEndpoint(tx, resolveAsset(p.sourceAssetId))
        : null;
      const tgtFromAsset = p.targetAssetId !== undefined
        ? await deriveLegacyEndpoint(tx, resolveAsset(p.targetAssetId))
        : null;

      const ep = {
        srcEqId: srcFromAsset ? srcFromAsset.equipmentId
          : p.source?.equipmentId !== undefined ? resolveAsset(p.source.equipmentId) : existing.sourceEquipmentId,
        srcModId: srcFromAsset ? srcFromAsset.moduleId
          : p.source?.moduleId !== undefined ? resolveModule(p.source.moduleId) : existing.sourceModuleId,
        srcCircuitId: srcFromAsset ? null
          : p.source?.circuitId !== undefined ? resolveCircuit(p.source.circuitId) : existing.sourceCircuitId,
        tgtEqId: tgtFromAsset ? tgtFromAsset.equipmentId
          : p.target?.equipmentId !== undefined ? resolveAsset(p.target.equipmentId) : existing.targetEquipmentId,
        tgtModId: tgtFromAsset ? tgtFromAsset.moduleId
          : p.target?.moduleId !== undefined ? resolveModule(p.target.moduleId) : existing.targetModuleId,
        tgtCircuitId: tgtFromAsset ? null
          : p.target?.circuitId !== undefined ? resolveCircuit(p.target.circuitId) : existing.targetCircuitId,
        fiberPathId: p.fiberPathId !== undefined ? resolveFiber(p.fiberPathId) : existing.fiberPathId,
        fiberPortNumber: p.fiberPortNumber !== undefined ? (p.fiberPortNumber as number | null) : existing.fiberPortNumber,
      };
      await assertCableEndpointsValid(tx, [ep]);
      // *_asset_id 를 해소된 endpoint 에 맞춰 항상 동기화(회로 endpoint 는 null).
      const sourceAssetId = ep.srcEqId ?? ep.srcModId ?? null;
      const targetAssetId = ep.tgtEqId ?? ep.tgtModId ?? null;
      await tx.cable.update({
        where: { id: u.id },
        data: {
          sourceEquipmentId: ep.srcEqId,
          sourceModuleId: ep.srcModId,
          sourceCircuitId: ep.srcCircuitId,
          targetEquipmentId: ep.tgtEqId,
          targetModuleId: ep.tgtModId,
          targetCircuitId: ep.tgtCircuitId,
          sourceAssetId,
          targetAssetId,
          cableType: p.cableType as CableType | undefined,
          label: p.label as string | null | undefined,
          length: p.length as number | null | undefined,
          color: p.color as string | null | undefined,
          description: p.description as string | null | undefined,
          fiberPathId: ep.fiberPathId,
          fiberPortNumber: ep.fiberPortNumber,
          categoryId: p.categoryId as string | null | undefined,
          specParams: p.specParams as Prisma.InputJsonValue | undefined,
          pathPoints: p.pathPoints as Prisma.InputJsonValue | undefined,
          pathLength: p.pathLength as number | null | undefined,
          bufferLength: p.bufferLength as number | undefined,
          totalLength: p.totalLength as number | null | undefined,
          updatedById: userId,
        },
      });
    }

    const touched = [...cab.updates.map((u) => u.id), ...Object.values(idMaps.cables)];
    if (touched.length) {
      const rows = await tx.cable.findMany({ where: { id: { in: touched } }, select: { id: true, updatedAt: true } });
      updated.cables = rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() }));
    }
  }

  // ── 7) floor (settings → columns) ──
  if (input.floor && floorRow) {
    const s = input.floor.settings;
    const f = await tx.floor.update({
      where: { id: input.floor.id },
      data: {
        ...(s?.canvasWidth !== undefined ? { canvasWidth: s.canvasWidth } : {}),
        ...(s?.canvasHeight !== undefined ? { canvasHeight: s.canvasHeight } : {}),
        ...(s?.gridSize !== undefined ? { gridSize: s.gridSize } : {}),
        ...(s?.majorGridSize !== undefined ? { majorGridSize: s.majorGridSize } : {}),
        ...(s?.backgroundOpacity !== undefined ? { backgroundOpacity: s.backgroundOpacity } : {}),
        ...(s?.backgroundDrawing !== undefined
          ? { backgroundDrawing: s.backgroundDrawing === null ? Prisma.JsonNull : (s.backgroundDrawing as Prisma.InputJsonValue) }
          : {}),
        updatedById: userId,
      },
      select: { id: true, updatedAt: true },
    });
    updated.floor = { id: f.id, updatedAt: f.updatedAt.toISOString() };
  }

  return { idMaps, updated };
}

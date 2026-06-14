import { Prisma, CableType } from '@prisma/client';
import prisma from '../config/prisma.js';
import { collectConflicts, VersionConflictError, type ConflictItem } from './concurrency.js';
import {
  type SubstationCommitInput,
  ASSET_SCALAR_FIELDS,
} from '../schemas/substationCommit.schema.js';
import {
  assertCableEndpointsValid,
  assertRackParentValid,
  assertSlotValid,
  assertNoSlotCollision,
} from './planApply.js';
import { extractSourcePresetId } from './sourcePreset.js';
import { getAssetRecordModel } from './assetRecordSchema.service.js';
import { ValidationError } from '../utils/errors.js';

/**
 * 프론트는 설비/모듈의 source preset 을 여전히 `properties: { sourcePresetId }`(또는
 * 자산은 attributes) JSON 모양으로 보낸다. attributes 컬럼은 드롭됐으므로 경계에서
 * sourcePresetId(컬럼) 로 추출한다. 직접 API 가 sourcePresetId 문자열을 보내면 그대로 사용.
 */
function resolveSourcePresetId(json: unknown, direct?: unknown): string | null {
  if (typeof direct === 'string') return direct || null;
  return extractSourcePresetId(json);
}

/**
 * 통합 변전소 커밋 (SSOT-2a).
 *
 * assets(+placement) / cables / rackModules
 * + 선택적 floor 를 하나의 delta 페이로드로 받아 단일 트랜잭션에 커밋한다.
 *
 *  - per-entity OCC: 각 컬렉션의 update/delete 대상 baseVersion 을 현재
 *    updatedAt.toISOString() 와 비교(assetCommit 동일 규약). 하나라도 stale 면
 *    전체 409 (롤백).
 *  - tempId 교차 해소: assets 의 create tempId → real id 를 먼저 만들고,
 *    cables/rackModules 의 참조에서 치환.
 *  - 검증은 bulkUpdatePlan 과 동일한 planApply 공유 헬퍼 사용.
 *
 * NOTE: rackModules 와 분전 회로(feeder/branch)는 모두 Asset(자식) 행으로 저장된다
 *       (별도 회로 커밋 경로 없음 — 단계3b/4b/4c, DistributionCircuit 모델 제거됨).
 *       케이블 endpoint 는 단일 Asset 노드 — source_asset_id/target_asset_id 만 쓴다.
 */

type Tx = Prisma.TransactionClient;

const dateOrNull = (v: unknown) => (v ? new Date(v as string) : null);
/** undefined → undefined(미변경), 그 외 → Date|null. patch 의 날짜 필드용. */
const patchDate = (v: unknown) => (v === undefined ? undefined : v ? new Date(v as string) : null);
const toInt = (v: unknown) => (v == null ? undefined : Math.trunc(Number(v)));

// ── 자산 기록(records) 제네릭 헬퍼 — 스키마-구동(assetRecordSchema) 모델로 라우팅 ──
interface RecordDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  update: (a: unknown) => Promise<unknown>;
  deleteMany: (a: unknown) => Promise<unknown>;
}
/** prisma 트랜잭션에서 모델 델리게이트를 이름으로 동적 접근(inspectionLog/maintenanceLog/equipmentPhoto…). */
function recordDelegate(tx: Tx, delegate: string): RecordDelegate {
  return (tx as unknown as Record<string, RecordDelegate>)[delegate];
}
/** 기록 컬럼 값 강제 변환 — date 는 ISO 문자열→Date, 그 외 통과. */
function coerceRecordField(type: string, v: unknown): unknown {
  return type === 'date' ? (v ? new Date(v as string) : null) : v;
}

// ── 자산/랙모듈 공통 스칼라(SSOT) ─────────────────────────────────────────────
// 랙 모듈도 Asset 행이다. asset/rackModule 의 create·update 가 각자 필드를 나열하면
// 한 곳이 빠져 드롭 버그(status·description 등)가 난다 → 공통 스칼라는 여기 한 곳에서.
// create: 기본값(null/0) 채움. update: 부분 패치(undefined=미변경).
// ASSET_SCALAR_FIELDS(스키마의 SSOT)로부터 create/update data 를 파생한다.
// 새 스칼라 컬럼은 그 배열에 한 줄 추가하면 여기 두 함수에 자동 반영된다.
// kind 별 매핑(현재 의미 그대로):
//   create: date → dateOrNull, number → ?? 0(NOT NULL) | ?? null, string → ?? null | as(NOT NULL name)
//   update: date → patchDate, 그 외 → pass-through(undefined=미변경)
const assetCommonCreate = (c: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const f of ASSET_SCALAR_FIELDS) {
    const v = c[f.key];
    if (f.kind === 'date') {
      out[f.key] = dateOrNull(v);
    } else if (f.nullable) {
      out[f.key] = v ?? null; // string|number nullable → 기본 null
    } else {
      // NOT NULL: name 은 그대로(필수), number(sortOrder) 는 0 기본값.
      out[f.key] = f.kind === 'number' ? (v ?? 0) : v;
    }
  }
  return out as {
    name: string;
    installDate: Date | null;
    manager: string | null;
    description: string | null;
    status: string | null;
    warrantyUntil: Date | null;
    replaceDue: Date | null;
    sortOrder: number;
  };
};
const assetCommonUpdate = (p: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const f of ASSET_SCALAR_FIELDS) {
    out[f.key] = f.kind === 'date' ? patchDate(p[f.key]) : p[f.key];
  }
  return out as {
    name: string | undefined;
    installDate: Date | null | undefined;
    manager: string | null | undefined;
    description: string | null | undefined;
    status: string | null | undefined;
    warrantyUntil: Date | null | undefined;
    replaceDue: Date | null | undefined;
    sortOrder: number | undefined;
  };
};

/** 부모(같은 배치의 create)가 자식보다 먼저 오도록 위상정렬 — parentAssetId tempId 해소를 위해. */
function orderCreatesByParent<T extends { tempId: string; parentAssetId?: string | null }>(creates: T[]): T[] {
  const byTempId = new Map(creates.map((c) => [c.tempId, c]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  const visit = (c: T) => {
    if (seen.has(c.tempId)) return;
    seen.add(c.tempId);
    const parent = c.parentAssetId != null ? byTempId.get(c.parentAssetId) : undefined;
    if (parent) visit(parent);
    ordered.push(c);
  };
  for (const c of creates) visit(c);
  return ordered;
}

export interface CommitResult {
  idMaps: {
    assets: Record<string, string>;
    cables: Record<string, string>;
    rackModules: Record<string, string>;
    records: Record<string, string>;
  };
  updated: {
    assets: { id: string; updatedAt: string }[];
    cables: { id: string; updatedAt: string }[];
    rackModules: { id: string; updatedAt: string }[];
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

/**
 * 전역 커밋 — 변전소 스코프 없음(노드+엣지+기록을 한 트랜잭션에). substationId 는 더 이상
 * 스코프가 아니라, substationId 를 싣지 않은 신규 자산 create 의 기본 변전소일 뿐이다
 * (구 per-변전소 라우트 호환). 전역 라우트는 각 create 가 자기 substationId 를 싣는다.
 */
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
    assets: {}, cables: {}, rackModules: {}, records: {},
  };
  const updated: CommitResult['updated'] = {
    assets: [], cables: [], rackModules: [],
  };

  // ── 1) per-entity OCC across all present collections ──
  const conflicts: ConflictItem[] = [];

  // assets
  if (input.assets) {
    const ids = [...input.assets.updates.map((u) => u.id), ...input.assets.deletes.map((d) => d.id)];
    const rows = ids.length
      ? await tx.asset.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true, name: true } })
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
          where: { id: { in: ids } },
          select: { id: true, updatedAt: true },
        })
      : [];
    const { current } = await loadOcc(rows);
    conflicts.push(
      ...collectConflicts('cables', current, input.cables.updates.map((u) => ({ id: u.id, baseVersion: u.baseVersion }))),
      ...collectConflicts('cables', current, input.cables.deletes.map((d) => ({ id: d.id, baseVersion: d.baseVersion }))),
    );
  }
  // floor
  let floorRow: { id: string; updatedAt: Date; name: string } | null = null;
  if (input.floor) {
    // C2: floor 가 이 변전소 소유인지 검증 (다른 변전소 floor 변조 차단).
    floorRow = await tx.floor.findFirst({
      where: { id: input.floor.id },
      select: { id: true, updatedAt: true, name: true },
    });
    if (!floorRow) {
      conflicts.push({ collection: 'floor', id: input.floor.id });
    } else if (input.floor.baseVersion != null && floorRow.updatedAt.toISOString() !== input.floor.baseVersion) {
      conflicts.push({ collection: 'floor', id: floorRow.id, name: floorRow.name });
    }
  }

  // records — 스키마-구동 모델별 제네릭 OCC. updatedAt 있는 모델(hasVersion)만 검사(사진 제외).
  if (input.records) {
    const refs = [...input.records.updates, ...input.records.deletes];
    const byType = new Map<string, { id: string; baseVersion: string | null }[]>();
    for (const x of refs) {
      const arr = byType.get(x.recordType) ?? [];
      arr.push({ id: x.id, baseVersion: x.baseVersion });
      byType.set(x.recordType, arr);
    }
    for (const [recordType, rs] of byType) {
      const m = getAssetRecordModel(recordType);
      if (!m || !m.hasVersion) continue;
      const rows = (await recordDelegate(tx, m.delegate).findMany({
        where: { id: { in: rs.map((x) => x.id) } },
        select: { id: true, updatedAt: true },
      })) as { id: string; updatedAt: Date }[];
      const { current } = await loadOcc(rows);
      conflicts.push(...collectConflicts('records', current, rs));
    }
  }

  if (conflicts.length) throw new VersionConflictError(conflicts);

  // ── 슬롯 충돌 검사용 live 슬롯 추적 (랙별). 슬롯형(slotIndex!=null) 자식만 포함 ──
  // assets create/update 양쪽이 공유. 비-슬롯 자식(feeder/branch 등 slotIndex=null)은 제외.
  const liveByRack = new Map<string, { id: string; slotIndex: number; slotSpan: number }[]>();
  const deletedAssetIds = new Set<string>((input.assets?.deletes ?? []).map((d) => d.id));
  const ensureLive = async (rackId: string) => {
    if (liveByRack.has(rackId)) return liveByRack.get(rackId)!;
    const sibs = await tx.asset.findMany({
      where: { parentAssetId: rackId },
      select: { id: true, slotIndex: true, slotSpan: true },
    });
    const arr = sibs
      .filter((s) => !deletedAssetIds.has(s.id) && s.slotIndex != null)
      .map((s) => ({ id: s.id, slotIndex: s.slotIndex ?? 0, slotSpan: s.slotSpan ?? 1 }));
    liveByRack.set(rackId, arr);
    return arr;
  };

  // ── 2) assets first (so tempIds resolve for refs) ──
  if (input.assets) {
    const a = input.assets;

    // NOTE: 변전소당 OFD 1개 제약은 제거됨 — 변전소는 여러 광단국(OFD)을 가질 수 있다.

    for (const c of orderCreatesByParent(a.creates)) {
      const parentId = c.parentAssetId != null ? (idMaps.assets[c.parentAssetId] ?? c.parentAssetId) : null;
      const cSlotIndex = (c as { slotIndex?: number | null }).slotIndex ?? null;
      const cSlotSpan = (c as { slotSpan?: number | null }).slotSpan ?? 1;
      // slotIndex 가 있으면 랙 모듈 — 부모 카테고리·슬롯 유효성·충돌 검증(종전 rackModules 경로 이관).
      if (cSlotIndex != null) {
        if (!parentId) throw new ValidationError('랙 모듈은 부모(랙)가 필요합니다');
        await assertRackParentValid(tx, parentId, c.assetTypeId);
        assertSlotValid(cSlotIndex, cSlotSpan);
        const arr = await ensureLive(parentId);
        assertNoSlotCollision(cSlotIndex, cSlotSpan, arr);
      }
      const created = await tx.asset.create({
        data: {
          substationId: (c as { substationId?: string }).substationId ?? substationId,
          assetTypeId: c.assetTypeId,
          ...assetCommonCreate(c as unknown as Record<string, unknown>),
          parentAssetId: parentId,
          roomText: c.roomText ?? null,
          sourcePresetId: resolveSourcePresetId(c.attributes, c.sourcePresetId),
          slotIndex: cSlotIndex,
          slotSpan: cSlotIndex != null ? cSlotSpan : null,
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
      if (cSlotIndex != null) liveByRack.get(parentId!)!.push({ id: created.id, slotIndex: cSlotIndex, slotSpan: cSlotSpan });
    }

    for (const u of a.updates) {
      const p = u.patch;
      const patchParent =
        'parentAssetId' in p ? (idMaps.assets[p.parentAssetId as string] ?? p.parentAssetId) : undefined;
      const touchesSlot = p.slotIndex !== undefined || p.slotSpan !== undefined || 'parentAssetId' in p;
      if (touchesSlot) {
        const cur = await tx.asset.findUnique({
          where: { id: u.id },
          select: { parentAssetId: true, slotIndex: true, slotSpan: true },
        });
        const mergedSlotIndex = (p.slotIndex as number | null | undefined) ?? cur?.slotIndex ?? null;
        if (mergedSlotIndex != null) {
          const mergedRackId = (patchParent as string | null | undefined) ?? cur?.parentAssetId ?? null;
          const mergedSlotSpan = (p.slotSpan as number | undefined) ?? cur?.slotSpan ?? 1;
          assertSlotValid(mergedSlotIndex, mergedSlotSpan);
          if (mergedRackId) {
            if (p.assetTypeId) await assertRackParentValid(tx, mergedRackId, p.assetTypeId as string);
            const arr = await ensureLive(mergedRackId);
            assertNoSlotCollision(mergedSlotIndex, mergedSlotSpan, arr, [u.id]);
          }
        }
      }
      // C1: 변전소 스코핑 — 다른 변전소 asset 이면 매치 실패 → P2025 (롤백).
      await tx.asset.update({
        where: { id: u.id },
        data: {
          assetTypeId: p.assetTypeId as string | undefined,
          ...assetCommonUpdate(p as Record<string, unknown>),
          parentAssetId: patchParent as string | null | undefined,
          roomText: p.roomText as string | null | undefined,
          sourcePresetId:
            p.sourcePresetId !== undefined
              ? (p.sourcePresetId as string | null)
              : p.attributes !== undefined
                ? extractSourcePresetId(p.attributes)
                : undefined,
          // placement
          floorId: p.floorId as string | null | undefined,
          positionX: p.positionX as number | null | undefined,
          positionY: p.positionY as number | null | undefined,
          width2d: p.width2d as number | null | undefined,
          height2d: p.height2d as number | null | undefined,
          rotation: p.rotation === undefined ? undefined : toInt(p.rotation),
          slotIndex: p.slotIndex as number | null | undefined,
          slotSpan: p.slotSpan as number | null | undefined,
          totalU: p.totalU as number | null | undefined,
          updatedById: userId,
        },
      });
    }

    if (a.deletes.length) {
      await tx.asset.deleteMany({ where: { id: { in: a.deletes.map((d) => d.id) } } });
    }

    const touched = [...a.updates.map((u) => u.id), ...Object.values(idMaps.assets)];
    if (touched.length) {
      const rows = await tx.asset.findMany({ where: { id: { in: touched } }, select: { id: true, updatedAt: true } });
      updated.assets = rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() }));
    }
  }

  const resolveAsset = (id: string | null | undefined): string | null =>
    id ? idMaps.assets[id] ?? id : null;

  // ── 2.5) records (자산 소유 하위레코드) — 스키마-구동 제네릭, 종류별 하드코딩 없음 ──
  // recordType(테이블명)으로 assetRecordSchema 모델을 해소 → 그 모델의 컬럼만 매핑(date 강제),
  // assetId(같은 페이로드 asset tempId 가능 → resolveAsset)·audit 자동. DB 에 자산 기록 테이블이
  // 추가되면 코드 수정 없이 커밋된다. 사진은 바이너리만 커밋 직전 업로드(imageUrl 컬럼으로 들어옴).
  if (input.records) {
    const r = input.records;

    // deletes — recordType 별 모델 deleteMany.
    const delByType = new Map<string, string[]>();
    for (const d of r.deletes) {
      const a = delByType.get(d.recordType) ?? [];
      a.push(d.id);
      delByType.set(d.recordType, a);
    }
    for (const [recordType, ids] of delByType) {
      const m = getAssetRecordModel(recordType);
      if (!m) continue;
      await recordDelegate(tx, m.delegate).deleteMany({ where: { id: { in: ids } } });
    }

    // creates — 모델 컬럼을 스키마-구동으로 매핑. assetId 해소 + audit 자동.
    for (const c of r.creates) {
      const rec = c as unknown as Record<string, unknown>;
      const m = getAssetRecordModel(rec.recordType as string);
      if (!m) continue;
      const data: Record<string, unknown> = { assetId: resolveAsset(rec.assetId as string)! };
      for (const f of m.fields) {
        if (rec[f.name] === undefined) continue;
        data[f.name] = coerceRecordField(f.type, rec[f.name]);
      }
      if (m.hasAudit) { data.createdById = userId; data.updatedById = userId; }
      const created = await recordDelegate(tx, m.delegate).create({ data });
      idMaps.records[rec.tempId as string] = created.id;
    }

    // updates — patch 컬럼만(date 강제), updatedById 자동.
    for (const u of r.updates) {
      const m = getAssetRecordModel(u.recordType);
      if (!m) continue;
      const p = u.patch as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      for (const f of m.fields) {
        if (p[f.name] === undefined) continue;
        data[f.name] = coerceRecordField(f.type, p[f.name]);
      }
      if (m.hasAudit) data.updatedById = userId;
      await recordDelegate(tx, m.delegate).update({ where: { id: u.id }, data });
    }
  }

  // 단계4b: 케이블 endpoint 노드 해소 — tempId(같은 페이로드의 asset create)면 real id 로,
  // 아니면 그대로. asset / cable idMap 양쪽을 본다(케이블이 다른 케이블을 참조하진 않지만
  // resolveNode 는 단일 노드 해소 choke-point 로 둔다).
  const resolveNode = (id: string | null | undefined): string | null =>
    id ? idMaps.assets[id] ?? idMaps.cables[id] ?? id : null;

  // ── 5) cables (single assetId endpoint, resolved + validated) ──
  if (input.cables) {
    const cab = input.cables;

    if (cab.deletes.length) {
      // C1: endpoint asset 의 substationId 로 스코핑.
      await tx.cable.deleteMany({ where: { id: { in: cab.deletes.map((d) => d.id) } } });
    }

    for (const c of cab.creates) {
      const sourceAssetId = resolveNode(c.sourceAssetId)!;
      const targetAssetId = resolveNode(c.targetAssetId)!;
      await assertCableEndpointsValid(tx, [
        { sourceAssetId, targetAssetId },
      ]);
      const created = await tx.cable.create({
        data: {
          // endpoint 는 단일 Asset 노드만 쓴다 — legacy *_equipment/module/circuit_id 는 null.
          sourceAssetId,
          targetAssetId,
          cableType: c.cableType as CableType,
          label: c.label ?? null,
          length: c.length ?? null,
          color: c.color ?? null,
          description: c.description ?? null,
          number: c.number ?? null,
          sourceRole: c.sourceRole ?? null,
          targetRole: c.targetRole ?? null,
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
        select: { sourceAssetId: true, targetAssetId: true },
      });
      // endpoint 는 필수(NOT NULL). 변경 시 resolveNode, 미변경 시 existing(이미 non-null).
      const sourceAssetId =
        (p.sourceAssetId !== undefined ? resolveNode(p.sourceAssetId) : existing.sourceAssetId)!;
      const targetAssetId =
        (p.targetAssetId !== undefined ? resolveNode(p.targetAssetId) : existing.targetAssetId)!;
      await assertCableEndpointsValid(tx, [
        { sourceAssetId, targetAssetId },
      ]);
      await tx.cable.update({
        where: { id: u.id },
        data: {
          sourceAssetId,
          targetAssetId,
          cableType: p.cableType as CableType | undefined,
          label: p.label as string | null | undefined,
          length: p.length as number | null | undefined,
          color: p.color as string | null | undefined,
          description: p.description as string | null | undefined,
          number: p.number as number | null | undefined,
          sourceRole: p.sourceRole as 'IN' | 'OUT' | null | undefined,
          targetRole: p.targetRole as 'IN' | 'OUT' | null | undefined,
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

  // ── 6) floor (settings → columns) ──
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

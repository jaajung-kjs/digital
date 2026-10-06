/**
 * 국 설비 선언(`STATION_KITS`)을 DB 에 **없는 것만** 세운다.
 *
 * 첫 배포 시드와 운영 backfill 이 같은 함수를 쓴다 — 그래서 규칙이 셋이다:
 *   - **설비**: 그 국에 같은 이름의 뿌리 설비가 없을 때만 만든다(현장이 지운 것은 backfill 을
 *     다시 돌려야만 되살아난다 — 기동 시드는 빈 DB 에서만 이 함수를 부른다).
 *   - **분기 이름·용량**: 포트 이름이 품목이 지어 준 그대로(`분기 N`)일 때만 붙인다.
 *   - **케이블**: 양끝이 모두 비어 있고 화면에서도 이을 수 있는 짝일 때만 잇는다
 *     (`validateConnection` — 방향·갈래가 안 맞는 분기는 이름표로만 남는다).
 *
 * 만드는 길은 화면과 같은 커밋 경로다(`commitSubstation`). 포트는 서버가 품목 명세로 만든다.
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_FACING, portName, validateConnection, type Direction, type StationKit } from '@twin/core';
import { commitSubstation } from '../v2/commit.service.js';
import { nextDb } from '../v2/db.js';
import type { CommitPayload } from '../v2/schemas.js';

type AssetCreate = NonNullable<NonNullable<CommitPayload['assets']>['creates']>[number];
type PortRow = {
  id: string; assetId: string; group: string; index: number; name: string;
  direction: string; medium: string; positions: number; variant: string | null;
  fieldValues: unknown;
};

export interface KitResult { equipment: number; labels: number; cables: number; skipped: string[] }

/** 도면에 나란히 — 뜻 없는 자리다. OFD 가 (40, 40) 에 있으니 그 옆부터 채운다. */
const SLOT = { x0: 40, y0: 40, step: 90, perRow: 8, size: 70 };
const rectAt = (i: number) => ({
  x: SLOT.x0 + (i % SLOT.perRow) * SLOT.step,
  y: SLOT.y0 + Math.floor(i / SLOT.perRow) * SLOT.step,
  width: SLOT.size,
  height: SLOT.size,
});

export async function placeStationKit(
  substationId: string,
  kit: StationKit,
  opts: {
    apply: boolean;
    log?: (line: string) => void;
    /** 선번장 판 번호 → OFD 설비 품목의 구성 항목 id. 없으면 광 점퍼를 잇지 않는다. */
    plates?: ReadonlyMap<number, string>;
  },
): Promise<KitResult> {
  const log = opts.log ?? (() => {});
  const result: KitResult = { equipment: 0, labels: 0, cables: 0, skipped: [] };

  const assemblies = new Map((await nextDb.assembly.findMany({
    include: { items: { orderBy: { sortOrder: 'asc' } }, links: true },
  })).map((a) => [a.key, a]));
  const typeIdByKey = new Map((await nextDb.assetType.findMany({ select: { id: true, key: true } }))
    .map((t) => [t.key, t.id]));
  const powerCat = await nextDb.cableCategory.findFirst({
    where: { group: { key: 'power' } }, orderBy: { sortOrder: 'asc' },
  });
  const groundCat = await nextDb.cableCategory.findFirst({
    where: { group: { key: 'ground' } }, orderBy: { sortOrder: 'asc' },
  });
  /* 실내 광 결선은 점퍼코드다 — 이름으로 고르되, 없으면 광 그룹의 첫 종류. */
  const fiberCats = await nextDb.cableCategory.findMany({
    where: { group: { key: 'fiber' } }, orderBy: { sortOrder: 'asc' },
  });
  const jumperCat = fiberCats.find((c) => /점퍼/.test(c.name)) ?? fiberCats[0] ?? null;
  const floor = await nextDb.floor.findFirst({ where: { substationId }, orderBy: { sortOrder: 'asc' } });
  if (!floor) {
    result.skipped.push('층이 없음');
    return result;
  }

  // ── ① 설비 ────────────────────────────────────────────────────────────────────
  const roots = await nextDb.asset.findMany({
    where: { substationId, parentAssetId: null }, select: { name: true },
  });
  const existing = new Set(roots.map((r) => r.name));
  let seat = roots.length;
  const creates: AssetCreate[] = [];
  /** 이번에 만든 설비 — 품목의 내부 배선을 이 설비들에만 잇는다. */
  const fresh = new Map<string, string>();

  for (const eq of kit.equipment) {
    if (existing.has(eq.name)) continue;
    const asm = assemblies.get(eq.assembly);
    if (!asm) {
      result.skipped.push(`${eq.name}: 설비 품목 ${eq.assembly} 없음`);
      continue;
    }
    const rootId = randomUUID();
    fresh.set(eq.name, eq.assembly);
    existing.add(eq.name);
    result.equipment++;
    log(`  + ${eq.name} (${asm.name})`);
    creates.push({
      id: rootId, name: eq.name, assemblyId: asm.id, floorId: floor.id, ...rectAt(seat++),
      fieldValues: { facing: DEFAULT_FACING },
    });
    const fills = new Map((eq.fill ?? []).map(([slot, typeKey, name]) => [slot, { typeKey, name }]));
    for (const item of asm.items) {
      const fill = fills.get(item.name);
      const typeId = fill ? typeIdByKey.get(fill.typeKey) : item.typeId;
      if (fill && !typeId) result.skipped.push(`${eq.name}/${item.name}: 장비 품목 ${fill.typeKey} 없음`);
      if (!typeId) continue;
      creates.push({
        id: randomUUID(), name: fill?.name ?? item.name, typeId, parentAssetId: rootId,
        assemblyItemId: item.id,
        col: item.col, row: item.row, colSpan: item.colSpan, rowSpan: item.rowSpan,
        ...(fill ? {} : {
          portCounts: item.portCounts as Record<string, number>,
          portPositions: item.portPositions as Record<string, number>,
        }),
      } as AssetCreate);
    }
    for (const [slot] of fills) {
      if (!asm.items.some((i) => i.name === slot)) result.skipped.push(`${eq.name}: 슬롯 「${slot}」 없음`);
    }
  }
  if (opts.apply && creates.length > 0) {
    await commitSubstation(substationId, { assets: { creates } });
  }
  if (!opts.apply) return result;

  // ── ② 포트 찾기 — `설비/부품/그룹:번호` ────────────────────────────────────────────
  const parts = await nextDb.asset.findMany({
    where: { substationId, parentAssetId: { not: null } },
    include: {
      ports: { include: { _count: { select: { cablesA: true, cablesB: true } } } },
      parentAsset: { select: { name: true } },
      assemblyItem: { select: { id: true, name: true } },
    },
  });
  const portAt = new Map<string, PortRow>();
  const cableCount = new Map<string, number>();
  const partAt = new Map<string, { id: string; updatedAt: Date }>();
  /** 설비 이름 → 구성 항목 id → 부품 — 품목의 내부 배선을 풀 때. */
  const partByItem = new Map<string, Map<string, string>>();
  /** OFD 구성 항목 id → 판 자산 — 선번장의 판을 찾을 때. */
  const plateAsset = new Map<string, string>();
  for (const part of parts) {
    const root = part.parentAsset?.name;
    if (!root) continue;
    const names = new Set([part.name, part.assemblyItem?.name].filter((n): n is string => !!n));
    for (const n of names) partAt.set(`${root}/${n}`, part);
    if (part.assemblyItem) {
      (partByItem.get(root) ?? partByItem.set(root, new Map()).get(root)!).set(part.assemblyItem.id, part.id);
      plateAsset.set(part.assemblyItem.id, part.id);
    }
    for (const p of part.ports) {
      for (const n of names) portAt.set(`${root}/${n}/${p.group}:${p.index}`, p);
      portAt.set(`#${part.id}/${p.group}:${p.index}`, p);
      cableCount.set(p.id, p._count.cablesA + p._count.cablesB);
    }
  }

  // ── ③ 분기 이름·용량 ────────────────────────────────────────────────────────────
  const patches = new Map<string, { portId: string; name: string; fieldValues: Record<string, unknown> }[]>();
  const links: [string, string][] = [];
  for (const panel of kit.panels) {
    for (const [item, branches] of Object.entries(panel.buses)) {
      branches.forEach(([label, ampere, to], i) => {
        const group = portAt.has(`${panel.equip}/${item}/POWER-OUT-DC:1`) ? 'POWER-OUT-DC' : 'POWER-OUT-AC';
        const at = `${panel.equip}/${item}/${group}:${i + 1}`;
        const port = portAt.get(at);
        if (!port) {
          result.skipped.push(`${at}: 분기가 없음`);
          return;
        }
        if (to) links.push([at, to]);
        /* 품목이 지어 준 이름 그대로일 때만 — 현장이 고친 이름은 안 덮는다. */
        if (port.name !== portName('분기 {n}', i + 1)) return;
        const part = partAt.get(`${panel.equip}/${item}`)!;
        const fieldValues = { ...(port.fieldValues as Record<string, unknown>) };
        if (ampere != null && fieldValues.ampere == null) fieldValues.ampere = ampere;
        (patches.get(part.id) ?? patches.set(part.id, []).get(part.id)!)
          .push({ portId: port.id, name: label, fieldValues });
        result.labels++;
      });
    }
  }
  if (patches.size > 0) {
    const ids = [...patches.keys()];
    const rows = await nextDb.asset.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true } });
    await commitSubstation(substationId, {
      baseVersions: Object.fromEntries(rows.map((r) => [r.id, r.updatedAt.toISOString()])),
      assets: { updates: ids.map((id) => ({ id, patch: { portPatches: patches.get(id)! } })) },
    });
  }

  // ── ④ 케이블 — 선언된 연결 + 새로 만든 설비의 내부 배선 ─────────────────────────────
  const pairs: { a: PortRow; b: PortRow; categoryId: string | null; specParams: Record<string, unknown> }[] = [];
  const want = (aAt: string, bAt: string) => {
    const a = portAt.get(aAt);
    const b = portAt.get(bAt);
    if (!a || !b) {
      result.skipped.push(`${aAt} → ${bAt}: 포트가 없음`);
      return;
    }
    const cat = a.medium === 'ground' ? groundCat : a.medium === 'power' ? powerCat : null;
    pairs.push({ a, b, categoryId: cat?.id ?? null, specParams: {} });
  };
  for (const [a, b] of [...kit.feeds, ...links]) want(a, b);
  for (const [root, key] of fresh) {
    const asm = assemblies.get(key)!;
    const byItem = partByItem.get(root);
    for (const l of asm.links) {
      const aPart = byItem?.get(l.aItemId);
      const bPart = byItem?.get(l.bItemId);
      const a = aPart && portAt.get(`#${aPart}/${l.aGroup}:${l.aIndex}`);
      const b = bPart && portAt.get(`#${bPart}/${l.bGroup}:${l.bIndex}`);
      if (a && b) pairs.push({ a, b, categoryId: l.categoryId, specParams: l.specParams as Record<string, unknown> });
    }
  }

  /* 광 — 판의 앞면 코어(`FIBER:코어`)에서 장비로, 또는 판끼리. */
  if (opts.plates && kit.fiber) {
    const front = (plate: number, core: number) => {
      const item = opts.plates!.get(plate);
      const asset = item && plateAsset.get(item);
      return asset ? `#${asset}/FIBER:${core}` : `판 ${plate}(세워지지 않음)`;
    };
    const wantFiber = (aAt: string, bAt: string) => {
      const a = portAt.get(aAt);
      const b = portAt.get(bAt);
      if (!a || !b) {
        result.skipped.push(`${aAt} → ${bAt}: 포트가 없음`);
        return;
      }
      pairs.push({ a, b, categoryId: jumperCat?.id ?? null, specParams: {} });
    };
    for (const [plate, core, to] of kit.fiber.jumpers) wantFiber(front(plate, core), to);
    for (const [pa, ca, pb, cb] of kit.fiber.patches) wantFiber(front(pa, ca), front(pb, cb));
  }

  const cables: NonNullable<NonNullable<CommitPayload['cables']>['creates']> = [];
  for (const { a, b, categoryId, specParams } of pairs) {
    const ref = (p: PortRow) => ({ ...p, direction: p.direction as Direction });
    const err = validateConnection(ref(a), ref(b), cableCount);
    if (err) {
      /* 이미 물려 있는 것은 조용히 넘긴다 — 두 번 돌려도 같아야 한다. */
      if (err !== 'port-occupied') result.skipped.push(`${a.name} → ${b.name}: ${err}`);
      continue;
    }
    cableCount.set(a.id, (cableCount.get(a.id) ?? 0) + 1);
    cableCount.set(b.id, (cableCount.get(b.id) ?? 0) + 1);
    cables.push({ id: randomUUID(), aPortId: a.id, bPortId: b.id, categoryId, specParams });
  }
  if (cables.length > 0) {
    await commitSubstation(substationId, { cables: { creates: cables } });
    result.cables = cables.length;
  }
  return result;
}

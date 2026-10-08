/**
 * 조직 노드(본부·지사·국) 아래 **설비** 전부 — 현황 표·종류별 대수의 근원.
 * 랙은 싣지 않는다: 현황은 설비를 센다(랙은 함체다).
 */
import { Router } from 'express';
import type { Prisma } from '../generated/next-client/index.js';
import { authenticate } from './auth.middleware.js';
import { endRefOf } from './commit/state.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const nodesRouter = Router();
nodesRouter.use(authenticate);

async function substationsUnder(id: string): Promise<string[] | null> {
  if (await nextDb.substation.findUnique({ where: { id }, select: { id: true } })) return [id];
  if (await nextDb.branch.findUnique({ where: { id }, select: { id: true } })) {
    return (await nextDb.substation.findMany({ where: { branchId: id }, select: { id: true } })).map((s) => s.id);
  }
  if (await nextDb.headquarters.findUnique({ where: { id }, select: { id: true } })) {
    return (await nextDb.substation.findMany({ where: { branch: { headquartersId: id } }, select: { id: true } })).map((s) => s.id);
  }
  return null;
}

nodesRouter.get('/nodes/:id/equipment', async (req, res, next) => {
  try {
    const subs = await substationsUnder(req.params.id);
    if (!subs) throw new HttpError(404, 'NOT_FOUND', '노드를 찾을 수 없습니다');
    const rows = await nextDb.equipment.findMany({
      where: { substationId: { in: subs } },
      include: {
        substation: { select: { name: true } },
        rack: { select: { name: true } },
        type: { include: { category: { select: { name: true } } } },
        inspections: { orderBy: { inspectedAt: 'desc' }, take: 1, select: { inspectedAt: true } },
      },
      orderBy: [{ substation: { name: 'asc' } }, { name: 'asc' }],
    });
    res.json(rows.map((e) => ({
      id: e.id, name: e.name, status: e.status, updatedAt: e.updatedAt,
      substationId: e.substationId, substationName: e.substation.name,
      rackId: e.rackId, rackName: e.rack.name,
      typeId: e.typeId, typeName: e.type.name, categoryName: e.type.category.name,
      model: e.model, maker: e.maker, madeOn: e.madeOn, serial: e.serial,
      installDate: e.installDate, manager: e.manager,
      lastInspectedAt: e.inspections[0]?.inspectedAt ?? null,
    })));
  } catch (e) {
    next(e);
  }
});

type LinkWithEnds = Prisma.LinkGetPayload<{ include: { ends: true } }>;
const NETWORK_MAX_ROUNDS = 8;
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * 범위 안 광 계통 데이터(읽기 전용) — 광선로·코어·코어 끝 연결·그 끝의 설비.
 *
 * 범위 안 국에 닿은 광선로의 연결은 모두 싣는다. 그 연결이 범위 밖 광선로의 **코어**로 넘어가면(중계 패치)
 * 그 코어 하나만 따라간다(코어 끝 전선, per core) — 범위 밖 광선로의 다른 코어에 걸린 남의 회선은 싣지 않는다.
 * 경로가 범위 경계에서 끊기지 않게 최대 `NETWORK_MAX_ROUNDS` 바퀴까지 번지고, 그래도 따라갈 코어가 남으면
 * `truncated: true` 와 그 코어(`truncatedCores` — 그 너머 연결을 싣지 않은 코어)를 함께 준다.
 */
nodesRouter.get('/nodes/:id/network', async (req, res, next) => {
  try {
    const subs = await substationsUnder(req.params.id);
    if (!subs) throw new HttpError(404, 'NOT_FOUND', '노드를 찾을 수 없습니다');
    const scope = new Set(subs);

    const lines = new Map<string, Awaited<ReturnType<typeof nextDb.fiberLine.findMany>>[number]>();
    const links = new Map<string, LinkWithEnds>();
    const addLines = async (ids: string[]) => {
      const want = ids.filter((id) => !lines.has(id));
      if (want.length === 0) return;
      for (const l of await nextDb.fiberLine.findMany({ where: { id: { in: want } } })) lines.set(l.id, l);
    };
    /* 연결을 실은 코어 — 범위 안 광선로는 통째로, 범위 밖은 사슬이 닿은 코어만. */
    const visited = new Set<string>();
    const coreKey = (lineId: string, no: number) => `${lineId}:${no}`;
    const take = (rows: LinkWithEnds[]): Map<string, Set<number>> => {
      const next = new Map<string, Set<number>>();
      for (const l of rows) {
        links.set(l.id, l);
        for (const e of l.ends) {
          if (e.coreLineId == null || e.coreNo == null || visited.has(coreKey(e.coreLineId, e.coreNo))) continue;
          next.set(e.coreLineId, (next.get(e.coreLineId) ?? new Set()).add(e.coreNo));
        }
      }
      return next;
    };

    for (const l of await nextDb.fiberLine.findMany({ where: { OR: [{ aSubstationId: { in: subs } }, { bSubstationId: { in: subs } }] } })) lines.set(l.id, l);
    const inScopeLineIds = [...lines.keys()];
    for (const c of await nextDb.core.findMany({ where: { lineId: { in: inScopeLineIds } }, select: { lineId: true, no: true } })) visited.add(coreKey(c.lineId, c.no));
    let frontier = take(await nextDb.link.findMany({ where: { ends: { some: { coreLineId: { in: inScopeLineIds } } } }, include: { ends: true } }));
    for (let round = 1; round < NETWORK_MAX_ROUNDS && frontier.size > 0; round++) {
      await addLines([...frontier.keys()]);
      for (const [lineId, nos] of frontier) for (const no of nos) visited.add(coreKey(lineId, no));
      const rows = await nextDb.link.findMany({
        where: { ends: { some: { OR: [...frontier].map(([lineId, nos]) => ({ coreLineId: lineId, coreNo: { in: [...nos] } })) } } },
        include: { ends: true },
      });
      frontier = take(rows);
    }
    /* 상한에서 멈췄다 — 닿은 코어의 광선로는 싣되(이름·국), 그 너머 연결은 싣지 않았다고 알린다. */
    await addLines([...frontier.keys()]);
    const truncatedCores = [...frontier].flatMap(([lineId, nos]) => [...nos].sort((x, y) => x - y).map((no) => ({ lineId, no })))
      .sort((x, y) => (x.lineId < y.lineId ? -1 : x.lineId > y.lineId ? 1 : x.no - y.no));

    const lineRows = [...lines.values()].sort(byId);
    const linkRows = [...links.values()].sort(byId).map(({ ends, ...l }) => ({
      id: l.id, substationId: l.substationId,
      a: endRefOf(ends.find((e) => e.end === 'A')!), b: endRefOf(ends.find((e) => e.end === 'B')!),
    }));
    const cores = await nextDb.core.findMany({
      where: { lineId: { in: lineRows.map((l) => l.id) } },
      select: { lineId: true, no: true, status: true, role: true },
      orderBy: [{ lineId: 'asc' }, { no: 'asc' }],
    });

    const eqIds = new Set<string>();
    for (const l of lineRows) { if (l.aEquipmentId) eqIds.add(l.aEquipmentId); if (l.bEquipmentId) eqIds.add(l.bEquipmentId); }
    for (const l of linkRows) for (const e of [l.a, l.b]) if (e.kind !== 'core') eqIds.add(e.equipmentId);
    const equipment = (await nextDb.equipment.findMany({
      where: { id: { in: [...eqIds] } },
      select: { id: true, name: true, substationId: true, type: { select: { name: true } } },
    })).map((e) => ({ id: e.id, name: e.name, substationId: e.substationId, typeName: e.type.name })).sort(byId);

    const subIds = new Set<string>(subs);
    for (const l of lineRows) { subIds.add(l.aSubstationId); subIds.add(l.bSubstationId); }
    for (const l of linkRows) subIds.add(l.substationId);
    const substations = (await nextDb.substation.findMany({ where: { id: { in: [...subIds] } }, select: { id: true, name: true } }))
      .map((s) => ({ id: s.id, name: s.name, inScope: scope.has(s.id) })).sort(byId);

    res.json({
      substations,
      lines: lineRows.map((l) => ({
        id: l.id, name: l.name, lengthKm: l.lengthKm, cableTypeId: l.cableTypeId, coreCount: l.coreCount,
        aSubstationId: l.aSubstationId, bSubstationId: l.bSubstationId,
        aEquipmentId: l.aEquipmentId, aPanel: l.aPanel, aStartNo: l.aStartNo,
        bEquipmentId: l.bEquipmentId, bPanel: l.bPanel, bStartNo: l.bStartNo,
      })),
      cores, links: linkRows, equipment,
      truncated: truncatedCores.length > 0,
      truncatedCores,
    });
  } catch (e) {
    next(e);
  }
});

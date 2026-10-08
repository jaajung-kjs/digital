/**
 * 설비 변경 이력(읽기 전용) — `GET /equipment/:id/changes?cursor=&limit=`.
 *
 * ChangeLog 는 커밋 1건 = 1행, 무엇을 바꿨는지는 `summary` JSON(`{ substations, ops }`)에 있다.
 * 설비 id 로 바로 거를 열이 없으므로:
 *   1) SQL 은 **그 설비의 국이 든 커밋만**(`summary.substations` 에 국 id — jsonb 포함 검사) 최신부터 읽고,
 *   2) 줄 단위 판정은 코드가 한다(`equipmentChangeItems`).
 * 한 요청이 훑는 커밋은 `SCAN_BUDGET` 건까지 — 그 국의 커밋이 아주 많고 이 설비 것이 드물면 한 쪽이
 * 덜 차서 오고 `nextCursor` 가 남는다(「더 보기」가 이어서 훑는다). 순서는 (at, id) 내림차순이라 결정적이다.
 * 설비는 만든 뒤 국을 바꾸지 않으므로 국으로 거르는 것이 빠뜨리는 커밋은 없다.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';
import { decodeCursor, encodeCursor, equipmentChangeItems, type ChangeItem } from './history.js';

export const historyRouter = Router();
historyRouter.use(authenticate);

const DEFAULT_LIMIT = 50;
const SCAN_BATCH = 200;
/** 한 요청이 훑는 커밋 수 — 커밋마다 summary 에 before 행이 통째로 실려 있어 크다(「더 보기」 한 번의 읽기 양을 묶는다). */
const SCAN_BUDGET = 500;
/** 이름으로 바꿔 보여 줄 참조 칸. 지금은 없는 행이면 이 말을 적는다. */
const GONE = '(삭제됨)';

const query = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(DEFAULT_LIMIT),
});

export interface ChangeEntry { id: string; at: string; username: string; items: ChangeItem[] }

historyRouter.get('/equipment/:id/changes', async (req, res, next) => {
  try {
    const { cursor, limit } = query.parse(req.query);
    const eq = await nextDb.equipment.findUnique({ where: { id: req.params.id }, select: { id: true, substationId: true } });
    if (!eq) throw new HttpError(404, 'NOT_FOUND', '설비를 찾을 수 없습니다');
    let after = cursor ? decodeCursor(cursor) : null;
    if (cursor && !after) throw new HttpError(400, 'BAD_REQUEST', '잘못된 커서입니다');

    const entries: ChangeEntry[] = [];
    let scanned = 0;
    let exhausted = false;
    let last: { at: Date; id: string } | null = null;
    outer: while (scanned < SCAN_BUDGET) {
      const take = Math.min(SCAN_BATCH, SCAN_BUDGET - scanned);
      const logs = await nextDb.changeLog.findMany({
        where: {
          summary: { path: ['substations'], array_contains: [eq.substationId] },
          ...(after ? { OR: [{ at: { lt: after.at } }, { at: after.at, id: { lt: after.id } }] } : {}),
        },
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const log of logs) {
        scanned += 1;
        last = { at: log.at, id: log.id };
        const ops = (log.summary as { ops?: unknown } | null)?.ops;
        const items = equipmentChangeItems(ops, eq.id);
        if (items.length > 0) entries.push({ id: log.id, at: log.at.toISOString(), username: log.username, items });
        if (entries.length >= limit) break outer;
      }
      if (logs.length < take) { exhausted = true; break; }
      after = last;
    }
    /* 끝까지 읽었고 마지막 줄까지 다 썼으면 더 없다. 한 쪽이 찼으면 그 커밋 다음부터 이어 읽는다. */
    const nextCursor = exhausted && entries.length < limit ? null : last ? encodeCursor(last.at, last.id) : null;
    await resolveNames(entries);
    res.json({ entries, nextCursor });
  } catch (e) {
    next(e);
  }
});

/** 참조 칸(품목·랙·케이블 품목)의 id 와 연결의 다른 끝을 **지금의 이름**으로 — 화면은 id 를 모른다. */
async function resolveNames(entries: ChangeEntry[]): Promise<void> {
  const ids = { typeId: new Set<string>(), rackId: new Set<string>(), cableTypeId: new Set<string>(), equipment: new Set<string>(), line: new Set<string>() };
  for (const e of entries) for (const it of e.items) {
    for (const f of it.fields) {
      if (f.name !== 'typeId' && f.name !== 'rackId' && f.name !== 'cableTypeId') continue;
      for (const v of [f.before, f.after]) if (typeof v === 'string') ids[f.name].add(v);
    }
    if (it.peer?.kind === 'core') ids.line.add(it.peer.lineId);
    else if (it.peer) ids.equipment.add(it.peer.equipmentId);
  }
  const [types, racks, cables, equipment, lines] = await Promise.all([
    nextDb.equipmentType.findMany({ where: { id: { in: [...ids.typeId] } }, select: { id: true, name: true } }),
    nextDb.rack.findMany({ where: { id: { in: [...ids.rackId] } }, select: { id: true, name: true } }),
    nextDb.cableType.findMany({ where: { id: { in: [...ids.cableTypeId] } }, select: { id: true, name: true } }),
    nextDb.equipment.findMany({ where: { id: { in: [...ids.equipment] } }, select: { id: true, name: true } }),
    nextDb.fiberLine.findMany({ where: { id: { in: [...ids.line] } }, select: { id: true, name: true } }),
  ]);
  const names: Record<string, Map<string, string>> = {
    typeId: new Map(types.map((r) => [r.id, r.name])),
    rackId: new Map(racks.map((r) => [r.id, r.name])),
    cableTypeId: new Map(cables.map((r) => [r.id, r.name])),
  };
  const eqNames = new Map(equipment.map((r) => [r.id, r.name]));
  const lineNames = new Map(lines.map((r) => [r.id, r.name]));
  for (const e of entries) for (const it of e.items) {
    for (const f of it.fields) {
      const m = names[f.name];
      if (!m) continue;
      f.before = typeof f.before === 'string' ? (m.get(f.before) ?? GONE) : f.before;
      f.after = typeof f.after === 'string' ? (m.get(f.after) ?? GONE) : f.after;
    }
    if (it.peer) {
      const name = it.peer.kind === 'core' ? lineNames.get(it.peer.lineId) : eqNames.get(it.peer.equipmentId);
      it.peerName = name ?? null;
    }
  }
}

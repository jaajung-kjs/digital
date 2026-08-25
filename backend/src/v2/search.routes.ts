import { Router } from 'express';
import { authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const searchRouter = Router();
searchRouter.use(authenticate);

/**
 * 이름으로 자산 찾기 — **이 도면 밖의 끝점을 고르는 길**이다.
 *
 * 케이블은 도면을 눌러 잇지만, 반대쪽이 이 도면에 없으면 누를 것이 없다: 다른 변전소(OPGW)
 * 도, 같은 국 다른 층도 그렇다. 그래서 찾는 문은 하나로 두고 **어디 있는 것인지**를 함께
 * 적어 준다 — 「변전소 · 층」이 없으면 이름이 같은 1층 슬롯과 2층 슬롯을 가릴 수 없다.
 */
/** GET /api/v2/search/assets?q=<부분일치>&limit=<기본 20, 최대 50> */
searchRouter.get('/search/assets', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) throw new HttpError(400, 'BAD_REQUEST', '검색어(q)를 입력하세요');

    const limitParam = parseInt(req.query.limit as string, 10);
    const limit = isNaN(limitParam) ? 20 : Math.max(1, Math.min(50, limitParam));

    const rows = await nextDb.asset.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      include: {
        substation: { select: { id: true, name: true } },
        floor: { select: { name: true } },
        type: { select: { name: true } },
        // 설비 품목으로 놓은 설비는 타입이 없다 — 그때는 설비 품목이 곧 분류다.
        assembly: { select: { name: true } },
      },
      orderBy: [{ name: 'asc' }, { substation: { name: 'asc' } }],
      take: limit,
    });

    /* 층은 **놓인 조상**의 것이다 — 슬롯은 OFD 안에 있고 OFD 가 층에 놓인다. 몇 대(代)
       올라갈지는 자료가 정하므로(설비 → 장비 → 슬롯) 한 대씩 올라가며 찾는다. */
    const floorNames = await resolveFloorNames(rows);

    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      substationId: r.substationId,
      substationName: r.substation.name,
      floorName: floorNames.get(r.id) ?? null,
      typeName: r.assembly?.name ?? r.type?.name ?? '—',
    })));
  } catch (e) {
    next(e);
  }
});

/** 대(代)를 거슬러 오를 최대 깊이 — 설비 → 장비 → 슬롯이면 둘이면 닿는다(자료가 꼬여도 멈춘다). */
const FLOOR_LOOKUP_DEPTH = 5;

/** 자산 id → 놓인 층 이름. 도면에 놓인 조상이 없으면 없는 것으로 둔다(`null`). */
async function resolveFloorNames(
  rows: { id: string; parentAssetId: string | null; floor: { name: string } | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  /* 아직 못 찾은 것들: 자산 id → 다음에 물어볼 조상 id */
  let pending = new Map<string, string>();
  for (const r of rows) {
    if (r.floor) out.set(r.id, r.floor.name);
    else if (r.parentAssetId) pending.set(r.id, r.parentAssetId);
  }

  for (let depth = 0; depth < FLOOR_LOOKUP_DEPTH && pending.size > 0; depth++) {
    const askIds = [...new Set(pending.values())];
    const parents = await nextDb.asset.findMany({
      where: { id: { in: askIds } },
      select: { id: true, parentAssetId: true, floor: { select: { name: true } } },
    });
    const byId = new Map(parents.map((p) => [p.id, p]));
    const next = new Map<string, string>();
    for (const [rowId, parentId] of pending) {
      const parent = byId.get(parentId);
      if (!parent) continue;
      if (parent.floor) out.set(rowId, parent.floor.name);
      else if (parent.parentAssetId) next.set(rowId, parent.parentAssetId);
    }
    pending = next;
  }
  return out;
}

/** GET /api/v2/assets/:id/ports — occupied boolean 포함 */
searchRouter.get('/assets/:id/ports', async (req, res, next) => {
  try {
    const asset = await nextDb.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw new HttpError(404, 'NOT_FOUND', '자산을 찾을 수 없습니다');

    const ports = await nextDb.port.findMany({
      where: { assetId: req.params.id },
      orderBy: [{ group: 'asc' }, { index: 'asc' }],
    });

    // occupied: 이 포트가 케이블의 aPortId 또는 bPortId 로 사용 중인지 확인
    const portIds = ports.map((p) => p.id);
    const occupiedSet = new Set<string>();
    if (portIds.length > 0) {
      const occupiedCables = await nextDb.cable.findMany({
        where: { OR: [{ aPortId: { in: portIds } }, { bPortId: { in: portIds } }] },
        select: { aPortId: true, bPortId: true },
      });
      for (const c of occupiedCables) {
        occupiedSet.add(c.aPortId);
        occupiedSet.add(c.bPortId);
      }
    }

    res.json(ports.map((p) => ({
      id: p.id,
      group: p.group,
      index: p.index,
      name: p.name,
      direction: p.direction,
      medium: p.medium,
      occupied: occupiedSet.has(p.id),
    })));
  } catch (e) {
    next(e);
  }
});

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
    /**
     * 이름으로 찾거나, **한 변전소를 통째로 둘러보거나**.
     *
     * 찾기만 두었더니 「무엇을 쳐야 하는지」를 아는 사람만 쓸 수 있었다 — 다른 국의 설비
     * 이름을 외우고 있을 리 없다. 변전소를 고르면 그 국의 것이 층별로 다 나와야 한다.
     */
    const substationId = typeof req.query.substationId === 'string' ? req.query.substationId : null;
    if (!q && !substationId) throw new HttpError(400, 'BAD_REQUEST', '검색어(q) 또는 변전소를 지정하세요');

    const limitParam = parseInt(req.query.limit as string, 10);
    /* 둘러볼 때는 그 국의 것이 다 나와야 한다 — 스무 개에서 끊으면 목록이 거짓말을 한다. */
    const limit = isNaN(limitParam) ? (substationId ? 500 : 20) : Math.max(1, Math.min(500, limitParam));

    const rows = await nextDb.asset.findMany({
      where: {
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        ...(substationId ? { substationId } : {}),
      },
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
      /* 심선 수 — **이것이 빠지면 24심 인입이 1심으로 읽힌다**(안 적었으면 한 가닥이므로).
         그래서 대국 검색으로 OPGW 를 고르면 「심선 수가 다름」으로 막혔다. 연결 규칙이
         묻는 값은 다 실어 보낸다. */
      positions: p.positions,
      occupied: occupiedSet.has(p.id),
    })));
  } catch (e) {
    next(e);
  }
});

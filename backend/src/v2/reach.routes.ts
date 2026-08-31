import { Router } from 'express';
import { authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const reachRouter = Router();
reachRouter.use(authenticate);

/**
 * 이 포트에서 **케이블로 이어진 것 전부** — 국 경계를 넘어서.
 *
 * 워킹카피는 한 국만 든다. 그래서 추적은 대국 자산이 아예 없어 「자국 슬롯 앞면」에서
 * 끝난다. 토폴로지가 그리려는 것이 정확히 그 바깥이므로, 자료를 여기서 따로 받아 온다.
 *
 * **서버는 자료만 준다.** 마디·줄·링·좌표는 core 의 순수 함수가 계산한다 — 그래야 시험이
 * 쉽고, 화면과 서버가 다른 답을 낼 수 없다.
 *
 * 걷는 단위는 **자산**이다(포트가 아니다). 토폴로지의 줄은 구간 케이블 한 본이라 코어
 * 대응을 따질 일이 없다. 코어를 지키는 일은 이 자료 위에서 추적 엔진이 다시 한다.
 */

/** 한 번에 모을 자산 수 — 넘으면 거기서 멈추고 「일부만」이라고 알린다. */
const MAX_ASSETS = 5000;

/**
 * 이 자산에서 **케이블로 이어진 자산·케이블**을 너비 우선으로 모은다.
 *
 * `maxAssets` 를 넘어야 실을 수 있는 케이블은 **아예 담지 않는다** — 양끝을 다 실을 수
 * 없는 케이블을 반쪽만 실으면, 화면이 그 케이블의 끝을 못 찾아 마디를 못 세우고 줄만
 * 붕 뜬다. 응답은 스스로 아귀가 맞아야 한다: `cables` 의 모든 끝점 자산은 반드시
 * `assetIds` 안에 있다.
 *
 * 시험이 작은 한계로 이 함수를 직접 불러 truncation 경로를 밟을 수 있도록 라우트에서
 * 뽑아냈다 — 그 밖의 이유로 구조를 바꾼 것은 아니다.
 */
export async function collectComponent(
  startAssetId: string, maxAssets: number,
): Promise<{ assetIds: Set<string>; cableIds: Set<string>; truncated: boolean }> {
  const assetIds = new Set<string>([startAssetId]);
  const cableIds = new Set<string>();
  let frontier = [startAssetId];
  let truncated = false;

  while (frontier.length > 0 && !truncated) {
    const cables = await nextDb.cable.findMany({
      where: {
        OR: [{ aPort: { assetId: { in: frontier } } }, { bPort: { assetId: { in: frontier } } }],
      },
      select: { id: true, aPort: { select: { assetId: true } }, bPort: { select: { assetId: true } } },
    });
    const next: string[] = [];
    for (const c of cables) {
      const newSides = [c.aPort.assetId, c.bPort.assetId].filter((id) => !assetIds.has(id));
      if (assetIds.size + newSides.length > maxAssets) {
        // 이 케이블의 새 끝을 다 실으면 한계를 넘는다 — 통째로 건너뛴다(끊긴 채로 남기지 않는다).
        truncated = true;
        break;
      }
      cableIds.add(c.id);
      for (const id of newSides) {
        assetIds.add(id);
        next.push(id);
      }
    }
    frontier = next;
  }

  return { assetIds, cableIds, truncated };
}

reachRouter.post('/reach', async (req, res, next) => {
  try {
    const portId = typeof req.body?.portId === 'string' ? req.body.portId : null;
    if (!portId) throw new HttpError(400, 'BAD_REQUEST', '포트를 지정하세요');

    const seed = await nextDb.port.findUnique({ where: { id: portId }, select: { assetId: true } });
    if (!seed) throw new HttpError(404, 'NOT_FOUND', '없는 포트입니다');

    // ── 케이블로 이어진 자산을 너비 우선으로 모은다 ──────────────────────
    const { assetIds, cableIds, truncated } = await collectComponent(seed.assetId, MAX_ASSETS);

    /* 조상(설비)까지 — 끝점을 「설비 - 장비」로 부르려면 부모 이름이 있어야 하는데,
       케이블은 부모에 닿지 않으므로 걷기만으로는 절대 들어오지 않는다. */
    let pending = [...assetIds];
    while (pending.length > 0) {
      const rows = await nextDb.asset.findMany({
        where: { id: { in: pending } },
        select: { parentAssetId: true },
      });
      const parents = rows
        .map((r) => r.parentAssetId)
        .filter((id): id is string => id != null && !assetIds.has(id));
      for (const id of parents) assetIds.add(id);
      pending = parents;
    }

    const ids = [...assetIds];
    const [assets, ports, cables] = await Promise.all([
      nextDb.asset.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, typeId: true, parentAssetId: true, substationId: true, floorId: true },
        orderBy: { name: 'asc' },
      }),
      nextDb.port.findMany({
        where: { assetId: { in: ids } },
        select: {
          id: true, assetId: true, group: true, index: true,
          name: true, medium: true, direction: true, positions: true,
        },
        orderBy: [{ assetId: 'asc' }, { group: 'asc' }, { index: 'asc' }],
      }),
      nextDb.cable.findMany({
        where: { id: { in: [...cableIds] } },
        select: { id: true, aPortId: true, bPortId: true, categoryId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const substationIds = [...new Set(assets.map((a) => a.substationId))];
    const [substations, floors] = await Promise.all([
      nextDb.substation.findMany({
        where: { id: { in: substationIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      nextDb.floor.findMany({
        where: { substationId: { in: substationIds } },
        select: { id: true, name: true, substationId: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    res.json({ substations, floors, assets, ports, cables, truncated });
  } catch (e) {
    next(e);
  }
});

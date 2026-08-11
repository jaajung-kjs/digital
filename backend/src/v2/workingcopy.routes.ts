import { Router } from 'express';
import { authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const workingcopyRouter = Router();
workingcopyRouter.use(authenticate);

workingcopyRouter.get('/substations/:id/workingcopy', async (req, res, next) => {
  try {
    const substation = await nextDb.substation.findUnique({ where: { id: req.params.id } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    const [floors, assets, maintenanceLogs, inspectionLogs, photos, cables] = await Promise.all([
      nextDb.floor.findMany({ where: { substationId: substation.id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      nextDb.asset.findMany({
        where: { substationId: substation.id },
        include: { ports: { orderBy: [{ group: 'asc' }, { index: 'asc' }] } },
        orderBy: { name: 'asc' },
      }),
      nextDb.maintenanceLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { occurredAt: 'desc' } }),
      nextDb.inspectionLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { inspectedAt: 'desc' } }),
      nextDb.assetPhoto.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { createdAt: 'asc' } }),
      /* **구간 케이블은 두 국에 걸친다.** `substationId` 로만 가져오면 커밋한 쪽에서만 보이고,
         상대 국에서는 제 OPGW 가 어디로 가는지 알 수 없다(대국 자리가 `—` 로 비었다).
         이 변전소의 포트를 **한쪽 끝으로 갖는** 케이블을 모두 가져온다. */
      nextDb.cable.findMany({
        where: {
          OR: [
            { aPort: { asset: { substationId: substation.id } } },
            { bPort: { asset: { substationId: substation.id } } },
          ],
        },
        include: {
          aPort: { include: { asset: { include: { substation: true, parentAsset: true } } } },
          bPort: { include: { asset: { include: { substation: true, parentAsset: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    /**
     * 구간 케이블 건너편의 **코어별 대국** — 다심 인입에만 붙는다.
     *
     * 선번장의 대국은 「OPGW 를 타고 넘어가 같은 코어 번호에 물린 **장비**」다. 그 계산은
     * 건너편 슬롯의 코어 포트와 거기 물린 점퍼를 봐야 하는데, 그 자산은 상대 국에 있어
     * 이 워킹카피에 없다. 서버는 DB 전체를 보므로 여기서 풀어 실어 준다.
     *
     * 로컬끼리 이은 구간이면 화면이 제 손으로 풀 수 있으므로 붙이지 않는다.
     */
    const trunkPortIds = cables
      .flatMap((c) => [c.aPort, c.bPort])
      .filter((p) => p.positions > 1 && p.asset.substationId !== substation.id)
      .map((p) => p.id);
    const remoteCores = new Map<
      string,
      { index: number; assemblyName: string | null; assetName: string; portName: string; portIndex: number }[]
    >();
    if (trunkPortIds.length > 0) {
      const slots = await nextDb.port.findMany({
        where: { id: { in: trunkPortIds } },
        include: {
          asset: {
            include: {
              ports: {
                where: { positions: 1 },
                include: {
                  // 대국 장비의 **설비**까지 — 끝점은 `설비 - 장비#번호` 로 부른다.
                  cablesA: { include: { bPort: { include: { asset: { include: { parentAsset: true } } } } } },
                  cablesB: { include: { aPort: { include: { asset: { include: { parentAsset: true } } } } } },
                },
              },
            },
          },
        },
      });
      for (const trunk of slots) {
        const cores = trunk.asset.ports.flatMap((core) => {
          // 그 심선에 물린 점퍼의 반대쪽 — 거기 있는 것이 대국 장비다.
          const far = core.cablesA[0]?.bPort ?? core.cablesB[0]?.aPort;
          return far
            ? [{
                index: core.index,
                assemblyName: far.asset.parentAsset?.name ?? null,
                assetName: far.asset.name,
                portName: far.name,
                portIndex: far.index,
              }]
            : [];
        });
        if (cores.length > 0) remoteCores.set(trunk.id, cores);
      }
    }

    const enrichedCables = cables.map(({ aPort, bPort, ...rest }) => ({
      ...rest,
      aRef: {
        portName: aPort.name,
        portGroup: aPort.group,
        portIndex: aPort.index,
        assetId: aPort.assetId,
        assetName: aPort.asset.name,
        assemblyName: aPort.asset.parentAsset?.name ?? null,
        substationId: aPort.asset.substationId,
        substationName: aPort.asset.substation.name,
        ...(remoteCores.has(aPort.id) ? { cores: remoteCores.get(aPort.id) } : {}),
      },
      bRef: {
        portName: bPort.name,
        portGroup: bPort.group,
        portIndex: bPort.index,
        assetId: bPort.assetId,
        assetName: bPort.asset.name,
        assemblyName: bPort.asset.parentAsset?.name ?? null,
        substationId: bPort.asset.substationId,
        substationName: bPort.asset.substation.name,
        ...(remoteCores.has(bPort.id) ? { cores: remoteCores.get(bPort.id) } : {}),
      },
    }));

    res.json({ substation, floors, assets, maintenanceLogs, inspectionLogs, photos, cables: enrichedCables });
  } catch (e) {
    next(e);
  }
});

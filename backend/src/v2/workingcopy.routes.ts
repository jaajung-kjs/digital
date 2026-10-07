/**
 * 국 하나의 워킹카피 기준 데이터.
 *
 * 변경안은 국을 넘는다 — 화면은 들른 국마다 이것을 읽어 base 에 더한다. 광선로는 두 국이 같은
 * 행을 공유하므로 양쪽 응답에 같은 id 로 실린다(화면이 id 로 합친다).
 *
 * 「대국 연결」(선번장의 상대 국 끝)은 상대 국의 연결이라 이 국의 것이 아니다 — 고칠 수 없는
 * 참조로 `farLinks`·`refEquipment`·`refLines` 에 싣는다. 그 국을 들르면 그때 제 것으로 읽힌다.
 */
import { Router } from 'express';
import type { Prisma } from '../generated/next-client/index.js';
import { authenticate } from './auth.middleware.js';
import { endRefOf } from './commit/state.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const workingcopyRouter = Router();
workingcopyRouter.use(authenticate);

type LinkWithEnds = Prisma.LinkGetPayload<{ include: { ends: true } }>;
const withRefs = ({ ends, ...l }: LinkWithEnds) => ({
  ...l,
  a: endRefOf(ends.find((e) => e.end === 'A')!),
  b: endRefOf(ends.find((e) => e.end === 'B')!),
});

workingcopyRouter.get('/substations/:id/workingcopy', async (req, res, next) => {
  try {
    const id = req.params.id;
    const substation = await nextDb.substation.findUnique({ where: { id } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    const [floors, racks, equipment, links, fiberLines, maintenanceLogs, inspectionLogs, photos] = await Promise.all([
      nextDb.floor.findMany({ where: { substationId: id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      nextDb.rack.findMany({ where: { substationId: id }, orderBy: { name: 'asc' } }),
      nextDb.equipment.findMany({ where: { substationId: id }, include: { circuits: { orderBy: { no: 'asc' } } }, orderBy: { name: 'asc' } }),
      nextDb.link.findMany({ where: { substationId: id }, include: { ends: true }, orderBy: { createdAt: 'asc' } }),
      nextDb.fiberLine.findMany({
        where: { OR: [{ aSubstationId: id }, { bSubstationId: id }] },
        include: {
          aSubstation: { select: { name: true } }, bSubstation: { select: { name: true } },
          cores: { orderBy: { no: 'asc' }, include: { measurements: { orderBy: [{ measuredOn: 'desc' }, { createdAt: 'desc' }] } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      nextDb.maintenanceLog.findMany({ where: { equipment: { substationId: id } }, orderBy: { occurredAt: 'desc' } }),
      nextDb.inspectionLog.findMany({ where: { equipment: { substationId: id } }, orderBy: { inspectedAt: 'desc' } }),
      nextDb.equipmentPhoto.findMany({ where: { equipment: { substationId: id } }, orderBy: { createdAt: 'asc' } }),
    ]);

    const lineIds = fiberLines.map((l) => l.id);
    const farLinks = lineIds.length
      ? await nextDb.link.findMany({
          where: { substationId: { not: id }, ends: { some: { coreLineId: { in: lineIds } } } },
          include: { ends: true },
        })
      : [];
    const localEq = new Set(equipment.map((e) => e.id));
    const refIds = new Set<string>();
    for (const l of farLinks) for (const e of l.ends) {
      const eqId = e.equipmentId ?? e.circuitEquipmentId;
      if (eqId && !localEq.has(eqId)) refIds.add(eqId);
    }
    for (const l of fiberLines) for (const eqId of [l.aEquipmentId, l.bEquipmentId]) if (eqId && !localEq.has(eqId)) refIds.add(eqId);
    const refEquipment = refIds.size
      ? await nextDb.equipment.findMany({ where: { id: { in: [...refIds] } }, select: { id: true, name: true, substationId: true } })
      : [];

    /* 연결 끝이 가리키는 **남의 광선로**(상대 국의 점퍼가 다른 선로 코어에 물린 것 등) — 이름만 참조로 싣는다.
       없으면 화면이 그 끝을 「광선로 코어 22」로밖에 못 부른다. */
    const ownLines = new Set(lineIds);
    const refLineIds = new Set<string>();
    for (const l of [...links, ...farLinks]) for (const e of l.ends) {
      if (e.coreLineId && !ownLines.has(e.coreLineId)) refLineIds.add(e.coreLineId);
    }
    const refLines = refLineIds.size
      ? (await nextDb.fiberLine.findMany({
          where: { id: { in: [...refLineIds] } },
          select: { id: true, name: true, aSubstation: { select: { name: true } }, bSubstation: { select: { name: true } } },
        })).map(({ aSubstation, bSubstation, ...l }) => ({ ...l, aSubstationName: aSubstation.name, bSubstationName: bSubstation.name }))
      : [];

    res.json({
      substation, floors, racks, equipment,
      links: links.map(withRefs),
      fiberLines: fiberLines.map(({ aSubstation, bSubstation, ...l }) => ({ ...l, aSubstationName: aSubstation.name, bSubstationName: bSubstation.name })),
      farLinks: farLinks.map(withRefs),
      refEquipment, refLines, maintenanceLogs, inspectionLogs, photos,
    });
  } catch (e) {
    next(e);
  }
});

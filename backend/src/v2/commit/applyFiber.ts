import { Prisma } from '../../generated/next-client/index.js';
import type { CommitPayload, LinkEndInput } from './schema.js';

type Tx = Prisma.TransactionClient;

function endData(end: 'A' | 'B', e: LinkEndInput) {
  switch (e.kind) {
    case 'equipment': return { end, equipmentId: e.equipmentId, label: e.label ?? null };
    case 'circuit': return { end, circuitEquipmentId: e.equipmentId, circuitNo: e.no };
    case 'core': return { end, coreLineId: e.lineId, coreNo: e.no, coreSide: e.side };
  }
}

/** 지우기 단계 — 연결 → 측정 → 광선로. 연결이 먼저여야 그 끝이 가리키던 것을 지울 수 있다. */
export async function applyFiberDeletes(tx: Tx, p: CommitPayload): Promise<void> {
  const linkIds = p.links?.deletes ?? [];
  if (linkIds.length > 0) await tx.link.deleteMany({ where: { id: { in: linkIds } } });
}

/** 쓰기 단계 — (광선로·코어·측정은 Task 8) → 연결. 연결이 마지막이어야 같은 커밋의 회로·코어를 가리킬 수 있다. */
export async function applyFiberWrites(tx: Tx, p: CommitPayload): Promise<void> {
  for (const u of p.links?.updates ?? []) {
    const { aLabel, bLabel, pathPoints, ...rest } = u.patch;
    await tx.link.update({
      where: { id: u.id },
      data: Object.fromEntries(Object.entries({ ...rest, pathPoints }).filter(([, v]) => v !== undefined)),
    });
    for (const [end, label] of [['A', aLabel], ['B', bLabel]] as const) {
      if (label === undefined) continue;
      /* 표기는 설비 끝에만 — 다른 끝에 적으면 CHECK 가 거부한다(→ 422). */
      await tx.linkEnd.update({ where: { linkId_end: { linkId: u.id, end } }, data: { label } });
    }
  }
  for (const c of p.links?.creates ?? []) {
    const { a, b, pathPoints, ...rest } = c;
    await tx.link.create({
      data: { ...rest, pathPoints: pathPoints ?? [], ends: { create: [endData('A', a), endData('B', b)] } },
    });
  }
}

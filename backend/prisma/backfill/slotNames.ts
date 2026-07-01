import { PrismaClient } from '@prisma/client';

export interface SlotRow {
  id: string;
  ofdId: string;
  ownSub: string | null;
  twinId: string | null;
  twinSub: string | null;
  twinSubName: string | null;
  cores: number;
  slotIndex: number | null;
}

// FE composeSlotName 과 동일 포맷(패키지 경계로 인라인 복제).
function composeSlotName(
  local: string | null,
  remote: string | null,
  n: number,
  cores: number,
): string {
  const base = [local, remote].filter(Boolean).join(' - ');
  if (!base) return '';
  const route = n > 0 ? ` -${n}` : '';
  return cores > 0 ? `${base}${route} #${cores}` : `${base}${route}`;
}

/** 각 슬롯의 -N = 같은 (ofdId, twinSub) 그룹 내 slotIndex(없으면 뒤)→id 순 위치. 순수. */
export function planSlotNames(rows: SlotRow[]): { id: string; name: string }[] {
  const groups = new Map<string, SlotRow[]>();
  for (const r of rows) {
    const key = `${r.ofdId}|${r.twinSub ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(r);
  }
  const out: { id: string; name: string }[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const ai = a.slotIndex ?? Number.MAX_SAFE_INTEGER;
      const bi = b.slotIndex ?? Number.MAX_SAFE_INTEGER;
      return ai - bi || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    list.forEach((r, i) => {
      out.push({ id: r.id, name: composeSlotName(r.ownSub, r.twinSubName, i + 1, r.cores) });
    });
  }
  return out;
}

/** DB 러너 — 경로슬롯 로드 → planSlotNames → name update. 고아(짝 없는 슬롯/반쪽 OPGW)는 리포트만. */
export async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // IN-IN OPGW 케이블로부터 슬롯 쌍 수집
    const opgwFull = await prisma.cable.findMany({
      where: { sourceRole: 'IN', targetRole: 'IN' },
      select: { sourceAssetId: true, targetAssetId: true, specParams: true },
    });

    // slotId → twinId 맵
    const twinOf = new Map<string, string>();
    const coresOf = new Map<string, number>();
    for (const o of opgwFull) {
      if (o.sourceAssetId && o.targetAssetId) {
        twinOf.set(o.sourceAssetId, o.targetAssetId);
        twinOf.set(o.targetAssetId, o.sourceAssetId);
        const c = Number((o.specParams as Record<string, unknown> | null)?.cores ?? 0);
        coresOf.set(o.sourceAssetId, c);
        coresOf.set(o.targetAssetId, c);
      }
    }

    const slotIds = [...twinOf.keys()];
    if (slotIds.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[slotNames] backfilled 0 slots; orphans(짝없음) reported: 0');
      return;
    }

    const assets = await prisma.asset.findMany({
      where: { id: { in: slotIds } },
      select: {
        id: true,
        parentAssetId: true,
        substationId: true,
        slotIndex: true,
        substation: { select: { name: true } },
      },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));

    const rows: SlotRow[] = [];
    let orphans = 0;
    for (const id of slotIds) {
      const a = byId.get(id);
      const twinId = twinOf.get(id) ?? null;
      const twin = twinId ? byId.get(twinId) : null;
      if (!a || !twin) {
        orphans++;
        continue; // 짝 없음 → 리포트만
      }
      rows.push({
        id,
        ofdId: a.parentAssetId ?? id,
        ownSub: a.substation?.name ?? null,
        twinId,
        twinSub: twin.substationId,
        twinSubName: twin.substation?.name ?? null,
        cores: coresOf.get(id) ?? 0,
        slotIndex: a.slotIndex ?? null,
      });
    }

    const plan = planSlotNames(rows);
    for (const p of plan) {
      await prisma.asset.update({ where: { id: p.id }, data: { name: p.name } });
    }
    // eslint-disable-next-line no-console
    console.log(
      `[slotNames] backfilled ${plan.length} slots; orphans(짝없음) reported: ${orphans}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 직접 실행: npx tsx prisma/backfill/slotNames.ts
if (process.argv[1] && process.argv[1].endsWith('slotNames.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

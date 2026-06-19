import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const HERE = dirname(fileURLToPath(import.meta.url));

interface SubRow { key: string; name: string; isExternal: boolean; }
interface AssetRow {
  key: string; subKey: string; typeCode: string; name: string;
  parentKey: string | null;
  posX?: number | null; posY?: number | null; w?: number | null; h?: number | null; slotIndex?: number | null;
}
interface CableRow {
  key: string; kind: 'OPGW' | 'CORE'; sourceKey: string; targetKey: string;
  sourceRole: string | null; targetRole: string | null; number: number | null;
  categoryCode: string; specParams: Record<string, unknown>;
}

/** 결정적 UUID — 9a0001TT-0000-4000-b000-<sha1("TT:key")[:12]>. floor plan uuid 검증 통과(version4·variant b). */
export function juuid(typeNum: number, key: string): string {
  const tt = String(typeNum).padStart(2, '0');
  const h = createHash('sha1').update(`${tt}:${key}`).digest('hex').slice(0, 12);
  return `9a0001${tt}-0000-4000-b000-${h}`;
}
const T = { sub: 1, floor: 2, asset: 3, cable: 4 } as const;

/** 부모(parentKey=null) 먼저 — 2레벨(OFD→slot) 정렬이면 충분. */
export function orderAssets<A extends { parentKey: string | null }>(rows: A[]): A[] {
  return [...rows].sort((a, b) => (a.parentKey ? 1 : 0) - (b.parentKey ? 1 : 0));
}

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(HERE, 'data', 'jikhal', name), 'utf8')) as T;
}

/**
 * 직할 통신자산·선번장 적재 — 검수 JSON(data/jikhal/) 을 결정적 UUID 로 생성.
 * 첫-배포 가드 안에서 호출(seed.ts). external 국소는 floorId=null.
 */
export async function seedJikhalAssets(prisma: PrismaClient, adminId: string, branchId: string): Promise<void> {
  const subs = load<SubRow[]>('substations.json');
  const assets = load<AssetRow[]>('assets.json');
  const cables = load<CableRow[]>('fiberCables.json');

  const typeId = new Map((await prisma.assetType.findMany({ select: { id: true, code: true } })).map((t) => [t.code, t.id]));
  const catId = new Map((await prisma.cableCategory.findMany({ select: { id: true, code: true } })).map((c) => [c.code, c.id]));
  const isExternal = new Map(subs.map((s) => [s.key, s.isExternal]));
  const subOf = new Map(assets.map((a) => [a.key, a.subKey]));

  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    await prisma.substation.create({
      data: { id: juuid(T.sub, s.key), branchId, name: s.name, sortOrder: i, createdById: adminId, updatedById: adminId },
    });
    if (!s.isExternal) {
      await prisma.floor.create({
        data: { id: juuid(T.floor, s.key), substationId: juuid(T.sub, s.key), name: '통신실', floorNumber: '1F', sortOrder: 0, createdById: adminId, updatedById: adminId },
      });
    }
  }

  for (const a of orderAssets(assets)) {
    const tId = typeId.get(a.typeCode);
    if (!tId) throw new Error(`AssetType 없음: ${a.typeCode} (${a.key})`);
    await prisma.asset.create({
      data: {
        id: juuid(T.asset, a.key), substationId: juuid(T.sub, a.subKey), assetTypeId: tId,
        parentAssetId: a.parentKey ? juuid(T.asset, a.parentKey) : null,
        floorId: isExternal.get(a.subKey) ? null : juuid(T.floor, a.subKey),
        name: a.name, sortOrder: 0,
        positionX: a.posX ?? null, positionY: a.posY ?? null,
        width2d: a.w ?? null, height2d: a.h ?? null, slotIndex: a.slotIndex ?? null,
      },
    });
  }

  for (const c of cables) {
    await prisma.cable.create({
      data: {
        id: juuid(T.cable, c.key), sourceAssetId: juuid(T.asset, c.sourceKey), targetAssetId: juuid(T.asset, c.targetKey),
        cableType: 'FIBER', categoryId: catId.get(c.categoryCode) ?? null,
        sourceRole: c.sourceRole, targetRole: c.targetRole, number: c.number,
        specParams: c.specParams,
        substationId: c.kind === 'OPGW' ? null : juuid(T.sub, subOf.get(c.sourceKey)!),
      },
    });
  }

  console.log(`  ✅ 직할: 국소 ${subs.length} · 자산 ${assets.length} · 케이블 ${cables.length}`);
}

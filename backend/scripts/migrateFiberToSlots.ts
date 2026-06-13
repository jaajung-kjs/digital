/**
 * 대통일 P4 — 광(FiberPath/Cable/FiberCore) → 통일 슬롯 모델 persist 스크립트.
 *
 * 특성:
 *  - ADDITIVE: 기존 광 데이터(fiber_paths / fiber_cores / fiber_port_number 케이블)는 손대지 않는다.
 *    OFD-SLOT 자산 + CBL-OPGW(IN-IN) 케이블 + OUT 케이블만 *새로* 생성한다.
 *  - IDEMPOTENT: 각 FiberPath별로 attributes.__fiberPathId 가 이미 있으면 해당 path 는 skip.
 *    --force 로 전체 revert 후 재실행.
 *  - REVERTIBLE: `--revert` 로 마커(__migration='fiberToSlots') 가 붙은 케이블→자산 순으로 삭제.
 *  - TRANSACTIONAL: persist/revert 모두 prisma.$transaction 으로 감싸 partial state 방지.
 *
 * 실행: `cd backend && npx tsx scripts/migrateFiberToSlots.ts [--force] [--revert]`
 */
import type { Prisma } from '@prisma/client';
import prisma from '../src/config/prisma.js';
import {
  planFiberMigration,
  type FiberPathRow,
  type FiberCableRow,
  type FiberCoreRow,
  type OfdInfo,
} from '../src/migration/fiberToSlots.js';

const SLOT_TYPE_CODE = 'OFD-SLOT';
const OPGW_CAT_CODE = 'CBL-OPGW';
const MIGRATION_TAG = 'fiberToSlots';

async function getSlotTypeId(): Promise<string> {
  const slotType = await prisma.assetType.findUnique({ where: { code: SLOT_TYPE_CODE } });
  if (!slotType) {
    throw new Error(`assetType code='${SLOT_TYPE_CODE}' 없음 — P1 시드(seedAssetTypes)가 먼저 실행돼야 합니다.`);
  }
  return slotType.id;
}

/** Fix C1/Fix 4: 마커가 붙은 케이블→자산 순으로 정확하게 삭제. assetType 으로는 절대 삭제하지 않는다. */
async function revert(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Cables BEFORE assets (FK order).
    const delCables = await tx.cable.deleteMany({
      where: {
        specParams: {
          path: ['__migration'],
          equals: MIGRATION_TAG,
        },
      },
    });
    const delAssets = await tx.asset.deleteMany({
      where: {
        attributes: {
          path: ['__migration'],
          equals: MIGRATION_TAG,
        },
      },
    });
    console.log(`[revert] 케이블 삭제 ${delCables.count}건, OFD-SLOT 자산 삭제 ${delAssets.count}건.`);
  });
}

async function migrate(force: boolean): Promise<void> {
  // Fix M3: reuse single helper, avoid duplicate lookup.
  const slotTypeId = await getSlotTypeId();

  const opgwCat = await prisma.cableCategory.findUnique({ where: { code: OPGW_CAT_CODE } });
  if (!opgwCat) {
    throw new Error(`cableCategory code='${OPGW_CAT_CODE}' 없음 — P1 시드(seedCableCategories)가 먼저 실행돼야 합니다.`);
  }

  // Fix I1/Fix 3: --force = revert-then-recreate (not blind-append).
  if (force) {
    console.log('[migrate] --force: 기존 마이그레이션 결과 먼저 제거 후 재생성합니다.');
    await revert();
  }

  // ---- 실데이터 로드 ----
  const fiberPathsRaw = await prisma.fiberPath.findMany();
  const fiberPaths: FiberPathRow[] = fiberPathsRaw.map((p) => ({
    id: p.id,
    ofdAId: p.ofdAId,
    ofdBId: p.ofdBId,
    portCount: p.portCount,
  }));

  if (fiberPaths.length === 0) {
    console.log('[migrate] FiberPath 데이터 없음 — 할 일 없음.');
    return;
  }

  const fiberCablesRaw = await prisma.cable.findMany({
    where: { cableType: 'FIBER', fiberPathId: { not: null } },
  });
  const fiberCables: FiberCableRow[] = fiberCablesRaw.map((c) => ({
    id: c.id,
    sourceAssetId: c.sourceAssetId,
    targetAssetId: c.targetAssetId,
    fiberPathId: c.fiberPathId,
    fiberPortNumber: c.fiberPortNumber,
  }));

  const fiberCoresRaw = await prisma.fiberCore.findMany();
  const fiberCores: FiberCoreRow[] = fiberCoresRaw.map((fc) => ({
    fiberPathId: fc.fiberPathId,
    coreNumber: fc.coreNumber,
    purpose: fc.purpose,
    circuitText: fc.circuitText,
    spliceType: fc.spliceType,
    usageOverride: fc.usageOverride,
  }));

  const ofdAssets = await prisma.asset.findMany({
    where: { assetType: { code: 'OFD' } },
    select: { id: true, substationId: true, name: true },
  });
  const ofdInfo = new Map<string, OfdInfo>();
  for (const o of ofdAssets) ofdInfo.set(o.id, { substationId: o.substationId, name: o.name });

  // Fix I2: per-FiberPath idempotency — fetch existing migrated __fiberPathId values once.
  const existingMigratedRaw = await prisma.asset.findMany({
    where: {
      attributes: {
        path: ['__migration'],
        equals: MIGRATION_TAG,
      },
    },
    select: { attributes: true },
  });
  const existingFiberPathIds = new Set<string>(
    existingMigratedRaw
      .map((a) => {
        const attrs = a.attributes as Record<string, unknown> | null;
        return attrs?.__fiberPathId as string | undefined;
      })
      .filter((id): id is string => typeof id === 'string'),
  );

  // Filter paths to only those not yet migrated.
  const pathsToMigrate = fiberPaths.filter((fp) => !existingFiberPathIds.has(fp.id));
  const skippedCount = fiberPaths.length - pathsToMigrate.length;

  if (pathsToMigrate.length === 0) {
    console.log(`이미 마이그레이션됨 (경로 ${skippedCount}개 skip) — skip. --force 로 재실행.`);
    return;
  }

  // ---- 순수 매핑 (skip 된 paths 제외) ----
  const plan = planFiberMigration(pathsToMigrate, fiberCables, fiberCores, ofdInfo);

  // ---- Fix C2: persist 전체를 단일 트랜잭션으로 ----
  const tempKeyToId = new Map<string, string>();

  await prisma.$transaction(async (tx) => {
    // Create OFD-SLOT assets with marker in attributes.
    for (const s of plan.slots) {
      const created = await tx.asset.create({
        data: {
          substationId: s.substationId,
          assetTypeId: slotTypeId,
          name: s.name,
          parentAssetId: s.parentAssetId,
          attributes: s.attributes as Prisma.InputJsonValue,
        },
      });
      tempKeyToId.set(s.tempKey, created.id);
    }

    let opgwCount = 0;
    for (const o of plan.opgwCables) {
      const src = tempKeyToId.get(o.fromSlot);
      const dst = tempKeyToId.get(o.toSlot);
      if (!src || !dst) continue;
      // Fix M2: substationId = A-end OFD's substationId.
      await tx.cable.create({
        data: {
          sourceAssetId: src,
          targetAssetId: dst,
          cableType: 'FIBER',
          categoryId: opgwCat.id,
          sourceRole: 'IN',
          targetRole: 'IN',
          substationId: o.substationId,
          specParams: o.specParams as Prisma.InputJsonValue,
        },
      });
      opgwCount++;
    }

    let outCount = 0;
    for (const out of plan.outCables) {
      const src = tempKeyToId.get(out.slotKey);
      if (!src) continue;
      await tx.cable.create({
        data: {
          sourceAssetId: src,
          targetAssetId: out.equipmentAssetId,
          cableType: 'FIBER',
          sourceRole: 'OUT',
          number: out.number ?? undefined,
          specParams: out.specParams as Prisma.InputJsonValue,
        },
      });
      outCount++;
    }

    console.log(
      `생성 완료 — 슬롯: ${tempKeyToId.size} / OPGW: ${opgwCount} / OUT: ${outCount}` +
        (skippedCount > 0 ? ` (skip ${skippedCount} 경로)` : ''),
    );
  });
}

async function main(): Promise<void> {
  const isRevert = process.argv.includes('--revert');
  const force = process.argv.includes('--force');
  if (isRevert) {
    await revert();
  } else {
    await migrate(force);
  }
}

main()
  .catch((err) => {
    console.error('[migrateFiberToSlots] 실패:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

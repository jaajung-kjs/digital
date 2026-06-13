/**
 * 대통일 P4 — 광(FiberPath/Cable/FiberCore) → 통일 슬롯 모델 persist 스크립트.
 *
 * 특성:
 *  - ADDITIVE: 기존 광 데이터(fiber_paths / fiber_cores / fiber_port_number 케이블)는 손대지 않는다.
 *    OFD-SLOT 자산 + CBL-OPGW(IN-IN) 케이블 + OUT 케이블만 *새로* 생성한다.
 *  - IDEMPOTENT: OFD-SLOT 자산이 이미 있으면 skip(--force 로 재실행). 중복 생성 방지.
 *  - REVERTIBLE: `--revert` 로 생성물(케이블→자산 순)을 삭제.
 *
 * 실행: `cd backend && npx tsx scripts/migrateFiberToSlots.ts [--force] [--revert]`
 */
import type { Prisma } from '@prisma/client';
import prisma from '../src/config/prisma.js';
import { planFiberMigration, type FiberPathRow, type FiberCableRow, type FiberCoreRow, type OfdInfo } from '../src/migration/fiberToSlots.js';

const SLOT_TYPE_CODE = 'OFD-SLOT';
const OPGW_CAT_CODE = 'CBL-OPGW';

async function getSlotTypeId(): Promise<string> {
  const slotType = await prisma.assetType.findUnique({ where: { code: SLOT_TYPE_CODE } });
  if (!slotType) {
    throw new Error(`assetType code='${SLOT_TYPE_CODE}' 없음 — P1 시드(seedAssetTypes)가 먼저 실행돼야 합니다.`);
  }
  return slotType.id;
}

async function revert(): Promise<void> {
  const slotTypeId = await getSlotTypeId();
  const slotAssets = await prisma.asset.findMany({ where: { assetTypeId: slotTypeId }, select: { id: true } });
  const slotIds = slotAssets.map((a) => a.id);
  if (slotIds.length === 0) {
    console.log('[revert] OFD-SLOT 자산 없음 — 되돌릴 것 없음.');
    return;
  }
  // 슬롯에 붙은 케이블 먼저 삭제(OPGW IN-IN + OUT 모두).
  const delCables = await prisma.cable.deleteMany({
    where: { OR: [{ sourceAssetId: { in: slotIds } }, { targetAssetId: { in: slotIds } }] },
  });
  const delAssets = await prisma.asset.deleteMany({ where: { id: { in: slotIds } } });
  console.log(`[revert] 케이블 삭제 ${delCables.count}건, OFD-SLOT 자산 삭제 ${delAssets.count}건.`);
}

async function migrate(force: boolean): Promise<void> {
  const slotType = await prisma.assetType.findUnique({ where: { code: SLOT_TYPE_CODE } });
  const opgwCat = await prisma.cableCategory.findUnique({ where: { code: OPGW_CAT_CODE } });
  if (!slotType) {
    throw new Error(`assetType code='${SLOT_TYPE_CODE}' 없음 — P1 시드(seedAssetTypes)가 먼저 실행돼야 합니다.`);
  }
  if (!opgwCat) {
    throw new Error(`cableCategory code='${OPGW_CAT_CODE}' 없음 — P1 시드(seedCableCategories)가 먼저 실행돼야 합니다.`);
  }

  // IDEMPOTENCY: 이미 OFD-SLOT 자산이 있으면 skip.
  const existing = await prisma.asset.count({ where: { assetTypeId: slotType.id } });
  if (existing > 0 && !force) {
    console.log(`이미 마이그레이션됨 (OFD-SLOT ${existing}개) — skip. --force 로 재실행.`);
    return;
  }

  // ---- 실데이터 로드 ----
  const fiberPathsRaw = await prisma.fiberPath.findMany();
  const fiberPaths: FiberPathRow[] = fiberPathsRaw.map((p) => ({
    id: p.id,
    ofdAId: p.ofdAId,
    ofdBId: p.ofdBId,
    portCount: p.portCount,
  }));

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

  // ---- 순수 매핑 ----
  const plan = planFiberMigration(fiberPaths, fiberCables, fiberCores, ofdInfo);

  // ---- persist ----
  const tempKeyToId = new Map<string, string>();

  for (const s of plan.slots) {
    const created = await prisma.asset.create({
      data: {
        substationId: s.substationId,
        assetTypeId: slotType.id,
        name: s.name,
        parentAssetId: s.parentAssetId,
      },
    });
    tempKeyToId.set(s.tempKey, created.id);
  }

  let opgwCount = 0;
  for (const o of plan.opgwCables) {
    const src = tempKeyToId.get(o.fromSlot);
    const dst = tempKeyToId.get(o.toSlot);
    if (!src || !dst) continue;
    await prisma.cable.create({
      data: {
        sourceAssetId: src,
        targetAssetId: dst,
        cableType: 'FIBER',
        categoryId: opgwCat.id,
        sourceRole: 'IN',
        targetRole: 'IN',
      },
    });
    opgwCount++;
  }

  let outCount = 0;
  for (const out of plan.outCables) {
    const src = tempKeyToId.get(out.slotKey);
    if (!src) continue;
    await prisma.cable.create({
      data: {
        sourceAssetId: src,
        targetAssetId: out.equipmentAssetId,
        cableType: 'FIBER',
        sourceRole: 'OUT',
        number: out.number ?? undefined,
        specParams: (out.specParams ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    outCount++;
  }

  console.log(`생성 완료 — 슬롯: ${tempKeyToId.size} / OPGW: ${opgwCount} / OUT: ${outCount}`);
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

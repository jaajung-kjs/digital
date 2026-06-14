/**
 * 대통일 P6 — 클린 커오버: 옛 광(FiberPath / 옛 fiber 케이블) 제거.
 *
 * P4 가 additive 로 생성한 OUT 케이블 specParams 에 심은 __fromCableId 마커로
 * 옛 fiber 케이블을 정밀 매칭해 삭제하고, 모든 FiberPath 를 삭제한다.
 *
 * 보존: OFD-SLOT 자산, OPGW 케이블, OUT 케이블(신모델), FiberCore(P7).
 * 비가역(삭제) → --dry-run 으로 카운트 먼저 확인. 멱등(재실행 시 0건).
 *
 * 실행: `cd backend && npx tsx scripts/cutoverFiber.ts [--dry-run]`
 */
import prisma from '../src/config/prisma.js';
import { planFiberCutover } from '../src/migration/fiberCutover.js';

const dryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  // 마이그레이션 마커가 붙은 케이블(OPGW + OUT) 로드.
  // P4 스크립트와 동일한 JSON path 필터 구문 사용.
  const migratedCables = await prisma.cable.findMany({
    where: {
      specParams: {
        path: ['__migration'],
        equals: 'fiberToSlots',
      },
    },
    select: { id: true, specParams: true },
  });

  const fiberPaths = await prisma.fiberPath.findMany({ select: { id: true } });

  const plan = planFiberCutover(migratedCables, fiberPaths);

  // 안전 교차확인: oldCableIds 가 실제로 fiber_path_id IS NOT NULL 인지(옛 fiber 케이블).
  // 신모델 OUT/OPGW 은 fiber_path_id = NULL 이므로 이 집합에 들어오면 안 된다.
  const crossCheck = await prisma.cable.findMany({
    where: { id: { in: plan.oldCableIds } },
    select: { id: true, fiberPathId: true },
  });
  const withoutFiberPathId = crossCheck.filter((c) => c.fiberPathId == null);
  if (withoutFiberPathId.length > 0) {
    console.error(
      `[ERROR] oldCableIds 중 fiberPathId 가 NULL 인 케이블 ${withoutFiberPathId.length}개 발견 — 신모델 케이블이 섞였을 가능성. 삭제 중단.`,
    );
    console.error('문제 케이블 id:', withoutFiberPathId.map((c) => c.id));
    process.exitCode = 1;
    return;
  }

  const oldFiberWithPath = crossCheck.filter((c) => c.fiberPathId != null);

  console.log(
    `커오버 계획 — 옛 광케이블(fiberPathId 있음) ${oldFiberWithPath.length}/${plan.oldCableIds.length} · FiberPath ${plan.fiberPathIds.length}`,
  );

  if (dryRun) {
    console.log('[dry-run] 삭제 안 함 — 위 카운트 확인 후 --dry-run 없이 재실행.');
    return;
  }

  if (plan.oldCableIds.length === 0 && plan.fiberPathIds.length === 0) {
    console.log('[멱등] 삭제 대상 없음 — 이미 커오버 완료.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const delCables = await tx.cable.deleteMany({
      where: { id: { in: plan.oldCableIds } },
    });
    const delPaths = await tx.fiberPath.deleteMany({
      where: { id: { in: plan.fiberPathIds } },
    });
    console.log(
      `[커오버 완료] 옛 광케이블 삭제 ${delCables.count}건 · FiberPath 삭제 ${delPaths.count}건.`,
    );
  });
}

main()
  .catch((err) => {
    console.error('[cutoverFiber] 실패:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

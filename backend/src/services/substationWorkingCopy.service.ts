import prisma from '../config/prisma.js';
import { cableService } from './cable.service.js';

/**
 * SSOT-2b — 변전소 working-copy 벌크 로드.
 * 통합 working-copy 스토어가 단일 요청으로 받는 전 컬렉션:
 *   - assets: 배치 컬럼(positionX/Y, width2d/height2d, rotation, totalU, floorId,
 *     parentAssetId, slotIndex/slotSpan) + updatedAt 포함. bare findMany 가 모든
 *     스칼라 컬럼을 캐리하므로 select 로 과도하게 제한하지 않는다. 프론트 매퍼용
 *     assetType 만 include.
 *   - cables: cable.service.getBySubstationId 재사용 — connections 뷰와 동일한 DTO.
 *   - fiberPaths: OFD 설비(ofdA/ofdB.substationId) 조인.
 *
 * 단계4c — 분전반 회로는 FEEDER/BRANCH Asset(assets 컬렉션) 으로 통합됐다.
 * 별도 distributionCircuits 컬렉션은 제거.
 */
export async function getWorkingCopy(substationId: string) {
  const [assets, cables, fiberPaths] = await Promise.all([
    prisma.asset.findMany({
      where: { substationId },
      include: { assetType: { select: { id: true, code: true, name: true, group: true, displayColor: true, fieldTemplate: true, placementKind: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    cableService.getBySubstationId(substationId),
    prisma.fiberPath.findMany({
      where: { OR: [{ ofdA: { substationId } }, { ofdB: { substationId } }] },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return { assets, cables, fiberPaths };
}

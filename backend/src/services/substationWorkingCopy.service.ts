import prisma from '../config/prisma.js';
import { cableService } from './cable.service.js';
import { getAssetRecordModels } from './assetRecordSchema.service.js';

/**
 * SSOT-2b — 변전소 working-copy 벌크 로드.
 * 통합 working-copy 스토어가 단일 요청으로 받는 전 컬렉션(= 변전소의 모든 데이터가 한 곳):
 *   - assets: 배치 컬럼(positionX/Y, width2d/height2d, rotation, totalU, floorId,
 *     parentAssetId, slotIndex/slotSpan) + updatedAt 포함. bare findMany 가 모든
 *     스칼라 컬럼을 캐리하므로 select 로 과도하게 제한하지 않는다. 프론트 매퍼용
 *     assetType 만 include.
 *   - cables: cable.service.getBySubstationId 재사용 — connections 뷰와 동일한 DTO.
 *   - inspections/logs/photos: 자산 하위레코드도 변전소 단위로 함께 반환한다.
 *     이전엔 이것만 빠져서 프론트가 자산별 RQ 로 따로 가져와 staging overlay 와
 *     머지하는 'media 특수처리'가 생겼다. 여기서 함께 주면 프론트는 saved+overlay
 *     단일 투영으로만 조회하면 된다(현황 '마지막 점검일'도 동일 경로로 파생).
 *
 * 단계4c — 분전반 회로는 FEEDER/BRANCH Asset(assets 컬렉션) 으로 통합됐다.
 * 별도 distributionCircuits 컬렉션은 제거.
 */
export async function getWorkingCopy(substationId: string) {
  const [assets, cables] = await Promise.all([
    prisma.asset.findMany({
      where: { substationId },
      include: { assetType: { select: { id: true, code: true, name: true, displayColor: true, fieldTemplate: true, role: true, categoryId: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    cableService.getBySubstationId(substationId),
  ]);

  // 자산 하위레코드(점검/고장이력/사진 + 미래 무엇이든)는 자산의 *속성*이다 — 형제 컬렉션이
  // 아니라 각 자산 안에 records[] 로 중첩한다. 어떤 테이블이 자산 기록인지·그 컬럼이 무엇인지는
  // DB 스키마(assetRecordSchema)에서 자동 도출 — 여기엔 종류별 하드코딩이 없다(완전 제네릭).
  const assetIds = assets.map((a) => a.id);
  const recordModels = getAssetRecordModels();
  const perModel = await Promise.all(
    recordModels.map(async (m) => {
      const rows: Record<string, unknown>[] = await (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<Record<string, unknown>[]> }>)[m.delegate].findMany({
        where: { assetId: { in: assetIds } },
        ...(m.hasAudit ? { include: { createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } } } : {}),
      });
      return rows.map((r) => {
        const { createdBy, updatedBy, ...rest } = r as Record<string, unknown> & {
          createdBy?: { name?: string }; updatedBy?: { name?: string };
        };
        return {
          ...rest,
          recordType: m.recordType,
          ...(m.hasAudit ? { createdByName: createdBy?.name ?? null, updatedByName: updatedBy?.name ?? null } : {}),
        } as { id: string; assetId: string; recordType: string; [k: string]: unknown };
      });
    }),
  );

  const recordsByAsset = new Map<string, Record<string, unknown>[]>();
  for (const r of perModel.flat()) {
    const list = recordsByAsset.get(r.assetId);
    if (list) list.push(r);
    else recordsByAsset.set(r.assetId, [r]);
  }
  const assetsWithRecords = assets.map((a) => ({ ...a, records: recordsByAsset.get(a.id) ?? [] }));

  return { assets: assetsWithRecords, cables };
}

import { Prisma } from '@prisma/client';
import { ValidationError, ConflictError } from '../utils/errors.js';
import { placementKindToKind, type PlacementKind } from './assetPlanMapper.js';
import { assertSlotValid, assertNoSlotCollision } from './rackModule.service.js';
import { assertOfdFiberPath } from './cable.service.js';

/**
 * 도면/통합 커밋의 공유 검증 predicate 모음.
 *
 * `commitSubstation`(substationCommit.service) 이 일관된 규칙으로 검증하도록,
 * 인라인이던 검증을 tx-taking 순수 헬퍼로 추출한다. (구 bulkUpdatePlan 과
 * 공유하던 코드.) 모든 함수는 트랜잭션 클라이언트를 받아 실패 시 throw(롤백).
 *
 * 주의: id 해소(tempId→real id)는 호출부가 끝낸 뒤 real id 만 넘겨야 한다.
 */

type Tx = Prisma.TransactionClient;

/**
 * 케이블 직결 endpoint 의 kind 검증 — source/target 양쪽 동일 규칙.
 * RACK 은 모듈에, DISTRIBUTION 은 회로에 연결해야 하므로 설비 직결 거부.
 * (구 floor.service.ts assertDirectEndpointKind 와 동일 동작.)
 */
export function assertDirectEndpointKind(
  kind: PlacementKind | null,
  eqId: string,
  side: 'source' | 'target',
): void {
  const label = side === 'source' ? 'source' : 'target';
  if (kind === null) {
    throw new ValidationError(`${label} 설비를 찾을 수 없습니다 (id=${eqId}).`);
  }
  if (kind === 'RACK') {
    throw new ValidationError('RACK 설비는 케이블 endpoint 가 될 수 없습니다 — 랙 안 모듈에 연결하세요.');
  }
  if (kind === 'DISTRIBUTION') {
    throw new ValidationError('분전반은 케이블 endpoint 가 될 수 없습니다 — 회로에 연결하세요.');
  }
}

/** Asset id → placementKind 변환 kind 를 트랜잭션 내 캐시로 조회. */
export function makeEquipmentKindResolver(tx: Tx) {
  const cache = new Map<string, PlacementKind | null>();
  return async (eqId: string): Promise<PlacementKind | null> => {
    if (cache.has(eqId)) return cache.get(eqId)!;
    const e = await tx.asset.findUnique({
      where: { id: eqId },
      include: { assetType: true },
    });
    const kind = e ? placementKindToKind(e.assetType.placementKind) : null;
    cache.set(eqId, kind);
    return kind;
  };
}

/** 케이블 한 건의 (해소 완료된) endpoint 들을 검증한다. */
export interface ResolvedCableEndpoints {
  srcEqId: string | null;
  srcModId: string | null;
  srcCircuitId: string | null;
  tgtEqId: string | null;
  tgtModId: string | null;
  tgtCircuitId: string | null;
  fiberPathId: string | null;
  fiberPortNumber: number | null | undefined;
}

/**
 * 케이블 endpoint 유효성 검사 (real id 로 해소된 뒤 호출).
 *  - 각 side 는 equipment | module | circuit 중 정확히 하나
 *  - RACK/DISTRIBUTION 설비 직결 금지 + 존재 확인
 *  - OFD endpoint 면 fiberPathId + fiberPortNumber 필수
 */
export async function assertCableEndpointsValid(
  tx: Tx,
  cables: ResolvedCableEndpoints[],
): Promise<void> {
  const resolveKind = makeEquipmentKindResolver(tx);
  for (const c of cables) {
    const srcCount = [c.srcEqId, c.srcModId, c.srcCircuitId].filter(Boolean).length;
    const tgtCount = [c.tgtEqId, c.tgtModId, c.tgtCircuitId].filter(Boolean).length;
    if (srcCount !== 1) {
      throw new ValidationError('source endpoint 는 equipmentId / moduleId / circuitId 중 정확히 하나여야 합니다.');
    }
    if (tgtCount !== 1) {
      throw new ValidationError('target endpoint 는 equipmentId / moduleId / circuitId 중 정확히 하나여야 합니다.');
    }

    const srcKind = c.srcEqId ? await resolveKind(c.srcEqId) : null;
    const tgtKind = c.tgtEqId ? await resolveKind(c.tgtEqId) : null;
    if (c.srcEqId) assertDirectEndpointKind(srcKind, c.srcEqId, 'source');
    if (c.tgtEqId) assertDirectEndpointKind(tgtKind, c.tgtEqId, 'target');

    assertOfdFiberPath(srcKind, tgtKind, c.fiberPathId, c.fiberPortNumber);
  }
}

/**
 * 변전소당 OFD 1개 — 새 OFD 가 추가될 때 기존 OFD 가 있으면 거부.
 * (equipmentService.validateOfdUniqueness 의 substation 단위 검사와 동일.)
 *
 * @param substationId  검사 대상 변전소
 * @param hasNewOfd     이번 커밋에서 새 OFD 를 만드는지 여부
 * @param existingOfdIds 같은 커밋에서 update/유지되는 OFD id (자기 자신 제외용)
 */
export async function assertOfdUnique(
  tx: Tx,
  substationId: string,
  hasNewOfd: boolean,
): Promise<void> {
  if (!hasNewOfd) return;
  const sub = await tx.substation.findUnique({
    where: { id: substationId },
    select: { name: true },
  });
  const existingOfd = await tx.asset.findFirst({
    where: {
      parentAssetId: null,
      assetType: { placementKind: 'OFD' },
      floor: { substationId },
    },
    select: { id: true, name: true },
  });
  if (existingOfd) {
    throw new ConflictError(
      `${sub?.name ?? ''} 변전소에 이미 OFD가 존재합니다. (${existingOfd.name})`,
    );
  }
}

/** 랙 모듈 부모/카테고리 검증 결과. */
export interface RackParentInfo {
  rackId: string;
  categoryId: string;
}

/**
 * 랙 모듈의 부모 설비가 RACK 이고 카테고리가 유효한 모듈 타입인지 확인.
 * (구 bulkUpdatePlan 의 부모/카테고리 검사와 동일.) slot 검사는 호출부가
 * in-memory live 슬롯과 함께 assertSlotValid/assertNoSlotCollision 으로 수행.
 */
export async function assertRackParentValid(
  tx: Tx,
  resolvedRackId: string,
  categoryId: string,
): Promise<void> {
  const rack = await tx.asset.findUnique({
    where: { id: resolvedRackId },
    include: { assetType: true },
  });
  if (!rack) {
    throw new ValidationError(
      `랙 모듈의 부모 설비를 찾을 수 없습니다 (rackEquipmentId=${resolvedRackId}).`,
    );
  }
  if (rack.assetType.placementKind !== 'RACK') {
    throw new ValidationError(
      `랙 모듈의 부모가 RACK 이 아닙니다 (placementKind=${rack.assetType.placementKind}).`,
    );
  }
  const category = await tx.assetType.findUnique({
    where: { id: categoryId },
    select: { id: true, placementKind: true },
  });
  if (!category || category.placementKind !== null) {
    throw new ValidationError(
      `유효한 모듈 카테고리가 아닙니다 (categoryId=${categoryId}, placementKind 이 있는 배치형 종류는 모듈로 쓸 수 없습니다).`,
    );
  }
}

/**
 * 분전반 회로의 부모 설비가 DIST 인지 확인.
 * (구 bulkUpdatePlan 의 dist 부모 검사와 동일.)
 */
export async function assertDistParentValid(
  tx: Tx,
  resolvedDistId: string,
): Promise<void> {
  const dist = await tx.asset.findUnique({
    where: { id: resolvedDistId },
    include: { assetType: true },
  });
  if (!dist) {
    throw new ValidationError(
      `분전반 회로의 부모 설비를 찾을 수 없습니다 (distributionEquipmentId=${resolvedDistId}).`,
    );
  }
  if (dist.assetType.placementKind !== 'DIST') {
    throw new ValidationError(
      `분전반 회로의 부모가 DISTRIBUTION 이 아닙니다 (placementKind=${dist.assetType.placementKind}).`,
    );
  }
}

export { assertSlotValid, assertNoSlotCollision };

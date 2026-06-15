import { Prisma } from '@prisma/client';
import { ValidationError } from '../utils/errors.js';
import { placementKindToKind, type PlacementKind } from './assetPlanMapper.js';
import { assertSlotValid, assertNoSlotCollision } from './rackModule.service.js';

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
 * Asset 존재 + placementKind 를 한 번에 조회 (단계4b 케이블 endpoint 검증용).
 * found=false 면 endpoint asset 이 없는 것. found=true 면 kind 는 null(내부 노드:
 * 모듈/피더/분기) 이거나 배치 종류(OFD/RACK/DIST/…).
 */
export function makeEndpointKindResolver(tx: Tx) {
  const cache = new Map<string, { found: boolean; kind: PlacementKind | null }>();
  return async (assetId: string): Promise<{ found: boolean; kind: PlacementKind | null }> => {
    if (cache.has(assetId)) return cache.get(assetId)!;
    const e = await tx.asset.findUnique({ where: { id: assetId }, include: { assetType: true } });
    const res = e
      ? { found: true, kind: placementKindToKind(e.assetType.placementKind) }
      : { found: false, kind: null };
    cache.set(assetId, res);
    return res;
  };
}

/** 케이블 한 건의 (해소 완료된) 단일 assetId endpoint. */
export interface ResolvedCableEndpoints {
  sourceAssetId: string | null;
  targetAssetId: string | null;
}

/**
 * 케이블 endpoint 유효성 검사 (단계4b — 단일 Asset 노드, real id 로 해소된 뒤 호출).
 *  - source/target 각각 존재하는 asset 을 참조해야 한다.
 *  - 직접 배치 컨테이너(RACK/DISTRIBUTION) 자체는 endpoint 가 될 수 없다
 *    (랙 안 모듈 / 분전 분기에 연결). 모듈·분기·일반 설비는 OK.
 */
export async function assertCableEndpointsValid(
  tx: Tx,
  cables: ResolvedCableEndpoints[],
): Promise<void> {
  const resolve = makeEndpointKindResolver(tx);
  for (const c of cables) {
    if (!c.sourceAssetId) {
      throw new ValidationError('source endpoint(assetId)가 필요합니다.');
    }
    if (!c.targetAssetId) {
      throw new ValidationError('target endpoint(assetId)가 필요합니다.');
    }

    const src = await resolve(c.sourceAssetId);
    const tgt = await resolve(c.targetAssetId);
    if (!src.found) {
      throw new ValidationError(`source endpoint asset 을 찾을 수 없습니다 (id=${c.sourceAssetId}).`);
    }
    if (!tgt.found) {
      throw new ValidationError(`target endpoint asset 을 찾을 수 없습니다 (id=${c.targetAssetId}).`);
    }
    // 직접 배치 컨테이너(RACK/DISTRIBUTION) 자체는 endpoint 금지 — 모듈/분기에 연결.
    // 내부 노드(kind=null: 모듈/피더/분기) 및 일반 설비는 통과.
    assertContainerNotEndpoint(src.kind, 'source');
    assertContainerNotEndpoint(tgt.kind, 'target');
  }
}

/** RACK/DISTRIBUTION 컨테이너는 케이블 endpoint 가 될 수 없다(모듈/분기에 연결). */
function assertContainerNotEndpoint(kind: PlacementKind | null, side: 'source' | 'target'): void {
  if (kind === 'RACK') {
    throw new ValidationError(
      `${side}: RACK 설비는 케이블 endpoint 가 될 수 없습니다 — 랙 안 모듈에 연결하세요.`,
    );
  }
  if (kind === 'DISTRIBUTION') {
    throw new ValidationError(
      `${side}: 분전반은 케이블 endpoint 가 될 수 없습니다 — 회로(분기)에 연결하세요.`,
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

export { assertSlotValid, assertNoSlotCollision };

import type { Asset } from '../../types/asset';
import type { EquipmentKind } from '../../types/equipmentKind';
import { kindOf } from '../workingCopy/placement';
import { buildEndpointNameResolver, buildSelfSideChecker } from './endpointName';
import { toMapById } from '../../utils/byId';

/**
 * 종류별 root kind — 경로 추적이 어디서 멈추는가(있으면 그 root 를 마지막 노드로 포함).
 * LAN 은 자연 끝(더 이상 같은 종류 케이블이 없을 때)까지.
 */
const ROOT_KIND_BY_CABLE: Record<string, EquipmentKind | null> = {
  FIBER: 'OFD',
  AC: 'DISTRIBUTION',
  DC: 'DISTRIBUTION',
  GROUND: 'GROUNDING',
  LAN: null,
};

export function rootKindForCableType(cableType: string): EquipmentKind | null {
  return ROOT_KIND_BY_CABLE[cableType] ?? null;
}

/** 추적 가드 — 사이클/폭주 방지. */
const MAX_DEPTH = 50;

interface TraceCableLite {
  id: string;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  cableType?: string | null;
}

export interface PathChainNode {
  assetId: string;
  name: string;
}

export interface PathToRoot {
  /** 경로 시작 = 케이블의 근접 엔드포인트(실제 자산: 모듈/설비). 보고 있는 자산이 랙이어도 그 안 모듈. */
  start: PathChainNode;
  /** start 이후 → root 까지(실제 자산들). 앵커(랙) collapse 없음 — 케이블은 자산에 붙으므로. */
  chain: PathChainNode[];
  root: { assetId: string; name: string; kind: EquipmentKind } | null;
}

/**
 * 한 연결(seed 케이블)을 같은 cableType 케이블을 따라 root 까지 추적한다.
 *
 * **노드는 케이블의 실제 엔드포인트 자산(모듈/OFD/분기/설비)이다 — 랙 같은 컨테이너로
 * collapse 하지 않는다.** (케이블은 모듈에 붙지 랙에 붙지 않으므로, 논리 경로에 랙이 끼면 안 됨.)
 * 캔버스 하이라이트는 별도(통합 trace store)가 배치 조상으로 펼친다 — 그건 표시용, 여긴 논리용.
 *
 *  - 시작(start) = seed 케이블에서 *보고 있는 자산(또는 그 자식)* 쪽 엔드포인트의 실제 자산.
 *  - 거기서 반대편으로 같은 종류 케이블을 한 hop 씩, 이미 방문한 자산은 건너뛰며 따라간다.
 *  - 종류별 root kind 자산에 닿으면 그 root 를 마지막 체인 노드로 포함하고 멈춘다.
 *  - LAN 처럼 root 가 없으면 더 확장 안 될 때까지(자연 끝). cycle/depth 가드.
 *
 * 순수 함수(네트워크 없음). effective cables/assets 위에서 동작.
 */
export function tracePathToRoot(
  viewedAssetId: string,
  seedCableId: string,
  effectiveCables: TraceCableLite[],
  effectiveAssets: Asset[],
): PathToRoot {
  const byId = toMapById(effectiveAssets);
  const resolveName = buildEndpointNameResolver(effectiveAssets);
  const nameOf = (id: string): string => resolveName(id) || '(미상)';

  const seed = effectiveCables.find((c) => c.id === seedCableId);
  const cableType = seed?.cableType ?? null;
  const rootKind = cableType ? rootKindForCableType(cableType) : null;

  // 근접/반대편 엔드포인트 — seed 케이블에서 "보고 있는 자산(또는 그 자식 모듈/분기)" 쪽이 근접.
  const isSelfView = buildSelfSideChecker(effectiveAssets, viewedAssetId);
  const srcIsNear = seed ? isSelfView(seed.sourceAssetId) : false;
  const nearId = (srcIsNear ? seed?.sourceAssetId : seed?.targetAssetId) ?? viewedAssetId;
  const farId = (srcIsNear ? seed?.targetAssetId : seed?.sourceAssetId) ?? null;

  const start: PathChainNode = { assetId: nearId, name: nameOf(nearId) };
  const chain: PathChainNode[] = [];
  if (!farId || !cableType) return { start, chain, root: null };

  const visited = new Set<string>([nearId]);
  let currentId: string | null = farId;
  let depth = 0;

  while (currentId && depth < MAX_DEPTH) {
    depth++;
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const cur = byId.get(currentId);
    chain.push({ assetId: currentId, name: nameOf(currentId) });

    // root kind 도달 → 마지막 노드로 포함하고 멈춤.
    if (rootKind && cur && kindOf(cur) === rootKind) {
      return { start, chain, root: { assetId: currentId, name: nameOf(currentId), kind: rootKind } };
    }

    // 다음 hop: 현재 노드(또는 그 자식)를 self-side 로 갖는 같은 종류 케이블 중, 반대편 미방문.
    const isSelfCur = buildSelfSideChecker(effectiveAssets, currentId);
    let next: string | null = null;
    for (const c of effectiveCables) {
      if (c.cableType !== cableType) continue;
      const srcSelf = isSelfCur(c.sourceAssetId);
      const tgtSelf = isSelfCur(c.targetAssetId);
      if (srcSelf === tgtSelf) continue; // 양쪽 다 self 또는 둘 다 아님 → skip
      const other = srcSelf ? c.targetAssetId : c.sourceAssetId;
      if (other && !visited.has(other)) { next = other; break; }
    }
    currentId = next;
  }

  return { start, chain, root: null };
}

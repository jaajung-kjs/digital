import type { Asset } from '../../types/asset';
import type { EquipmentKind } from '../../types/equipmentKind';
import { kindOf } from '../workingCopy/placement';
import { floorAnchor } from '../workingCopy/floorAnchor';
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
  chain: PathChainNode[];
  root: { assetId: string; name: string; kind: EquipmentKind } | null;
}

/**
 * `assetId` 에서 시작해 같은 cableType 케이블을 **자산 바깥쪽으로** 따라가며 노드 체인을 모은다.
 *
 * - 케이블 endpoint 는 단일 asset id(모듈/분기 등 내부 노드 포함). 각 endpoint 를
 *   `floorAnchor` 로 가장 가까운 배치 조상(설비/랙/분전반)까지 해소해 "포함 자산"으로 본다
 *   (이름은 `buildEndpointNameResolver` 단일 소스, 앵커 자산 기준).
 * - 한 노드에서 같은 cableType 케이블 중 *그 노드를 self-side 로* 가지는 것을 찾아 반대편
 *   포함 자산으로 한 hop 이동, 이미 방문한 자산은 건너뛴다.
 * - 종류별 root kind(아래 표) 자산에 닿으면 그 root 를 마지막 노드로 포함하고 멈춘다.
 * - LAN 처럼 root 가 없으면 더 이상 같은 종류 케이블이 확장되지 않을 때까지 간다(자연 끝).
 * - cycle/depth 가드(MAX_DEPTH).
 *
 * 시작 자산 자신은 체인에 포함하지 않는다 — 체인은 "상대명 → … → root명"(자신은 호출측 컨텍스트).
 *
 * 순수 함수(네트워크 없음). effective cables/assets 위에서 동작한다.
 */
export function tracePathToRoot(
  assetId: string,
  seedCableId: string,
  effectiveCables: TraceCableLite[],
  effectiveAssets: Asset[],
): PathToRoot {
  const byId = toMapById(effectiveAssets);
  const resolveName = buildEndpointNameResolver(effectiveAssets);
  const seed = effectiveCables.find((c) => c.id === seedCableId);
  const cableType = seed?.cableType ?? null;
  const rootKind = cableType ? rootKindForCableType(cableType) : null;

  // endpoint(모듈/분기 등) → 배치 조상(포함 자산). 앵커가 없으면 endpoint 그대로.
  const anchorOf = (epId: string | null | undefined): string | null => {
    if (!epId) return null;
    const a = floorAnchor(epId, byId);
    return a?.id ?? epId;
  };

  const chain: PathChainNode[] = [];
  const visited = new Set<string>([assetId]);

  let currentAssetId = assetId;
  let isSelf = buildSelfSideChecker(effectiveAssets, currentAssetId);
  let currentCableId: string | null = seedCableId;
  let depth = 0;

  while (depth < MAX_DEPTH) {
    depth++;

    // 다음 hop 후보를 고른다.
    //  - 시작 hop: seed 케이블 강제.
    //  - 이후: 현재 자산을 self-side 로 가지는 같은 종류 케이블 중, 반대편 포함 자산이
    //    아직 방문 전인 첫 케이블(돌아온 케이블은 반대편이 visited 라 자연히 제외).
    let nextAssetId: string | null = null;
    let nextCableType: string | null = null;
    if (currentCableId) {
      const cable = effectiveCables.find((c) => c.id === currentCableId);
      if (!cable || cable.cableType !== cableType) break;
      const otherEp = isSelf(cable.sourceAssetId) ? cable.targetAssetId : cable.sourceAssetId;
      nextAssetId = anchorOf(otherEp);
      nextCableType = cable.cableType ?? null;
    } else {
      for (const c of effectiveCables) {
        if (c.cableType !== cableType) continue;
        const srcSelf = isSelf(c.sourceAssetId);
        const tgtSelf = isSelf(c.targetAssetId);
        if (srcSelf === tgtSelf) continue; // 양쪽 다 self 또는 둘 다 아님 → skip
        const otherEp = srcSelf ? c.targetAssetId : c.sourceAssetId;
        const candidate = anchorOf(otherEp);
        if (candidate && !visited.has(candidate)) {
          nextAssetId = candidate;
          nextCableType = c.cableType ?? null;
          break;
        }
      }
    }
    if (!nextAssetId || nextCableType !== cableType) break;
    if (visited.has(nextAssetId)) break;
    visited.add(nextAssetId);

    const nextAsset = byId.get(nextAssetId);
    chain.push({ assetId: nextAssetId, name: resolveName(nextAssetId) || '(미상)' });

    // root kind 도달 → 마지막 노드로 포함하고 멈춤.
    if (rootKind && nextAsset && kindOf(nextAsset) === rootKind) {
      return {
        chain,
        root: { assetId: nextAssetId, name: resolveName(nextAssetId) || '(미상)', kind: rootKind },
      };
    }

    // 다음 hop 준비 — 이 자산을 새 self 로 보고, seed 강제는 해제(이후엔 그래프 탐색).
    currentAssetId = nextAssetId;
    isSelf = buildSelfSideChecker(effectiveAssets, currentAssetId);
    currentCableId = null;
  }

  return { chain, root: null };
}

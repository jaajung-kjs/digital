import type {
  OrgBranch,
  OrgSubstation,
  OrgFloor,
  NodeType,
} from '../../types/organization';

// ──────────────────────────────────────────────────────────────────────────
// 조직 노드 삭제 cascade — 순수 descendant 수집기.
//
// 삭제 대상 노드(type+id)와 effective 평면 4컬렉션(+ effective 자산/케이블)을 받아,
// stage-delete 해야 할 id 집합을 컬렉션별로 반환한다(노드 자신 포함).
//
//   hq        → 그 hq 의 branches → 그 branches 의 substations → 그 substations 의 floors
//   branch    → 그 branch 의 substations → 그 substations 의 floors
//   substation→ 그 substation 의 floors + **자산**(substationId===subId)
//                + 그 자산에 닿는 **케이블**(source/target asset 이 삭제 자산)
//   floor     → 그 floor 만(자산은 DB SetNull 로 floorId=null 처리 → staged 에선 floor 만 제거)
//
// effective 트리·커밋 델타가 일관되도록, hq/branch 삭제도 하위 substation 의 자산/케이블까지
// 모두 수집한다(substation 삭제와 동일 규칙을 각 하위 substation 에 적용).
// ──────────────────────────────────────────────────────────────────────────

/** 케이블 endpoint 최소 계약 — source/target asset id 만 본다. */
interface CableLike {
  id: string;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
}
/** 자산 최소 계약 — 소속 변전소만 본다. */
interface AssetLike {
  id: string;
  substationId: string;
}

export interface OrgDescendants {
  headquarters: string[];
  branches: string[];
  substations: string[];
  floors: string[];
  assets: string[];
  cables: string[];
}

export interface OrgEffective {
  branches: OrgBranch[];
  substations: OrgSubstation[];
  floors: OrgFloor[];
  assets: AssetLike[];
  cables: CableLike[];
}

/**
 * 한 변전소(subId)에 속한 자산·케이블·층 id 를 out 에 누적한다.
 * 자산 = substationId===subId, 케이블 = 양 endpoint 중 하나가 그 자산.
 */
function collectSubstationContents(
  subId: string,
  eff: OrgEffective,
  out: OrgDescendants,
): void {
  for (const f of eff.floors) if (f.substationId === subId) out.floors.push(f.id);

  const assetIds = new Set<string>();
  for (const a of eff.assets) {
    if (a.substationId === subId) {
      out.assets.push(a.id);
      assetIds.add(a.id);
    }
  }
  for (const c of eff.cables) {
    const src = c.sourceAssetId;
    const tgt = c.targetAssetId;
    if ((!!src && assetIds.has(src)) || (!!tgt && assetIds.has(tgt))) {
      out.cables.push(c.id);
    }
  }
}

/**
 * 삭제 노드 + 모든 하위를 컬렉션별 id 집합으로 수집(노드 자신 포함). 순수 함수.
 */
export function collectOrgDescendants(
  node: { type: NodeType; id: string },
  eff: OrgEffective,
): OrgDescendants {
  const out: OrgDescendants = {
    headquarters: [],
    branches: [],
    substations: [],
    floors: [],
    assets: [],
    cables: [],
  };

  switch (node.type) {
    case 'headquarters': {
      out.headquarters.push(node.id);
      const branchIds = eff.branches
        .filter((b) => b.headquartersId === node.id)
        .map((b) => b.id);
      out.branches.push(...branchIds);
      const branchSet = new Set(branchIds);
      for (const s of eff.substations) {
        if (s.branchId && branchSet.has(s.branchId)) {
          out.substations.push(s.id);
          collectSubstationContents(s.id, eff, out);
        }
      }
      break;
    }
    case 'branch': {
      out.branches.push(node.id);
      for (const s of eff.substations) {
        if (s.branchId === node.id) {
          out.substations.push(s.id);
          collectSubstationContents(s.id, eff, out);
        }
      }
      break;
    }
    case 'substation': {
      out.substations.push(node.id);
      collectSubstationContents(node.id, eff, out);
      break;
    }
    case 'floor':
    default: {
      // floor 삭제 = 그 floor 만. 자산은 DB SetNull(floorId→null) 로 처리 — staged 에선 건드리지 않음.
      out.floors.push(node.id);
      break;
    }
  }

  // cross-sub 케이블 등으로 중복될 수 있어 컬렉션별 중복 제거.
  out.headquarters = [...new Set(out.headquarters)];
  out.branches = [...new Set(out.branches)];
  out.substations = [...new Set(out.substations)];
  out.floors = [...new Set(out.floors)];
  out.assets = [...new Set(out.assets)];
  out.cables = [...new Set(out.cables)];
  return out;
}

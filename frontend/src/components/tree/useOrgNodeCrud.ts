import { useCallback, useMemo } from 'react';
import { useSubstationWorkingCopy } from '../../features/workingCopy/substationStore';
import { generateTempId } from '../../utils/idHelpers';
import { childType } from './orgNodeActions';
import { collectOrgDescendants, type OrgDescendants } from './collectOrgDescendants';
import type { NodeType, TreeNodeData } from '../../types/organization';
import type { CollectionKey } from '../../features/workingCopy/substationStore';

/**
 * 조직 트리 CRUD 캡슐화 — 워킹카피 스테이징(wc.put/patch/remove)으로 staged 반영.
 * 즉시 API 호출이 아니라 effective 트리에 staged 로 비치고, 커밋(POST /commit)에서 일괄 반영된다.
 * 반환 객체·함수는 useMemo/useCallback 으로 안정화 — 소비자 useCallback dep 안정성 보장.
 */

/** 트리 노드 타입 → 워킹카피 컬렉션 키. */
function collKeyOf(type: NodeType): CollectionKey {
  switch (type) {
    case 'headquarters': return 'headquarters';
    case 'branch': return 'branches';
    case 'substation': return 'substations';
    case 'floor':
    default: return 'floors';
  }
}

/** childType(NodeType) → 컬렉션 키. */
function childCollKey(ct: NodeType): CollectionKey {
  return collKeyOf(ct);
}

export function useOrgNodeCrud() {
  const addChild = useCallback(
    async (
      parent: TreeNodeData,
      v: { name: string; address?: string; floorNumber?: string },
    ) => {
      const ct = childType(parent.type);
      if (!ct) return;
      const wc = useSubstationWorkingCopy.getState();
      const collKey = childCollKey(ct);

      // 형제 수 → 다음 sortOrder(effective 기준, staged 포함).
      let siblings: { id: string }[] = [];
      if (ct === 'branch') {
        siblings = wc.effectiveBranches().filter((b) => b.headquartersId === parent.id);
      } else if (ct === 'substation') {
        siblings = wc.effectiveSubstations().filter((s) => s.branchId === parent.id);
      } else {
        siblings = wc.effectiveFloors().filter((f) => f.substationId === parent.id);
      }
      const sortOrder = siblings.length;

      const base: Record<string, unknown> = { id: generateTempId(), name: v.name, sortOrder };
      if (ct === 'branch') {
        base.headquartersId = parent.id;
      } else if (ct === 'substation') {
        base.branchId = parent.id;
        base.address = v.address ?? null;
      } else {
        base.substationId = parent.id;
        base.floorNumber = v.floorNumber ?? null;
      }
      wc.put(collKey, base as { id: string });
    },
    [],
  );

  const addHeadquarters = useCallback(async (name: string) => {
    const wc = useSubstationWorkingCopy.getState();
    const sortOrder = wc.effectiveHeadquarters().length;
    wc.put('headquarters', { id: generateTempId(), name, sortOrder });
  }, []);

  const rename = useCallback(async (node: TreeNodeData, name: string) => {
    useSubstationWorkingCopy.getState().patch(collKeyOf(node.type), node.id, { name });
  }, []);

  const remove = useCallback(async (node: TreeNodeData) => {
    const wc = useSubstationWorkingCopy.getState();
    const d: OrgDescendants = collectOrgDescendants(
      { type: node.type, id: node.id },
      {
        branches: wc.effectiveBranches(),
        substations: wc.effectiveSubstations(),
        floors: wc.effectiveFloors(),
        assets: wc.effectiveAssets(),
        cables: wc.effectiveCables() as { id: string; sourceAssetId?: string | null; targetAssetId?: string | null }[],
      },
    );
    // 컬렉션별 staged delete. 자산은 'assets', 케이블은 'cables' 컬렉션.
    for (const id of d.headquarters) wc.remove('headquarters', id);
    for (const id of d.branches) wc.remove('branches', id);
    for (const id of d.substations) wc.remove('substations', id);
    for (const id of d.floors) wc.remove('floors', id);
    for (const id of d.assets) wc.remove('assets', id);
    for (const id of d.cables) wc.remove('cables', id);
  }, []);

  /**
   * 형제 순서 변경 — orderedIds 순서대로 sortOrder 를 0..n 재부여(staged patch).
   * effective 가 sortOrder 로 재정렬하므로 트리에 즉시 반영되고, 커밋에 함께 실린다.
   * (temp-id 형제도 동일하게 patch — 즉시-API 없음.)
   */
  const reorder = useCallback((type: NodeType, orderedIds: string[]) => {
    const wc = useSubstationWorkingCopy.getState();
    const collKey = collKeyOf(type);
    orderedIds.forEach((id, i) => wc.patch(collKey, id, { sortOrder: i }));
  }, []);

  return useMemo(
    () => ({ addChild, addHeadquarters, rename, remove, reorder }),
    [addChild, addHeadquarters, rename, remove, reorder],
  );
}

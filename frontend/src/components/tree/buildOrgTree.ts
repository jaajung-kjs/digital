import type {
  OrgHeadquarters,
  OrgBranch,
  OrgSubstation,
  OrgFloor,
  TreeNodeData,
  NodeType,
} from '../../types/organization';

// ──────────────────────────────────────────────────────────────────────────
// 평면(flat) 조직 4컬렉션 → 트리(TreeNodeData[]) 순수 변환.
//
// 부모 포인터로 계층을 구성: hq.id ← branch.headquartersId ← substation.branchId
// ← floor.substationId. 형제는 sortOrder 우선, 동률이면 name 으로 정렬.
// 부모가 없는(orphan) 노드는 조용히 건너뛴다(branchId=null 변전소 등 포함).
//
// meta 모양은 기존 fetchChildNodes 와 동일: 본부=branchCount, 지사=substationCount,
// 변전소={floorCount,address}, 층={floorNumber}. childrenLoaded 는 항상 true
// (전체 트리가 이미 존재), expanded 는 항상 false(펼침 상태는 TreePanel 로컬 소유).
// ──────────────────────────────────────────────────────────────────────────

function bySortThenName<T extends { sortOrder: number; name: string }>(a: T, b: T): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}

function makeNode(
  id: string,
  name: string,
  type: NodeType,
  parentId: string | null,
  children: TreeNodeData[],
  meta: Record<string, unknown>,
): TreeNodeData {
  return { id, name, type, parentId, children, childrenLoaded: true, expanded: false, meta };
}

export function buildOrgTree(
  hqs: OrgHeadquarters[],
  branches: OrgBranch[],
  subs: OrgSubstation[],
  floors: OrgFloor[],
): TreeNodeData[] {
  // 자식들을 부모 id 별로 그룹핑(정렬은 마지막 한 번).
  const branchesByHq = new Map<string, OrgBranch[]>();
  for (const b of branches) {
    const arr = branchesByHq.get(b.headquartersId);
    if (arr) arr.push(b);
    else branchesByHq.set(b.headquartersId, [b]);
  }
  const subsByBranch = new Map<string, OrgSubstation[]>();
  for (const s of subs) {
    if (!s.branchId) continue; // 지사 미배속 변전소 — orphan
    const arr = subsByBranch.get(s.branchId);
    if (arr) arr.push(s);
    else subsByBranch.set(s.branchId, [s]);
  }
  const floorsBySub = new Map<string, OrgFloor[]>();
  for (const f of floors) {
    const arr = floorsBySub.get(f.substationId);
    if (arr) arr.push(f);
    else floorsBySub.set(f.substationId, [f]);
  }

  const buildFloors = (substationId: string): TreeNodeData[] =>
    (floorsBySub.get(substationId) ?? [])
      .slice()
      .sort(bySortThenName)
      .map((f) =>
        makeNode(f.id, f.name, 'floor', f.substationId, [], { floorNumber: f.floorNumber }),
      );

  const buildSubs = (branchId: string): TreeNodeData[] =>
    (subsByBranch.get(branchId) ?? [])
      .slice()
      .sort(bySortThenName)
      .map((s) => {
        const children = buildFloors(s.id);
        return makeNode(s.id, s.name, 'substation', s.branchId, children, {
          floorCount: children.length,
          address: s.address,
        });
      });

  const buildBranches = (hqId: string): TreeNodeData[] =>
    (branchesByHq.get(hqId) ?? [])
      .slice()
      .sort(bySortThenName)
      .map((b) => {
        const children = buildSubs(b.id);
        return makeNode(b.id, b.name, 'branch', b.headquartersId, children, {
          substationCount: children.length,
        });
      });

  // orphan 가드: 부모 행이 없는 자식은 group map 의 자식으로만 참조되므로,
  // 부모를 도는 위 build* 가 절대 방문하지 않아 자연히 트리에서 누락된다.
  return hqs
    .slice()
    .sort(bySortThenName)
    .map((h) => {
      const children = buildBranches(h.id);
      return makeNode(h.id, h.name, 'headquarters', null, children, {
        branchCount: children.length,
      });
    });
}

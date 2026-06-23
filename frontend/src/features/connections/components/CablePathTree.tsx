import type { TraceTreeNode } from '../../trace/traceProjection';

/**
 * 경로 트리 렌더 — 선형 구간은 한 줄(A → B → C), 분기점(피더 fan-out)은 그 노드 아래로 자식 들여쓰기.
 * 원점(축전지/공급원)이 루트로 와서 "축전지 → … → 설비" 순으로 읽힌다(projectTrace 가 원점 루팅).
 *
 * 선택한 케이블 강조: 각 노드는 "부모→이 노드로 들어온 케이블 id(cableId)"를 가지므로,
 * cableId === selectedCableId 인 노드(+그 앞 구분선)를 강조해 **클릭한 케이블이 경로 어디인지** 바로 보인다.
 */
const sep = (fiber: boolean) => (fiber ? '┄' : '→');

// 노드는 전부 일반 텍스트 — 선택한 케이블이 들어온 노드만 채운 칩(bg-primary)으로 확실히 강조.
// 출발/말단 고정색을 없애 "내가 클릭한 케이블"이 유일한 색 신호가 되게 한다.
function Chip({ node, selected }: { node: TraceTreeNode; selected: boolean }) {
  return (
    <span
      className={
        selected
          ? 'rounded bg-primary px-1.5 py-0.5 text-xs font-semibold leading-tight text-white'
          : 'text-xs leading-tight text-content'
      }
    >
      {node.label}
    </span>
  );
}

function Branch({ node, selectedCableId }: { node: TraceTreeNode; selectedCableId: string | null }) {
  const chain: TraceTreeNode[] = [node];
  let cur = node;
  while (cur.children.length === 1) { cur = cur.children[0]; chain.push(cur); }
  const branches = cur.children.length > 1 ? cur.children : null;
  const isSel = (n: TraceTreeNode) => !!selectedCableId && n.cableId === selectedCableId;
  // 선택하는 건 "케이블"(두 설비를 잇는 엣지)이므로 **양 끝 노드 모두** 강조한다.
  // isSel(n) = 케이블의 도착 노드(부모→n 엣지). onCable(n) = 도착 노드이거나, 자식 중 하나가
  // 선택 케이블인 출발 노드(부모) — 둘 다 칠해 전원-충전기처럼 양끝이 같이 보이게.
  const onCable = (n: TraceTreeNode) => isSel(n) || n.children.some(isSel);

  return (
    <div className="flex flex-wrap items-start gap-y-1">
      {chain.map((n, i) => {
        const sel = isSel(n);
        // 선택 케이블의 구분자만 primary 강조(그 케이블 = 부모→이 노드 엣지). 그 외엔 색 신호 없음.
        const sepCls = sel ? 'text-primary font-bold' : 'text-content-faint';
        const isBranchTail = i === chain.length - 1 && branches;
        if (isBranchTail) {
          return (
            <span key={`${n.id}-${i}`} className="inline-flex items-start">
              {i > 0 && <span className={`mx-1 text-xs ${sepCls}`}>{sep(n.isFiberEdge)}</span>}
              <span className="flex flex-col gap-1">
                <Chip node={n} selected={onCable(n)} />
                <span className="ml-1 flex flex-col gap-1 border-l border-line pl-2">
                  {branches.map((c, j) => (
                    <span key={`${c.id}-${j}`} className="flex items-start">
                      <span className={`mr-1 mt-0.5 text-xs ${isSel(c) ? 'text-primary font-bold' : 'text-content-faint'}`}>↳</span>
                      <Branch node={c} selectedCableId={selectedCableId} />
                    </span>
                  ))}
                </span>
              </span>
            </span>
          );
        }
        return (
          <span key={`${n.id}-${i}`} className="inline-flex items-center">
            {i > 0 && <span className={`mx-1 text-xs ${sepCls}`}>{sep(n.isFiberEdge)}</span>}
            <Chip node={n} selected={onCable(n)} />
          </span>
        );
      })}
    </div>
  );
}

export function CablePathTree({ tree, selectedCableId }: { tree: TraceTreeNode; selectedCableId: string | null }) {
  return <Branch node={tree} selectedCableId={selectedCableId} />;
}

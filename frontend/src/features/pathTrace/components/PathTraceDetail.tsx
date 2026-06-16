import { usePathHighlightStore } from '../stores/pathHighlightStore';
import type { TraceTreeNode } from '../../trace/traceProjection';

function Chip({ node }: { node: TraceTreeNode }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs leading-tight ${
        node.isEndpoint ? 'bg-info-bg text-primary font-medium' : 'bg-surface-2 text-content-muted'
      }`}
    >
      {node.label}
    </span>
  );
}

function Sep({ fiber }: { fiber: boolean }) {
  return <span className={`mx-1 text-xs ${fiber ? 'text-purple-400' : 'text-content-faint'}`}>{fiber ? '┄' : '→'}</span>;
}

/**
 * 트리 렌더 — 선형 구간은 한 줄(A → B → C)로 모으고, 분기점에서 그 노드 **아래**에 자식을 들여쓴다.
 * 분기 자식이 분기 노드(예: 피더) 칼럼에 종속되므로 "input → 피더 ↳ 부하1 ↳ 부하2" 로 읽힌다
 * (자식이 줄 시작=입력 아래로 들어가 입력에서 분기하는 것처럼 보이던 문제 해결).
 */
function TraceTreeBranch({ node }: { node: TraceTreeNode }) {
  // 자식이 1개인 동안 한 체인으로 모은다. cur = 분기(자식 2개↑) 또는 말단.
  const chain: TraceTreeNode[] = [node];
  let cur = node;
  while (cur.children.length === 1) {
    cur = cur.children[0];
    chain.push(cur);
  }
  const branches = cur.children.length > 1 ? cur.children : null;

  return (
    <div className="flex flex-wrap items-start gap-y-1">
      {chain.map((n, i) => {
        const isBranchTail = i === chain.length - 1 && branches;
        if (isBranchTail) {
          // 분기 노드 + 자식을 한 칼럼으로 → 자식이 이 노드 아래에 정렬된다.
          return (
            <span key={`${n.id}-${i}`} className="inline-flex items-start">
              {i > 0 && <Sep fiber={n.isFiberEdge} />}
              <span className="flex flex-col gap-1">
                <Chip node={n} />
                <span className="ml-1 flex flex-col gap-1 border-l border-line pl-2">
                  {branches.map((c, j) => (
                    <span key={`${c.id}-${j}`} className="flex items-start">
                      <span className={`mr-1 mt-0.5 text-xs ${c.isFiberEdge ? 'text-purple-400' : 'text-content-faint'}`}>↳</span>
                      <TraceTreeBranch node={c} />
                    </span>
                  ))}
                </span>
              </span>
            </span>
          );
        }
        return (
          <span key={`${n.id}-${i}`} className="inline-flex items-center">
            {i > 0 && <Sep fiber={n.isFiberEdge} />}
            <Chip node={n} />
          </span>
        );
      })}
    </div>
  );
}

export function PathTraceDetail() {
  const active = usePathHighlightStore((s) => s.active);
  const projection = usePathHighlightStore((s) => s.projection);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const openTopology = usePathHighlightStore((s) => s.openTopology);

  // "상세" = 이미 활성화된 trace 결과를 그대로 네트워크 토폴로지 모달에 띄움(재추적 없음).
  const handleOpenTopology = () => {
    if (tracingCableId) openTopology();
  };

  if (!active || !projection || projection.steps.length === 0) return null;

  return (
    <div className="border-t border-line bg-info-bg/50 px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-primary">경로</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleOpenTopology(); }}
            className="text-xs text-primary hover:text-primary-hover font-medium"
            title="이 장비가 속한 전체 네트워크망 보기"
          >
            상세
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clearHighlight(); }}
            className="text-xs text-content-faint hover:text-content"
          >
            닫기
          </button>
        </div>
      </div>

      <div className="max-h-32 overflow-y-auto">
        {projection.tree ? (
          <TraceTreeBranch node={projection.tree} />
        ) : (
          <div className="flex flex-wrap items-center gap-y-1">
            {projection.steps.map((item, i) => (
              <span key={`${item.id}-${i}`} className="inline-flex items-center">
                {i > 0 && (
                  <span className={`mx-1 text-xs ${item.isFiberEdge ? 'text-purple-400' : 'text-content-faint'}`}>
                    {item.isFiberEdge ? '┄' : '→'}
                  </span>
                )}
                <span
                  className={`rounded px-1.5 py-0.5 text-xs leading-tight ${
                    item.isEndpoint
                      ? 'bg-info-bg text-primary font-medium'
                      : 'bg-surface-2 text-content-muted'
                  }`}
                >
                  {item.label}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

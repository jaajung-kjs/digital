/**
 * TraceResultView — 추적 결과를 그린다. **물음마다 그루 하나.**
 *
 * `ConnectionsTab` 안에 있던 것을 뗐다. 그 파일은 900줄에 다섯 가지 일을 하고 있었고,
 * 이 세션에서만 일곱 번 고치는 동안 매번 다른 데가 흔들렸다. 그리는 일은 그리는 일끼리
 * 모여 있어야 한다.
 *
 * **거동은 그대로다** — 옮기기만 했다.
 */
import { buildTraceTree, portFlowLabel, traceIndentRows } from '@twin/core';
import type { TraceTreeNode } from '@twin/core';
import { Button, SELECTABLE, cn } from '../../../components/ui';
import type { TraceNodeLabel } from '../../traceLabels';
import type { TraceResult } from '../../traceSelectors';
import { TraceLaneGraph } from './TraceLaneGraph';
import { TraceGutterRow, type GutterCell } from './TraceGutter';

/**
 * 추적 마디 한 줄 — **무엇인가**(굵게) 위에 서고 **어디인가**(흐리게)가 그 아래 붙는다.
 *
 * 말줄임을 걸지 않는다. 좁은 판에서 잘리는 것은 대개 뒤쪽인데, 국을 넘는 경로슬롯은 바로
 * 그 뒤쪽에 「어느 국의 무엇인가」가 들어 있다 — 잘리면 추적이 답을 잃는다. 길어지면 접는다.
 */
export function TraceNodeText({
  label, muted, onClick, title,
}: {
  label: { primary: string; secondary: string | null };
  /** 지나가는 마디인가 — 끝(내가 선 자리)은 진하게 둔다. */
  muted?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <>
      <span className={cn('block break-words', muted ? '' : 'font-medium')}>{label.primary}</span>
      {label.secondary && <span className="block break-words text-xs text-content-faint">{label.secondary}</span>}
    </>
  );
  /* `block` 이어야 한다 — 안쪽이 블록 두 줄이라 인라인으로 두면 브라우저가 줄상자를
     하나 더 만들어 줄 높이가 배로 뛴다(레인 그래프처럼 flex 밖에 놓일 때 드러난다). */
  if (!onClick) return <span className={cn('block min-w-0 flex-1 px-1', muted ? 'text-content-muted' : 'text-content')}>{body}</span>;
  return (
    <button
      type="button"
      className={cn('min-w-0 flex-1 rounded px-1 text-left text-primary', SELECTABLE)}
      title={title}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

/**
 * 내려가는 추적 — **나에게서 갈라져 나간다.**
 *
 *   ◎ SID-125 · 전원 입력
 *   ├ 충전기 분배부 · 직류 출력 2
 *   │ └ …
 *
 * 갈래는 들여쓰기가 말한다. 형제가 열이어도 폭이 안 는다 — 레인으로 그리면 회로 수만큼
 * 레인이 서서 이름 칸을 먹는다(분전반 열 회로면 140px). 거슬러 오르는 쪽과 그림이 갈리는
 * 까닭은 **폭을 먹는 축이 반대**여서다: 트리는 깊이에, 레인은 갈래에 약하다.
 *
 * 점과 선은 레인 그래프와 **같은 조각**이다(`TraceGutter`). 예전에는 `└`·`├` 글자로
 * 그렸는데, 글자 이음선은 줄 사이에서 끊겨 실선이 점선처럼 보였고 굵기와 색도 달랐다.
 */
function TraceIndentTree({
  tree, label, assetOf, onSelectAsset,
}: {
  tree: TraceTreeNode;
  label: (portId: string) => TraceNodeLabel;
  assetOf: (portId: string) => { id: string; name: string } | null;
  onSelectAsset: (id: string, portId?: string | null) => void;
}) {
  const rows = traceIndentRows(tree);
  const width = Math.max(...rows.map((r) => r.depth)) + 1;

  return (
    <div>
      {rows.map((row, i) => {
        const target = assetOf(row.node.portId);
        /* 뿌리는 **맨 첫 줄**이다(전위 순회) — 깊이로 물으면 안 된다: 곧은 사슬은 이제
           온 줄이 깊이 0 이라 전부 뿌리로 그려진다. */
        const isRoot = i === 0;
        const cells: GutterCell[] = [
          /* **이어진 줄**(외자식)은 위에서 곧게 내려온다 — 꺾이는 이음선이 없다. */
          { lane: row.depth, node: true, fromAbove: !isRoot && !row.branch, toBelow: row.node.children.length > 0 },
          /* 갈래에서 갈라져 나온 줄만 부모 켜에서 꺾여 든다 — 형제가 더 남았으면 아래로
             이어지고(├), 마지막이면 여기서 끝난다(└). */
          ...(row.branch ? [{ lane: row.depth - 1, fromAbove: true, toNode: true, toBelow: !row.last }] : []),
          /* 위 조상 중 아직 형제가 남은 켜 — 세로선이 그냥 지나간다. */
          ...row.rails.map((lane) => ({ lane, fromAbove: true, toBelow: true })),
        ];
        return (
          <TraceGutterRow key={`${i}-${row.node.portId}`} cells={cells} width={width} root={isRoot}>
            <TraceNodeText
              label={label(row.node.portId)}
              muted={!isRoot}
              {...(target && !isRoot
                ? { onClick: () => onSelectAsset(target.id, row.node.portId), title: `${target.name} 으로 이동` }
                : {})}
            />
          </TraceGutterRow>
        );
      })}
    </div>
  );
}

/**
 * 추적 결과 상자 하나 — 머리줄 + 물음마다 그루 하나.
 *
 * 몇 그루인지는 **어휘가 정한다**(`traceFlows` → `TraceResult.sections`). 방향 있는 자리는
 * 하나, 축전지 같은 모선 단자는 둘이다: 「전원 측」과 「부하 측」을 한 그루에 섞으면
 * 정류기와 부하가 **형제로** 서서 넷이 같은 것처럼 읽힌다.
 */
export function TraceResultView({
  result, startPortId, startMedium, label, assetOf, onSelectAsset, onTopology, onClear, boxRef,
}: {
  result: TraceResult;
  /** 추적을 건 포트 — 그루의 뿌리다. */
  startPortId: string;
  /** 그 포트의 매체 — 구간 이름을 종류가 갖는다(`portFlowLabel`). */
  startMedium: string;
  label: (portId: string) => TraceNodeLabel;
  assetOf: (portId: string) => { id: string; name: string } | null;
  onSelectAsset: (id: string, portId?: string | null) => void;
  onTopology: () => void;
  onClear: () => void;
  /** 결과가 뜨면 보이는 자리로 끌어오려고 부모가 잡는다. */
  boxRef?: React.Ref<HTMLDivElement>;
}) {
  /* 평평한 홉 목록을 트리로 — 장비 안의 통과는 접힌다(마디는 케이블로 닿은 자리뿐). */
  const trees = result.sections
    .map((s) => ({ flow: s.flow, tree: buildTraceTree(s.hops, startPortId) }))
    .filter((t) => t.tree.children.length > 0);

  return (
    <div ref={boxRef} className="border-t border-line pt-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-content-muted">
          {trees.length > 0 ? '추적 경로' : '연결된 경로가 없습니다'}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="secondary" size="sm" onClick={onTopology}>토폴로지</Button>
          <Button variant="secondary" size="sm" onClick={onClear}>지우기</Button>
        </div>
      </div>
      {/* 경로 전체를 옅게 칠해 「여기까지가 한 길」임을 눈으로 묶는다.
          물음이 둘이면 그루도 둘이고, 그때만 어느 답인지 이름을 붙인다 — 하나뿐일 때
          이름을 달면 「어디서 오나」를 두 번 말하는 꼴이다. */}
      {trees.map(({ flow, tree }) => (
        <div key={flow} className="mt-1.5 rounded-md bg-primary/5 p-1.5">
          {trees.length > 1 && (
            <div className="mb-1 text-xs font-medium text-content-muted">
              {/* 이름은 **종류가 갖는다** — 전원은 전원 측·부하 측이다. */}
              {portFlowLabel(startMedium, flow === 'upstream' ? 'upstream' : 'downstream')}
            </div>
          )}
          {flow === 'upstream' ? (
            /* **모이는 물음은 레인으로.** 트리는 갈라지는 것만 그린다. */
            <TraceLaneGraph tree={tree} label={label} assetOf={assetOf} onSelectAsset={onSelectAsset} />
          ) : (
            /* **갈라지는 물음은 트리로.** 형제가 열이어도 폭이 안 든다. */
            <TraceIndentTree tree={tree} label={label} assetOf={assetOf} onSelectAsset={onSelectAsset} />
          )}
        </div>
      ))}
    </div>
  );
}

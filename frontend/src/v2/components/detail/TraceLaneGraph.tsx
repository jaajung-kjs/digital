/**
 * TraceLaneGraph — 거슬러 오르는 추적. **출처가 위, 내가 맨 아래.**
 *
 *   ● 상용 피더 · 분기 2
 *   ●─╮ 충전기 분전반 · 교류 출력 1     ← 두 정류기가 **같은 자리**에서 먹는다
 *   ● │ IR-48 50A #1 · 전원 출력
 *   │ ● 충전기 분전반 · 교류 출력 2
 *   │ ● IR-48 50A #2 · 전원 출력
 *   ●─┴─╯ 충전기 분전반 · 직류 출력 1
 *   ◎ 직류 피더 · MAIN
 *
 * 위에서 아래로 읽으면 **전기가 흐르는 차례**다 — 내려가는 트리와 같은 방향이라, 두 그림의
 * 읽는 규칙이 하나다.
 *
 * 트리로는 이 모양을 담을 수 없다. **트리는 갈라지는 것만 그린다.** 여럿이 나에게로 모이는
 * 그림을 좁은 세로 칸에 그리는 방법은 커밋 그래프가 이미 갖고 있다(`git log --graph`) —
 * 값이 되는 성질은 **깊이가 늘어도 폭이 안 변한다**는 것이다.
 *
 * 자리 계산은 화면 밖에 있고(`traceLanes`), 점과 선은 트리와 **같은 조각**을 쓴다
 * (`TraceGutter`).
 */
import { traceLanes, type TraceTreeNode } from '@twin/core';
import type { TraceNodeLabel } from '../../traceLabels';
import { TraceGutterRow, type GutterCell } from './TraceGutter';
import { TraceNodeText } from './TraceResultView';

export function TraceLaneGraph({
  tree, label, assetOf, onSelectAsset,
}: {
  tree: TraceTreeNode;
  label: (portId: string) => TraceNodeLabel;
  assetOf: (portId: string) => { id: string; name: string } | null;
  onSelectAsset: (id: string, portId?: string | null) => void;
}) {
  const rows = traceLanes(tree);
  const width = Math.max(...rows.map((r) => Math.max(r.lane, ...r.merges, ...r.through, ...r.forks))) + 1;

  return (
    <div>
      {rows.map((row, i) => {
        const target = assetOf(row.node.portId);
        /* 뿌리 = 추적을 건 자리. 레인 그래프에서는 **맨 아래**다. */
        const isRoot = !row.toBelow;
        const cells: GutterCell[] = [
          { lane: row.lane, node: true, fromAbove: row.fromAbove, toBelow: row.toBelow },
          /* 합류 — 위에서 내려와 이 마디의 켜로 꺾여 든다. */
          ...row.merges.map((lane) => ({ lane, fromAbove: true, toNode: true })),
          /* 갈래 — 이 마디에서 꺾여 나가 아래로 내려간다(합류의 짝). **같은 자리에서 먹는
             갈래가 둘일 때** 그 자리를 두 번 세우지 않고 여기서 하나 더 내려보낸다. */
          ...row.forks.map((lane) => ({ lane, toNode: true, toBelow: true })),
          ...row.through.map((lane) => ({ lane, fromAbove: true, toBelow: true })),
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

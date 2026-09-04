/**
 * TraceLaneGraph — 거슬러 오르는 추적을 **레인 그래프**로 그린다.
 *
 *   ● 충전기 분배부 · 교류 출력 1
 *   ● IR-48 50A #1 · 전원 출력
 *   │ ● 충전기 분배부 · 교류 출력 2
 *   │ ● IR-48 50A #2 · 전원 출력
 *   │ │ ● 축전지 · 축전지 단자
 *   ●─┴─╯ 충전기 분배부 · 직류 출력 2
 *   ◉ SID-125 · 전원 입력
 *
 * 출처가 위, 내가 맨 아래 — **위에서 아래로 읽으면 전기가 흐르는 차례**다. 내려가는 추적의
 * 트리도 위에서 아래로 흐르므로, 두 그림의 읽는 규칙이 같아진다(예전에는 거슬러 오르는
 * 쪽만 흐름을 거슬러 읽어야 했다).
 *
 * 선은 글자가 아니라 **1px 테두리**로 긋는다. `│`·`╯` 같은 글자는 줄 사이(line-height)에서
 * 끊겨, 이어져야 할 레인이 점선처럼 보인다.
 *
 * 자리 계산은 화면 밖에 있다(`traceLanes`) — 거기라야 시험할 수 있다.
 */
import { traceLanes, type TraceTreeNode } from '@twin/core';
import { cn } from '../../../components/ui';
import type { TraceNodeLabel } from '../../traceLabels';
import { TraceNodeText } from './TraceResultView';

/** 레인 한 칸의 폭. 좁을수록 이름 칸이 넓다 — 점과 꺾임이 보이는 최소가 이 값이다. */
const LANE = 14;
/**
 * 마디(점)가 줄 안에서 서는 **높이**.
 *
 * 줄 한가운데가 아니라 **첫 줄(장비 이름)의 눈높이**다. 마디는 두 줄짜리라(장비/포트)
 * 가운데에 두면 점이 두 글줄 사이에 떠서 어느 줄의 것인지 안 읽힌다. 합류하는 가로선도
 * 같은 높이에 그어야 꺾임이 점에 닿는다.
 */
const NODE_Y = 11;
/**
 * 레인 선의 색 — 트리의 안내선(`border-line`)보다 **한 단 진하다.**
 *
 * 트리에서 선은 장식이다(들여쓰기가 이미 켜를 말한다). 여기서는 **선이 곧 구조**다 —
 * 어디서 합쳐지는지가 그 선 하나에 달렸으므로 옅으면 그림이 아무 말도 안 한다.
 */
const STROKE = 'bg-content-faint/50';

export function TraceLaneGraph({
  tree, label, assetOf, onSelectAsset,
}: {
  tree: TraceTreeNode;
  label: (portId: string) => TraceNodeLabel;
  assetOf: (portId: string) => { id: string; name: string } | null;
  onSelectAsset: (id: string, portId?: string | null) => void;
}) {
  const rows = traceLanes(tree);
  const width = (Math.max(...rows.map((r) => Math.max(r.lane, ...r.merges, ...r.through))) + 1) * LANE;
  const x = (lane: number) => lane * LANE + LANE / 2;

  return (
    /* 줄 사이에 틈을 두지 않는다 — 2px 만 벌어져도 레인이 점선처럼 끊긴다. 숨통은
       글자 쪽 `py` 가 낸다. */
    <div>
      {rows.map((row, i) => {
        const target = assetOf(row.node.portId);
        /* 뿌리 = 추적을 건 자리. 레인 그래프에서는 **맨 아래**다. */
        const isRoot = !row.toBelow;
        const dot = isRoot ? 4 : 2.5;
        return (
          <div key={`${i}-${row.node.portId}`} className="relative flex items-start">
            {/* 레인 칸 — 선은 글자가 아니라 1px 테두리로 긋는다(글자는 줄 사이에서 끊긴다). */}
            <div aria-hidden className="relative shrink-0 self-stretch" style={{ width }}>
              {/* 그냥 지나가는 레인 — 위아래로 곧게. */}
              {row.through.map((lane) => (
                <span key={`t${lane}`} className={cn("absolute inset-y-0 w-px", STROKE)} style={{ left: x(lane) }} />
              ))}
              {/* 합류하는 레인 — 위에서 내려와 이 마디의 레인으로 꺾여 든다. */}
              {row.merges.map((lane) => (
                <span key={`m${lane}`}>
                  <span className={cn("absolute top-0 w-px", STROKE)} style={{ left: x(lane), height: NODE_Y }} />
                  <span
                    className={cn("absolute h-px", STROKE)}
                    style={{ left: x(row.lane), width: x(lane) - x(row.lane), top: NODE_Y }}
                  />
                </span>
              ))}
              {/* 이 마디의 레인 — 위에서 이어져 오면 위쪽, 아래로 이어지면 아래쪽. */}
              {row.fromAbove && (
                <span className={cn("absolute top-0 w-px", STROKE)} style={{ left: x(row.lane), height: NODE_Y }} />
              )}
              {row.toBelow && (
                <span className={cn("absolute bottom-0 w-px", STROKE)} style={{ left: x(row.lane), top: NODE_Y }} />
              )}
              {/* 마디 — 뿌리(나)만 겹동그라미다. 내려가는 트리의 `◉` 와 같은 어법. */}
              <span
                /* 뿌리 표시는 **내려가는 트리와 같은 것**이다(`◉`) — 두 그림에서 「나」를
                   다른 기호로 찍으면 같은 화면에 두 어법이 선다. */
                className={cn(
                  'absolute rounded-full',
                  isRoot ? 'border-[3px] border-content-faint bg-surface' : 'bg-content-faint',
                )}
                style={{ left: x(row.lane) - dot, top: NODE_Y - dot, width: dot * 2, height: dot * 2 }}
              />
            </div>
            <div className="min-w-0 flex-1 pb-1.5 text-sm">
              <TraceNodeText
                label={label(row.node.portId)}
                muted={!isRoot}
                {...(target && !isRoot
                  ? { onClick: () => onSelectAsset(target.id, row.node.portId), title: `${target.name} 으로 이동` }
                  : {})}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

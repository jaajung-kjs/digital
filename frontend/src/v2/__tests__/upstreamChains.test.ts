/**
 * 거슬러 오르는 추적은 **흐르는 차례로** 읽힌다 — 갈래가 있어도.
 *
 * 한때 화면이 「곧은 길이 정확히 하나일 때만」 뒤집었다. 갈라지면 나를 뿌리로 한 트리로
 * 떨어졌는데, **그 트리는 내려가는 추적과 똑같이 생겼다** — 정류기 둘이 먹이는 강압기의
 * 입력을 추적하면 「내 전원이 어디서 오나」를 물었는데 「내가 무엇을 먹이나」처럼 그려졌다.
 *
 * 갈래가 있고 없고는 묻는 방향과 상관이 없다. 그 특수 케이스를 없앤 자리를 여기서 붙든다.
 */
import { describe, expect, it } from 'vitest';
import type { TraceTreeNode } from '@twin/core';
import { upstreamChainsOf } from '../traceSelectors';

const node = (portId: string, ...children: TraceTreeNode[]): TraceTreeNode =>
  ({ portId, children } as TraceTreeNode);

/** 강압기의 입력에서 거슬러 오른 모양 — 정류기 둘이 모선을 먹인다. */
const 갈래있음 = node('SID·입력', node('분배부·직류출력', node('정류기1·출력'), node('정류기2·출력')));
/** 정류기의 교류 입력에서 거슬러 오른 모양 — 출처가 하나다. */
const 곧은길 = node('정류기1·입력', node('분배부·교류출력'));

describe('upstreamChainsOf', () => {
  it('갈래가 있으면 길마다 한 줄 — 출처가 앞, 내가 끝', () => {
    const chains = upstreamChainsOf(갈래있음, true)!;
    expect(chains.map((c) => c.map((n) => n.portId))).toEqual([
      ['정류기1·출력', '분배부·직류출력', 'SID·입력'],
      ['정류기2·출력', '분배부·직류출력', 'SID·입력'],
    ]);
    /* 어느 길이든 **끝은 나**다 — 그래야 「나에게 온다」로 읽힌다. */
    for (const c of chains) expect(c.at(-1)!.portId).toBe('SID·입력');
  });

  it('곧은 길도 같은 규칙으로 뒤집힌다 — 특수 케이스가 없다', () => {
    expect(upstreamChainsOf(곧은길, true)!.map((c) => c.map((n) => n.portId)))
      .toEqual([['분배부·교류출력', '정류기1·입력']]);
  });

  /* 내려가는 추적은 트리가 답이다 — 이 회로가 무엇을 먹이는지는 뻗어 나가는 모양 그대로다. */
  it('내려가는 추적이면 null — 트리를 그리라는 뜻', () => {
    expect(upstreamChainsOf(갈래있음, false)).toBeNull();
  });
});

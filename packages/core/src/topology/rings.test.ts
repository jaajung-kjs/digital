import { describe, expect, it } from 'vitest';
import { detectRings } from './rings.js';
import type { TopoEdge } from './types.js';

const e = (id: string, source: string, target: string): TopoEdge =>
  ({ id, source, target, sourceSlotName: '', targetSlotName: '' });

/** 링 하나를 마디 이름 집합으로 견준다 — 차례는 뜻이 없다. */
const nodesOf = (r: { nodeIds: string[] }) => [...r.nodeIds].sort();
const edgesOf = (r: { edgeIds: string[] }) => [...r.edgeIds].sort();

describe('detectRings', () => {
  it('닫힌 링 하나 — 마디 넷이 소링 하나로', () => {
    const rings = detectRings([e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A')]);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.level).toBe(0);
    expect(nodesOf(rings[0]!)).toEqual(['A', 'B', 'C', 'D']);
    expect(edgesOf(rings[0]!)).toEqual(['1', '2', '3', '4']);
  });

  /* 구간 하나가 빠지면 링이 아니라 사슬이다 — 그림도 원이 아니라 줄로 서야 한다. */
  it('안 닫힌 링은 링이 아니다', () => {
    expect(detectRings([e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D')])).toEqual([]);
  });

  it('마디 하나를 공유하는 링 둘(8자) — 소링 둘, 대링 없음', () => {
    const rings = detectRings([
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A'),
      e('4', 'C', 'D'), e('5', 'D', 'E'), e('6', 'E', 'C'),
    ]);
    expect(rings.filter((r) => r.level === 0)).toHaveLength(2);
    /* 간선을 공유하지 않으므로 바깥 테두리가 따로 생기지 않는다 — 두 원이 한 점에서 접할 뿐이다. */
    expect(rings.filter((r) => r.level === 1)).toHaveLength(0);
  });

  it('구간 하나를 공유하는 링 둘 — 소링 둘 + 대링 하나(바깥 테두리)', () => {
    /* A-B-C-D-A 와 A-D-E-F-A 가 간선 4(D-A)를 공유한다. */
    const rings = detectRings([
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A'),
      e('5', 'A', 'F'), e('6', 'F', 'E'), e('7', 'E', 'D'),
    ]);
    const small = rings.filter((r) => r.level === 0);
    const big = rings.filter((r) => r.level === 1);
    expect(small).toHaveLength(2);
    expect(big).toHaveLength(1);
    /* 바깥 테두리 = 공유 간선을 뺀 나머지(XOR). 4번이 빠져야 한다. */
    expect(edgesOf(big[0]!)).toEqual(['1', '2', '3', '5', '6', '7']);
    expect(nodesOf(big[0]!)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect([...big[0]!.childRingIds].sort()).toEqual(small.map((r) => r.id).sort());
  });

  /* 두 국 사이 구간이 두 본인 것은 이중화이지 링이 아니다 — 원으로 그릴 것이 없다. */
  it('평행 구간(마디 둘)은 링으로 세지 않는다', () => {
    expect(detectRings([e('1', 'A', 'B'), e('2', 'A', 'B')])).toEqual([]);
  });

  it('줄이 없으면 링도 없다', () => {
    expect(detectRings([])).toEqual([]);
  });

  /* 대링을 원으로 놓을 것이므로 마디가 **테두리를 도는 차례**로 나와야 한다.
     차례가 뒤섞이면 원 위에 놓았을 때 줄이 서로를 가로지른다. */
  it('대링의 마디는 테두리를 도는 차례로 나온다', () => {
    const rings = detectRings([
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A'),
      e('5', 'A', 'F'), e('6', 'F', 'E'), e('7', 'E', 'D'),
    ]);
    const ids = rings.find((r) => r.level === 1)!.nodeIds;
    /* A-B-C-D-E-F 를 도는 차례 — 어디서 시작하든, 어느 방향이든 좋다. */
    const cycle = ['A', 'B', 'C', 'D', 'E', 'F'];
    const rotations = cycle.flatMap((_, i) => {
      const fwd = [...cycle.slice(i), ...cycle.slice(0, i)];
      return [fwd, [...fwd].reverse()];
    });
    expect(rotations.some((r) => r.join() === ids.join())).toBe(true);
  });

  /* 링이 셋 이상 한 마디에서 만나면 테두리가 단일 순환이 아니다 — 그릴 원이 없으므로
     대링을 내지 않는다. 한때 걷기가 시작점으로 먼저 돌아오며 멈춰, 간선은 열둘인데 마디는
     여섯만 담긴 대링이 **오류 없이** 나왔다. */
  it('링 셋이 한 허브에서 만나면 대링을 내지 않는다', () => {
    /* A와 Z 를 잇는 마디가 안 겹치는 경로 넷 — 소링 셋이 A·Z 를 공유한다. */
    const paths = [['P1'], ['P2'], ['P3'], ['P4']];
    const edges = paths.flatMap((mid, i) => [
      e(`${i}a`, 'A', mid[0]!),
      e(`${i}b`, mid[0]!, 'Z'),
    ]);
    const rings = detectRings(edges);
    expect(rings.filter((r) => r.level === 1)).toHaveLength(0);
    expect(rings.filter((r) => r.level === 0).length).toBeGreaterThan(0);
    /* 낸 링은 무엇이든 마디와 간선이 아귀가 맞아야 한다. */
    for (const r of rings) expect(r.nodeIds.length).toBe(r.edgeIds.length);
  });

  /* 두 마디 사이에 갈래가 셋이면 XOR 은 그중 넷으로 이뤄진 **멀쩡한 단일 순환**을 낸다.
     그런데 그 순환은 다섯째 마디를 안 덮는다 — 그러면 배치가 그 마디를 가지로 뻗고, 그
     가지의 줄이 반대편 허브 상자를 관통한다(실측). 제 묶음을 다 덮지 못하는 것은
     바깥 테두리가 아니다. */
  it('대링이 제 묶음의 마디를 다 덮지 못하면 내지 않는다', () => {
    const rings = detectRings([
      e('1', 'A', 'B'), e('2', 'B', 'C'),
      e('3', 'C', 'D'), e('4', 'D', 'A'),
      e('5', 'A', 'E'), e('6', 'E', 'C'),
    ]);
    expect(rings.filter((r) => r.level === 1)).toHaveLength(0);
    expect(rings.filter((r) => r.level === 0).length).toBeGreaterThan(0);
  });

  it('같은 입력이면 같은 답 — 링 id 까지', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A')];
    expect(detectRings(edges)).toEqual(detectRings(edges));
  });
});

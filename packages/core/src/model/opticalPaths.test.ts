import { describe, expect, it } from 'vitest';
import type { LinkEndRef } from './types.js';
import type { Side } from './vocab.js';
import {
  opticalPaths, pathBundles, redundancyWarnings, reversePath, rings, traceFromCore,
  type NetworkInput, type OpticalPath,
} from './opticalPaths.js';

/* ── 픽스처 짓기 ─────────────────────────────────────────────────────────────── */

const eq = (equipmentId: string, label: string | null = null): LinkEndRef => ({ kind: 'equipment', equipmentId, label });
const core = (lineId: string, no: number, side: Side): LinkEndRef => ({ kind: 'core', lineId, no, side });

interface Fx {
  lines: NetworkInput['lines'];
  cores: NetworkInput['cores'];
  links: NetworkInput['links'];
  equipment: Record<string, string>; // 설비 id → 국 id
}

function net(fx: Fx): NetworkInput {
  return {
    lines: fx.lines, cores: fx.cores, links: fx.links,
    equipmentSubstation: (id) => fx.equipment[id] ?? null,
  };
}

/** 입력 배열의 차례를 섞는다 — 결정적으로(시드 k). */
function shuffle<T>(xs: readonly T[], k: number): T[] {
  return xs.map((x, i) => ({ x, r: (i * 7919 + k * 104729) % 9973 })).sort((p, q) => p.r - q.r).map((p) => p.x);
}
function shuffled(fx: Fx, k: number): NetworkInput {
  return net({ ...fx, lines: shuffle(fx.lines, k), cores: shuffle(fx.cores, k + 1), links: shuffle(fx.links, k + 2) });
}

/**
 * 북춘천 RTU 예비회선 — SCADA 회선현황의 중계경로와 구간 단위로 같은 사슬(스펙 §종이 검증).
 * 북춘천 FL2:9 → 춘천HP(패치) → 20 → 화천HP(패치) → 1 → 화천(패치) → 37 → 철원.
 * 춘천HP–화천HP 광선로는 일부러 화천HP 를 A 끝으로 적었다 — 홉 방향이 B→A 로 나와야 한다.
 */
const RTU: Fx = {
  lines: [
    { id: 'FL2', aSubstationId: '북춘천', bSubstationId: '춘천HP' },
    { id: 'CH-HC', aSubstationId: '화천HP', bSubstationId: '춘천HP' },
    { id: 'HC-HW', aSubstationId: '화천HP', bSubstationId: '화천' },
    { id: 'HW-CW', aSubstationId: '화천', bSubstationId: '철원' },
  ],
  cores: [
    { lineId: 'FL2', no: 9, role: 'backup' },
    { lineId: 'CH-HC', no: 20, role: 'backup' },
    { lineId: 'HC-HW', no: 1, role: 'backup' },
    { lineId: 'HW-CW', no: 37, role: 'backup' },
  ],
  links: [
    { id: 'k-start', a: eq('RTU-북춘천', 'Tx'), b: core('FL2', 9, 'A') },
    { id: 'p-춘천HP', a: core('FL2', 9, 'B'), b: core('CH-HC', 20, 'B') },
    { id: 'p-화천HP', a: core('HC-HW', 1, 'A'), b: core('CH-HC', 20, 'A') },
    { id: 'p-화천', a: core('HC-HW', 1, 'B'), b: core('HW-CW', 37, 'A') },
    { id: 'k-end', a: core('HW-CW', 37, 'B'), b: eq('RTU-철원', 'Rx') },
  ],
  equipment: { 'RTU-북춘천': '북춘천', 'RTU-철원': '철원' },
};

/**
 * 송광치 링 축약 — 세 국(북춘천·춘천·화천)을 OPGW 셋이 원으로 잇는다. 국마다 송광치 하나.
 * 주회선은 각 구간 코어 1·2(Tx/Rx). 북춘천–춘천 예비회선은 **같은 OPGW** 의 코어 7·8 —
 * 종이 검증에서 드러난 「물리 이중화 아님」. 춘천–화천 예비회선은 북춘천을 돌아가는 진짜 우회
 * (OPGW-1 코어 9 → 북춘천 패치 → OPGW-3 코어 9) — 경고가 없어야 한다.
 */
const tx = (lineId: string, no: number, aEq: string, bEq: string, n: string) => [
  { id: `${n}-a`, a: eq(aEq, `C1 ${no % 2 ? 'Tx' : 'Rx'}`), b: core(lineId, no, 'A') },
  { id: `${n}-b`, a: core(lineId, no, 'B'), b: eq(bEq, `C1 ${no % 2 ? 'Rx' : 'Tx'}`) },
];
const RING: Fx = {
  lines: [
    { id: 'OPGW-1', aSubstationId: '북춘천', bSubstationId: '춘천' },
    { id: 'OPGW-2', aSubstationId: '춘천', bSubstationId: '화천' },
    { id: 'OPGW-3', aSubstationId: '화천', bSubstationId: '북춘천' },
  ],
  cores: [
    ...['OPGW-1', 'OPGW-2', 'OPGW-3'].flatMap((lineId) => [
      { lineId, no: 1, role: 'main' }, { lineId, no: 2, role: 'main' },
    ]),
    { lineId: 'OPGW-1', no: 7, role: 'backup' }, { lineId: 'OPGW-1', no: 8, role: 'backup' },
    { lineId: 'OPGW-1', no: 9, role: 'backup' }, { lineId: 'OPGW-3', no: 9, role: 'backup' },
  ],
  links: [
    ...tx('OPGW-1', 1, 'SG-북춘천', 'SG-춘천', 'm1-1'), ...tx('OPGW-1', 2, 'SG-북춘천', 'SG-춘천', 'm1-2'),
    ...tx('OPGW-2', 1, 'SG-춘천', 'SG-화천', 'm2-1'), ...tx('OPGW-2', 2, 'SG-춘천', 'SG-화천', 'm2-2'),
    ...tx('OPGW-3', 1, 'SG-화천', 'SG-북춘천', 'm3-1'), ...tx('OPGW-3', 2, 'SG-화천', 'SG-북춘천', 'm3-2'),
    ...tx('OPGW-1', 7, 'SG-북춘천', 'SG-춘천', 'b1-7'), ...tx('OPGW-1', 8, 'SG-북춘천', 'SG-춘천', 'b1-8'),
    /* 춘천 → OPGW-1:9 (B→A) → 북춘천 패치 → OPGW-3:9 (B→A) → 화천 */
    { id: 'b2-a', a: eq('SG-춘천', 'C2 Tx'), b: core('OPGW-1', 9, 'B') },
    { id: 'b2-p', a: core('OPGW-1', 9, 'A'), b: core('OPGW-3', 9, 'B') },
    { id: 'b2-b', a: core('OPGW-3', 9, 'A'), b: eq('SG-화천', 'C2 Rx') },
  ],
  equipment: { 'SG-북춘천': '북춘천', 'SG-춘천': '춘천', 'SG-화천': '화천' },
};

const hopsOf = (p: OpticalPath) => p.hops.map((h) => `${h.lineId}:${h.coreNo} ${h.from}→${h.to}`);

/* ── 사슬 ────────────────────────────────────────────────────────────────────── */

describe('traceFromCore — 중계경로 추적', () => {
  it('RTU 예비회선: 북춘천 FL2:9 → 춘천HP → 20 → 화천HP → 1 → 화천 → 37 → 철원', () => {
    const p = traceFromCore(net(RTU), { lineId: 'FL2', coreNo: 9, side: 'A' });
    expect(p.start).toEqual({ equipmentId: 'RTU-북춘천', port: 'Tx', substationId: '북춘천' });
    expect(p.end).toEqual({ equipmentId: 'RTU-철원', port: 'Rx', substationId: '철원' });
    expect(hopsOf(p)).toEqual(['FL2:9 A→B', 'CH-HC:20 B→A', 'HC-HW:1 A→B', 'HW-CW:37 A→B']);
    expect(p.patches).toEqual(['p-춘천HP', 'p-화천HP', 'p-화천']);
    expect(p.duty).toBe('backup');
    expect(p.complete).toBe(true);
  });

  /* 방향은 물은 코어 끝에서 바라본 대로 — 그 끝에 물린 쪽이 start, 먼 쪽이 end. id 는 방향 무관. */
  it('같은 사슬을 양쪽 끝에서 물으면 홉이 뒤집히고 id 는 같다', () => {
    const fromNorth = traceFromCore(net(RTU), { lineId: 'FL2', coreNo: 9, side: 'A' });
    const fromCheorwon = traceFromCore(net(RTU), { lineId: 'HW-CW', coreNo: 37, side: 'B' });
    expect(fromCheorwon.id).toBe(fromNorth.id);
    expect(fromCheorwon.start?.equipmentId).toBe('RTU-철원');
    expect(fromCheorwon.end?.equipmentId).toBe('RTU-북춘천');
    expect(hopsOf(fromCheorwon)).toEqual(['HW-CW:37 B→A', 'HC-HW:1 B→A', 'CH-HC:20 A→B', 'FL2:9 B→A']);
    expect(fromCheorwon.patches).toEqual(['p-화천', 'p-화천HP', 'p-춘천HP']);
    expect(fromCheorwon).toEqual(reversePath(fromNorth));
  });

  it('사슬 가운데 코어에서 물어도 — at.side 쪽이 start', () => {
    const base = traceFromCore(net(RTU), { lineId: 'FL2', coreNo: 9, side: 'A' });
    /* CH-HC:20 의 B 끝(춘천HP)은 북춘천 쪽으로 패치돼 있다 → 북춘천이 start */
    expect(traceFromCore(net(RTU), { lineId: 'CH-HC', coreNo: 20, side: 'B' })).toEqual(base);
    /* 반대 끝(화천HP)에서 물으면 철원이 start */
    expect(traceFromCore(net(RTU), { lineId: 'CH-HC', coreNo: 20, side: 'A' })).toEqual(reversePath(base));
    /* 같은 코어라도 먼 끝에서 물으면 뒤집힌다 */
    expect(traceFromCore(net(RTU), { lineId: 'FL2', coreNo: 9, side: 'B' })).toEqual(reversePath(base));
  });

  it('reversePath — 끝·홉(from/to)·패치를 뒤집고 id 는 그대로, 두 번이면 제자리', () => {
    const p = traceFromCore(net(RTU), { lineId: 'FL2', coreNo: 9, side: 'A' });
    const r = reversePath(p);
    expect(r.id).toBe(p.id);
    expect(r.start).toEqual(p.end);
    expect(r.end).toEqual(p.start);
    expect(hopsOf(r)).toEqual(['HW-CW:37 B→A', 'HC-HW:1 B→A', 'CH-HC:20 A→B', 'FL2:9 B→A']);
    expect(r.patches).toEqual([...p.patches].reverse());
    expect(r.duty).toBe(p.duty);
    expect(r.complete).toBe(p.complete);
    expect(reversePath(r)).toEqual(p);
  });

  it('빈 코어 끝이면 경로 미완결 — 끝이 null', () => {
    const fx: Fx = { ...RTU, links: RTU.links.filter((l) => l.id !== 'k-end') };
    const p = traceFromCore(net(fx), { lineId: 'HC-HW', coreNo: 1, side: 'A' });
    expect(p.complete).toBe(false);
    expect([p.start?.equipmentId ?? null, p.end?.equipmentId ?? null].sort()).toEqual([null, 'RTU-북춘천'].sort());
    expect(p.hops).toHaveLength(4);
  });

  it('연결이 하나도 없는 코어 — 홉 하나, 양끝 null', () => {
    const p = traceFromCore(net(RTU), { lineId: 'FL2', coreNo: 3, side: 'A' });
    expect(p.start).toBeNull();
    expect(p.end).toBeNull();
    expect(hopsOf(p)).toHaveLength(1);
    expect(p.duty).toBeNull();
    expect(p.complete).toBe(false);
  });

  it('주/예비가 섞이거나 비면 duty 는 null', () => {
    const mixed: Fx = { ...RTU, cores: RTU.cores.map((c) => (c.lineId === 'HC-HW' ? { ...c, role: 'main' } : c)) };
    expect(traceFromCore(net(mixed), { lineId: 'FL2', coreNo: 9, side: 'A' }).duty).toBeNull();
    const blank: Fx = { ...RTU, cores: RTU.cores.filter((c) => c.lineId !== 'HC-HW') };
    expect(traceFromCore(net(blank), { lineId: 'FL2', coreNo: 9, side: 'A' }).duty).toBeNull();
  });

  it('데이터 고리(코어끼리만 돌아 제자리) — 멈추고 경로 미완결', () => {
    const fx: Fx = {
      lines: [{ id: 'L1', aSubstationId: 'X', bSubstationId: 'Y' }, { id: 'L2', aSubstationId: 'Y', bSubstationId: 'X' }],
      cores: [],
      links: [
        { id: 'p1', a: core('L1', 1, 'B'), b: core('L2', 1, 'A') },
        { id: 'p2', a: core('L2', 1, 'B'), b: core('L1', 1, 'A') },
      ],
      equipment: {},
    };
    const p = traceFromCore(net(fx), { lineId: 'L1', coreNo: 1, side: 'A' });
    expect(p.complete).toBe(false);
    expect(p.hops).toHaveLength(2); // 각 코어를 한 번씩만
    expect(p.start).toBeNull();
    expect(p.end).toBeNull();
    /* 끊긴 까닭 — 고리는 앞으로 간 다리가 만난다(뒤 다리는 이미 방문한 코어라 연결 없음과 같다). */
    expect([p.startCut, p.endCut]).toContain('loop');
  });

  it('끊긴 까닭 — 연결이 없으면 open, 설비 끝이면 null, 뒤집으면 함께 바뀐다', () => {
    const fx: Fx = { ...RTU, links: RTU.links.filter((l) => l.id !== 'k-end') };
    const p = traceFromCore(net(fx), { lineId: 'FL2', coreNo: 9, side: 'A' });
    expect(p.startCut).toBeNull();
    expect(p.endCut).toBe('open');
    const r = reversePath(p);
    expect([r.startCut, r.endCut]).toEqual(['open', null]);
    expect(traceFromCore(net(RTU), { lineId: 'FL2', coreNo: 9, side: 'A' })).toMatchObject({ startCut: null, endCut: null });
  });

  it('한 코어 끝에 연결이 둘(어긋난 자료)이어도 멈춘다 — 경로 미완결', () => {
    const fx: Fx = {
      lines: [{ id: 'L1', aSubstationId: 'X', bSubstationId: 'Y' }, { id: 'L2', aSubstationId: 'Y', bSubstationId: 'Y' }],
      cores: [],
      links: [
        { id: 'k', a: eq('E'), b: core('L1', 1, 'A') },
        { id: 'p1', a: core('L1', 1, 'B'), b: core('L2', 1, 'A') },
        { id: 'p2', a: core('L2', 1, 'B'), b: core('L1', 1, 'B') }, // L1:1 B 에 두 번째 연결
      ],
      equipment: { E: 'X' },
    };
    const ps = opticalPaths(net(fx));
    expect(ps).toHaveLength(1);
    expect(ps[0]!.complete).toBe(false);
    expect(ps[0]!.start?.equipmentId ?? ps[0]!.end?.equipmentId).toBe('E');
  });

  it('같은 국 안 광선로(춘천HP MCR실)도 한 홉으로 지난다', () => {
    const fx: Fx = {
      ...RTU,
      lines: [...RTU.lines, { id: 'MCR', aSubstationId: '춘천HP', bSubstationId: '춘천HP' }],
      links: [
        ...RTU.links.filter((l) => l.id !== 'p-춘천HP'),
        { id: 'p-mcr1', a: core('FL2', 9, 'B'), b: core('MCR', 3, 'A') },
        { id: 'p-mcr2', a: core('MCR', 3, 'B'), b: core('CH-HC', 20, 'B') },
      ],
    };
    const p = traceFromCore(net(fx), { lineId: 'MCR', coreNo: 3, side: 'A' });
    expect(hopsOf(p)).toEqual(['FL2:9 A→B', 'MCR:3 A→B', 'CH-HC:20 B→A', 'HC-HW:1 A→B', 'HW-CW:37 A→B']);
    expect(p.patches).toEqual(['p-mcr1', 'p-mcr2', 'p-화천HP', 'p-화천']);
    expect(p.complete).toBe(true);
  });

  it('같은 광선로 안 점퍼(먼 국에서 코어 1 → 코어 2 로 되돌림)', () => {
    const fx: Fx = {
      lines: [{ id: 'L', aSubstationId: 'X', bSubstationId: 'Y' }],
      cores: [{ lineId: 'L', no: 1, role: 'main' }, { lineId: 'L', no: 2, role: 'main' }],
      links: [
        { id: 'k1', a: eq('E1'), b: core('L', 1, 'A') },
        { id: 'j', a: core('L', 1, 'B'), b: core('L', 2, 'B') },
        { id: 'k2', a: core('L', 2, 'A'), b: eq('E2') },
      ],
      equipment: { E1: 'X', E2: 'X' },
    };
    const ps = opticalPaths(net(fx));
    expect(ps).toHaveLength(1);
    expect(hopsOf(ps[0]!)).toEqual(['L:1 A→B', 'L:2 B→A']);
    expect(ps[0]!.patches).toEqual(['j']);
    expect(ps[0]!.complete).toBe(true);
    expect(ps[0]!.duty).toBe('main');
  });

  it('차단기 끝도 경로의 끝(설비 끝으로) — 경로 미완결이 아니다', () => {
    const fx: Fx = {
      lines: [{ id: 'L', aSubstationId: 'X', bSubstationId: 'Y' }],
      cores: [],
      links: [
        { id: 'k1', a: eq('E1', 'P1'), b: core('L', 1, 'A') },
        { id: 'k2', a: core('L', 1, 'B'), b: { kind: 'circuit', equipmentId: 'B1', no: 3 } },
      ],
      equipment: { E1: 'X', B1: 'Y' },
    };
    const p = traceFromCore(net(fx), { lineId: 'L', coreNo: 1, side: 'A' });
    expect(p.complete).toBe(true);
    expect([p.start, p.end].map((e) => e?.equipmentId).sort()).toEqual(['B1', 'E1']);
  });

  it('설비 국을 모르면 광선로 끝의 국으로', () => {
    const fx: Fx = { ...RTU, equipment: {} };
    const p = traceFromCore(net(fx), { lineId: 'FL2', coreNo: 9, side: 'A' });
    expect(p.start?.substationId).toBe('북춘천');
    expect(p.end?.substationId).toBe('철원');
  });
});

describe('opticalPaths — 설비 끝에서 출발하는 모든 사슬', () => {
  it('양끝 설비에서 각각 출발해도 사슬은 하나', () => {
    const ps = opticalPaths(net(RTU));
    expect(ps).toHaveLength(1);
    expect(ps[0]).toEqual(traceFromCore(net(RTU), { lineId: 'HW-CW', coreNo: 37, side: 'A' }));
  });

  /* 정규 방향에서 빈 끝은 언제나 end 쪽 — 콜레이터가 기호를 글자 앞에 놓아도. */
  it('미완결 사슬은 설비 끝이 start, 빈 끝이 end', () => {
    for (const drop of ['k-end', 'k-start']) {
      const fx: Fx = { ...RTU, links: RTU.links.filter((l) => l.id !== drop) };
      const [p] = opticalPaths(net(fx));
      expect(p!.complete).toBe(false);
      expect(p!.start).not.toBeNull();
      expect(p!.end).toBeNull();
      expect(p!.id).toBe(traceFromCore(net(fx), { lineId: 'FL2', coreNo: 9, side: 'B' }).id);
    }
  });

  it('빈 끝으로 끝나는 사슬도 담는다(미완결)', () => {
    const fx: Fx = { ...RTU, links: [...RTU.links, { id: 'k-x', a: eq('ODF'), b: core('FL2', 5, 'A') }] };
    const ps = opticalPaths(net(fx));
    expect(ps).toHaveLength(2);
    expect(ps.filter((p) => !p.complete)).toHaveLength(1);
  });

  it('설비에 닿지 않는 사슬(코어끼리 패치만)은 담지 않는다', () => {
    const fx: Fx = { ...RTU, links: [...RTU.links, { id: 'p-x', a: core('FL2', 5, 'B'), b: core('CH-HC', 5, 'B') }] };
    expect(opticalPaths(net(fx))).toHaveLength(1);
  });

  it('송광치 링: 주 Tx/Rx 6 + 예비 Tx/Rx 2 + 우회 예비 1 = 9 경로', () => {
    const ps = opticalPaths(net(RING));
    expect(ps).toHaveLength(9);
    expect(ps.every((p) => p.complete)).toBe(true);
    expect(new Set(ps.map((p) => p.id)).size).toBe(9);
  });

  it('입력 차례를 섞어도 같은 결과', () => {
    for (const fx of [RTU, RING]) {
      const base = opticalPaths(net(fx));
      for (const k of [1, 2, 3, 4]) expect(opticalPaths(shuffled(fx, k))).toEqual(base);
    }
  });
});

/* ── 묶음·링·이중화 경고 ─────────────────────────────────────────────────────── */

describe('pathBundles — Tx/Rx 가 한 선', () => {
  it('송광치 링: 주 1·2 는 구간마다 한 선, 예비 7·8 은 별개 선, 우회 예비도 별개', () => {
    const bs = pathBundles(opticalPaths(net(RING)));
    expect(bs).toHaveLength(5);
    const desc = bs.map((b) => `${b.a.equipmentId}~${b.b.equipmentId} ${b.lineIds.join('>')} ${b.duty} ×${b.paths.length}`).sort();
    expect(desc).toEqual([
      'SG-북춘천~SG-춘천 OPGW-1 backup ×2',
      'SG-북춘천~SG-춘천 OPGW-1 main ×2',
      'SG-북춘천~SG-화천 OPGW-3 main ×2',
      'SG-춘천~SG-화천 OPGW-1>OPGW-3 backup ×1',
      'SG-춘천~SG-화천 OPGW-2 main ×2',
    ]);
  });

  it('Tx/Rx 포트가 다르면 묶음 끝의 포트는 null, 같으면 그 포트', () => {
    const bs = pathBundles(opticalPaths(net(RING)));
    expect(bs.every((b) => b.a.port === null || b.paths.length === 1)).toBe(true);
    const single = bs.find((b) => b.paths.length === 1)!;
    expect([single.a.port, single.b.port].sort()).toEqual(['C2 Rx', 'C2 Tx']);
  });

  it('미완결 경로는 묶지 않는다', () => {
    const fx: Fx = { ...RTU, links: RTU.links.filter((l) => l.id !== 'k-end') };
    expect(pathBundles(opticalPaths(net(fx)))).toEqual([]);
  });

  it('입력 차례를 섞어도 같은 결과', () => {
    const ps = opticalPaths(net(RING));
    const base = pathBundles(ps);
    for (const k of [1, 2, 3]) expect(pathBundles(shuffle(ps, k))).toEqual(base);
  });
});

describe('rings — 설비-묶음 그래프의 고리', () => {
  it('송광치 세 국은 링 하나', () => {
    const bs = pathBundles(opticalPaths(net(RING)));
    const rs = rings(bs);
    expect(rs).toHaveLength(1);
    expect(rs[0]!.equipmentIds).toEqual(['SG-북춘천', 'SG-춘천', 'SG-화천']);
    expect(rs[0]!.bundleIds).toHaveLength(5);
  });

  it('사슬(RTU 예비회선)은 링이 아니다', () => {
    expect(rings(pathBundles(opticalPaths(net(RTU))))).toEqual([]);
  });

  it('두 설비 사이 주·예비 두 선만으로는 링이 아니다(마디 3 이상)', () => {
    const fx: Fx = {
      ...RING,
      links: RING.links.filter((l) => l.id.startsWith('m1-') || l.id.startsWith('b1-')),
    };
    expect(rings(pathBundles(opticalPaths(net(fx))))).toEqual([]);
  });

  it('입력 차례를 섞어도 같은 결과', () => {
    const bs = pathBundles(opticalPaths(net(RING)));
    const base = rings(bs);
    for (const k of [1, 2, 3]) expect(rings(shuffle(bs, k))).toEqual(base);
  });
});

describe('redundancyWarnings — 주·예비회선이 같은 광선로를 지납니다', () => {
  it('송광치 링: 북춘천–춘천 주 1·2 와 예비 7·8 이 같은 OPGW → 경고 1, 우회 예비는 경고 없음', () => {
    const bs = pathBundles(opticalPaths(net(RING)));
    const ws = redundancyWarnings(bs);
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ a: 'SG-북춘천', b: 'SG-춘천', sharedLineIds: ['OPGW-1'] });
    expect(bs.find((b) => b.id === ws[0]!.mainBundle)?.duty).toBe('main');
    expect(bs.find((b) => b.id === ws[0]!.backupBundle)?.duty).toBe('backup');
  });

  it('예비가 다른 광선로로 돌면 경고 없음', () => {
    const fx: Fx = { ...RING, links: RING.links.filter((l) => !l.id.startsWith('b1-')) };
    expect(redundancyWarnings(pathBundles(opticalPaths(net(fx))))).toEqual([]);
  });

  it('입력 차례를 섞어도 같은 결과', () => {
    const bs = pathBundles(opticalPaths(net(RING)));
    const base = redundancyWarnings(bs);
    for (const k of [1, 2, 3]) expect(redundancyWarnings(shuffle(bs, k))).toEqual(base);
  });
});

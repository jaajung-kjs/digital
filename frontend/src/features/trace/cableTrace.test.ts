import { describe, it, expect } from 'vitest';
import { cableTrace } from './cableTrace';

const A = (id: string, r?: 'feeder' | 'slot') => ({ id, role: r ?? null });

describe('cableTrace — passive', () => {
  it('일반 자산 체인을 양방향 순회(분기 포함)', () => {
    const assets = [A('L1'), A('X'), A('L2')];
    const cables = [
      { id: 'c1', groupId: 'AC', sourceAssetId: 'L1', targetAssetId: 'X' },
      { id: 'c2', groupId: 'AC', sourceAssetId: 'X', targetAssetId: 'L2' },
    ];
    const r = cableTrace('L1', 'AC', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['L1', 'X', 'L2']));
    expect(new Set(r.cableIds)).toEqual(new Set(['c1', 'c2']));
  });
});

describe('cableTrace — distributor', () => {
  it('부하→피더(OUT)→충전기(IN), 형제 OUT 부하로 안 샌다', () => {
    const assets = [A('L'), A('M'), A('F', 'feeder'), A('C')];
    const cables = [
      { id: 'c1', groupId: 'AC', sourceAssetId: 'F', targetAssetId: 'L', sourceRole: 'OUT', targetRole: null },
      { id: 'c2', groupId: 'AC', sourceAssetId: 'F', targetAssetId: 'M', sourceRole: 'OUT', targetRole: null },
      { id: 'c3', groupId: 'AC', sourceAssetId: 'C', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN' },
    ];
    const r = cableTrace('L', 'AC', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['L', 'F', 'C']));
    expect(new Set(r.cableIds)).toEqual(new Set(['c1', 'c3']));
  });
});

describe('cableTrace — conduit', () => {
  it('광: 설비→슬롯 OUT#5→OPGW(IN)→대국 슬롯→OUT#5→대국 설비 (번호 짝)', () => {
    const assets = [A('eqA'), A('S1', 'slot'), A('S2', 'slot'), A('eqB'), A('eqC')];
    const cables = [
      { id: 'o1', groupId: 'FIBER', sourceAssetId: 'S1', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 5 },
      { id: 'opgw', groupId: 'FIBER', sourceAssetId: 'S1', targetAssetId: 'S2', sourceRole: 'IN', targetRole: 'IN' },
      { id: 'o2', groupId: 'FIBER', sourceAssetId: 'S2', targetAssetId: 'eqB', sourceRole: 'OUT', targetRole: null, number: 5 },
      { id: 'o3', groupId: 'FIBER', sourceAssetId: 'S2', targetAssetId: 'eqC', sourceRole: 'OUT', targetRole: null, number: 6 },
    ];
    const r = cableTrace('eqA', 'FIBER', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['eqA', 'S1', 'S2', 'eqB']));
    expect(new Set(r.cableIds)).toEqual(new Set(['o1', 'opgw', 'o2']));
    expect(r.nodeIds).not.toContain('eqC');
  });
});

describe('cableTrace — 엣지케이스', () => {
  it('passive 분기: 허브에서 여러 갈래 모두 포함', () => {
    const assets = [{ id: 'H', role: null }, { id: 'A', role: null }, { id: 'B', role: null }, { id: 'C', role: null }];
    const cables = [
      { id: 'c1', groupId: 'LAN', sourceAssetId: 'H', targetAssetId: 'A' },
      { id: 'c2', groupId: 'LAN', sourceAssetId: 'H', targetAssetId: 'B' },
      { id: 'c3', groupId: 'LAN', sourceAssetId: 'H', targetAssetId: 'C' },
    ];
    const r = cableTrace('A', 'LAN', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['A', 'H', 'B', 'C']));
  });

  it('링(사이클)에서 무한루프 없이 전부 1회 방문', () => {
    const assets = [{ id: 'N1', role: null }, { id: 'N2', role: null }, { id: 'N3', role: null }];
    const cables = [
      { id: 'a', groupId: 'FIBER', sourceAssetId: 'N1', targetAssetId: 'N2' },
      { id: 'b', groupId: 'FIBER', sourceAssetId: 'N2', targetAssetId: 'N3' },
      { id: 'c', groupId: 'FIBER', sourceAssetId: 'N3', targetAssetId: 'N1' },
    ];
    const r = cableTrace('N1', 'FIBER', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['N1', 'N2', 'N3']));
    expect(new Set(r.cableIds)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('groupId 다르면 안 탐(전원 추적이 광·네트워크로 안 샘)', () => {
    const assets = [{ id: 'X', role: null }, { id: 'Y', role: null }];
    const cables = [
      { id: 'ac', groupId: 'AC', sourceAssetId: 'X', targetAssetId: 'Y' },
      { id: 'lan', groupId: 'LAN', sourceAssetId: 'X', targetAssetId: 'Y' },
    ];
    const r = cableTrace('X', 'AC', assets, cables);
    expect(new Set(r.cableIds)).toEqual(new Set(['ac']));
  });

  it('다단 distributor 상류: 부하→피더→충전기→AC메인', () => {
    const assets = [{ id: 'L', role: null }, { id: 'F', role: 'feeder' as const }, { id: 'C', role: 'feeder' as const }, { id: 'AC', role: null }];
    const cables = [
      { id: 'c1', groupId: 'DC', sourceAssetId: 'F', targetAssetId: 'L', sourceRole: 'OUT' as const, targetRole: null },
      { id: 'c2', groupId: 'DC', sourceAssetId: 'C', targetAssetId: 'F', sourceRole: 'OUT' as const, targetRole: 'IN' as const },
      { id: 'c3', groupId: 'DC', sourceAssetId: 'AC', targetAssetId: 'C', sourceRole: null, targetRole: 'IN' as const },
    ];
    const r = cableTrace('L', 'DC', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['L', 'F', 'C', 'AC']));
  });

  it('conduit 노드에서 시작하면 대국 출력은 도달 안 함(ch 미정 — 진입점은 설비여야 함, 동작 핀)', () => {
    const assets = [
      { id: 'S1', role: 'slot' as const },
      { id: 'S2', role: 'slot' as const },
      { id: 'eqA', role: null },
      { id: 'eqB', role: null },
    ];
    const cables = [
      { id: 'o1', groupId: 'FIBER', sourceAssetId: 'S1', targetAssetId: 'eqA', sourceRole: 'OUT' as const, targetRole: null, number: 5 },
      { id: 'opgw', groupId: 'FIBER', sourceAssetId: 'S1', targetAssetId: 'S2', sourceRole: 'IN' as const, targetRole: 'IN' as const },
      { id: 'o2', groupId: 'FIBER', sourceAssetId: 'S2', targetAssetId: 'eqB', sourceRole: 'OUT' as const, targetRole: null, number: 5 },
    ];
    const r = cableTrace('S1', 'FIBER', assets, cables);
    expect(r.nodeIds).toContain('eqA');  // 시작 슬롯의 로컬 출력은 도달
    expect(r.nodeIds).toContain('S2');   // OPGW 건너 대국 슬롯까지는 감
    expect(r.nodeIds).not.toContain('eqB'); // 대국 출력은 채널 미정이라 도달 안 함(전제: 설비에서 시작)
  });
});

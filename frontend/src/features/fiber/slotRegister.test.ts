import { describe, it, expect } from 'vitest';
import { buildSlotCoreRows } from './slotRegister';
import { buildTraceGraph } from '../trace/traceGraph';

const slot = { id: 'slotA', name: 'OFD', parentAssetId: 'ofdW' };
const localCables = [
  { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null, specParams: { cores: 4 } },
  { id: 'oA3', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 3, specParams: { purpose: '보호', __migration: 'x' } },
];
// buildTraceGraph 단일 입력(assetType 중첩). 변전소명은 NAMES 맵으로.
const A = (id: string, name: string, sub: string, parent: string | null, role: 'slot' | 'device') =>
  ({ id, name, substationId: sub, parentAssetId: parent, slotIndex: null, assetType: { role } });
const slim = [
  A('slotA', 'OFD', 'subW', 'ofdW', 'slot'),
  A('slotB', 'OFD', 'subH', 'ofdH', 'slot'),
  A('eqA', '광단말A', 'subW', null, 'device'),
  A('eqB', '광단말B', 'subH', null, 'device'),
];
const NAMES = new Map([['subW', '원주S/S'], ['subH', '홍천S/S']]);
const globalCables = [
  ...localCables.map((c) => ({ ...c })),
  { id: 'oB3', cableType: 'FIBER', sourceAssetId: 'slotB', targetAssetId: 'eqB', sourceRole: 'OUT', targetRole: null, number: 3, specParams: {} },
];

describe('buildSlotCoreRows', () => {
  it('점유 행(메타·근접) + 용량까지 빈 행 + far 투영, 코어 번호 1..N 연속', () => {
    const graph = buildTraceGraph({ assets: slim, cables: globalCables, substationNames: NAMES });
    const rows = buildSlotCoreRows(slot, localCables, graph);
    expect(rows.map((r) => r.coreNumber)).toEqual([1, 2, 3, 4]); // 연속
    const r3 = rows.find((r) => r.coreNumber === 3)!;
    expect(r3.occupied).toBe(true);          // 설비 패치(OUT 케이블) 있음
    expect(r3.opgwId).toBe('opgw');          // 코어정보 소유자 = OPGW
    expect(r3.nearAssetId).toBe('eqA');
    expect(r3.farName).toBe('광단말B');
    const r1 = rows.find((r) => r.coreNumber === 1)!;
    expect(r1.occupied).toBe(false);         // 빈 코어
    expect(r1.opgwId).toBe('opgw');          // 빈 코어도 OPGW 소유 → 메타 편집 가능
  });

  it('graph 없으면 far 는 null, 점유 행은 그대로', () => {
    const rows = buildSlotCoreRows(slot, localCables, null);
    expect(rows.find((r) => r.coreNumber === 3)!.farName).toBe(null);
  });

  it('코어정보(손실·거리·마지막점검일)는 OPGW.coreMeta 에서 읽는다 — 설비 없는 빈 코어도', () => {
    const lc = [
      { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null,
        specParams: { cores: 4, coreMeta: { '2': { loss1310: -6.4, dist1310: 18.74, loss1550: -4.4, dist1550: 18.75, inspectDate: '2025-12-30' } } } },
    ];
    // 코어 2 는 설비 패치(OUT 케이블)가 없음에도 OPGW.coreMeta 로 메타가 채워짐.
    const r2 = buildSlotCoreRows(slot, lc, null).find((r) => r.coreNumber === 2)!;
    expect(r2.occupied).toBe(false);
    expect(r2.loss1310).toBe('-6.4');
    expect(r2.dist1310).toBe('18.74');
    expect(r2.loss1550).toBe('-4.4');
    expect(r2.dist1550).toBe('18.75');
    expect(r2.inspectDate).toBe('2025-12-30');
    // coreMeta 없는 코어는 null
    const r1 = buildSlotCoreRows(slot, lc, null).find((r) => r.coreNumber === 1)!;
    expect(r1.loss1310).toBe(null);
    expect(r1.inspectDate).toBe(null);
  });

  it('대국 far-name = twin 슬롯 같은코어 OUT 반대편(표시값과 일치, transitive 아님)', () => {
    const graph = buildTraceGraph({ assets: slim, cables: globalCables, substationNames: NAMES });
    const rows = buildSlotCoreRows(slot, localCables, graph);
    // 코어3: twin(slotB) 의 OUT#3 = oB3 → eqB.
    expect(rows.find((r) => r.coreNumber === 3)!.farName).toBe('광단말B');
    // twin 에 해당 코어 OUT 이 없으면 near 가 있어도 far 는 null.
    const noTwinOut = buildTraceGraph({
      assets: slim,
      cables: globalCables.filter((c) => c.id !== 'oB3'),
      substationNames: NAMES,
    });
    expect(buildSlotCoreRows(slot, localCables, noTwinOut).find((r) => r.coreNumber === 3)!.farName).toBe(null);
  });

  it('점유 코어가 cores 를 초과하면 용량이 확장되고 1..max 연속(가려지지 않음)', () => {
    const lc = [
      { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null, specParams: { cores: 4 } },
      { id: 'oA6', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 6, specParams: {} },
    ];
    const rows = buildSlotCoreRows(slot, lc, null);
    expect(rows.map((r) => r.coreNumber)).toEqual([1, 2, 3, 4, 5, 6]); // max(4,6)=6, 연속
    expect(rows.find((r) => r.coreNumber === 6)!.occupied).toBe(true);
    expect(rows.find((r) => r.coreNumber === 4)!.occupied).toBe(false);
  });

  it('farName: refs 주입 시 이름 해소, 미주입 시 id 폴백', () => {
    // graph.nameById 가 비어 있으면 graph 로 이름 해소 불가 → refs 폴백
    const g = { nameById: new Map<string, string>(), cables: globalCables } as never;
    const withRefs = buildSlotCoreRows(slot, localCables, g, new Map([['eqB', { name: '대국설비' }]]));
    const noRefs = buildSlotCoreRows(slot, localCables, g);
    // refs 있을 때: remoteAssetId='eqB' → refs 에서 이름 해소
    expect(withRefs.find((r) => r.coreNumber === 3)!.farName).toBe('대국설비');
    // refs 없을 때: graph 도 없으므로 remoteAssetId 자체를 문자열로
    expect(noRefs.find((r) => r.coreNumber === 3)!.farName).toBe('eqB');
  });

  it('buildSlotPorts 무변경 회귀 — refs 추가 후에도 graph.nameById 해소 우선', () => {
    const graph = buildTraceGraph({ assets: slim, cables: globalCables, substationNames: NAMES });
    // refs 에 다른 이름이 있어도 graph.nameById 가 먼저
    const rows = buildSlotCoreRows(slot, localCables, graph, new Map([['eqB', { name: 'refs이름' }]]));
    expect(rows.find((r) => r.coreNumber === 3)!.farName).toBe('광단말B'); // graph 우선
  });
});

import { describe, it, expect } from 'vitest';
import { buildInternalPath } from './internalPath';
import type { TraceGraph } from '../trace/traceGraph';

// device(S1) —patch(core1)— slot(S1) ┄opgw┄ remoteSlot(S2) —patch2— remoteDevice(S2)
const cables = [
  { id: 'patch', sourceAssetId: 'slot', targetAssetId: 'device', sourceRole: 'OUT', targetRole: null, number: 1, cableType: 'FIBER' },
  { id: 'patch2', sourceAssetId: 'remoteSlot', targetAssetId: 'remoteDevice', sourceRole: 'OUT', targetRole: null, number: 1, cableType: 'FIBER' },
  { id: 'opgw', sourceAssetId: 'slot', targetAssetId: 'remoteSlot', sourceRole: 'IN', targetRole: 'IN', number: null, cableType: 'FIBER' },
  // device 에 붙은 다른 코어(폭발 유발용) — 내부경로에 끌려오면 안 됨
  { id: 'patchX', sourceAssetId: 'slotX', targetAssetId: 'device', sourceRole: 'OUT', targetRole: null, number: 9, cableType: 'FIBER' },
  // device ↔ 광스위치(번호·역할 없음) — 코어 회로가 설비를 통과해 이어져야 함
  { id: 'sw', sourceAssetId: 'device', targetAssetId: 'switch', sourceRole: null, targetRole: null, number: null, cableType: 'FIBER' },
];
const graph = (): TraceGraph => ({
  assets: [],
  cables,
  nameById: new Map([['device', '송변전광단말'], ['slot', '경로슬롯'], ['remoteSlot', '대국슬롯'], ['remoteDevice', '대국단말'], ['slotX', '슬롯X'], ['switch', '광스위치']]),
  subNameById: new Map(),
  subById: new Map([['device', 'S1'], ['slot', 'S1'], ['slotX', 'S1'], ['switch', 'S1'], ['remoteSlot', 'S2'], ['remoteDevice', 'S2']]),
  parentById: new Map(),
  kindById: new Map([['device', null], ['slot', 'conduit'], ['slotX', 'conduit'], ['switch', null], ['remoteSlot', 'conduit'], ['remoteDevice', null]]),
  codeById: new Map(),
  placementKindById: new Map(),
  slotIndexById: new Map(),
} as unknown as TraceGraph);

const flatten = (root: { id: string; children: { id: string; children: unknown[] }[] }): string[] => {
  const out: string[] = [];
  const walk = (n: { id: string; children: { id: string; children: unknown[] }[] }) => { out.push(n.id); n.children.forEach((c) => walk(c as never)); };
  walk(root);
  return out;
};

describe('buildInternalPath', () => {
  it('코어패치 클릭: 변전소 안 = 광스위치→설비→슬롯(설비 통과), 대국/다른코어로 폭발 안 함', () => {
    const r = buildInternalPath('patch', 'S1', graph())!;
    expect(r).not.toBeNull();
    expect(new Set(flatten(r.tree))).toEqual(new Set(['switch', 'device', 'slot'])); // 광스위치까지 통과, slotX/대국 제외
    expect(r.crossed).toBe(true); // OPGW 로 변전소 밖 연속
  });

  it('루트 = 설비 말단(광스위치): 광스위치 → 송변전광단말 → 경로슬롯 순', () => {
    const r = buildInternalPath('patch', 'S1', graph())!;
    expect(r.tree.id).toBe('switch');              // 광스위치부터
    expect(r.tree.children[0].id).toBe('device');  // → 송변전광단말
    expect(r.tree.children[0].children[0].id).toBe('slot'); // → 경로슬롯
  });

  it('설비=통과지만 다른 번호 코어(patchX→slotX)로는 안 잇는다(폭발 방지)', () => {
    const r = buildInternalPath('patch', 'S1', graph())!;
    expect(flatten(r.tree)).not.toContain('slotX');
  });

  it('OPGW(IN) 클릭: 슬롯 한 칸만(코어로 fan 안 함), crossed=true', () => {
    const r = buildInternalPath('opgw', 'S1', graph())!;
    expect(r.tree.id).toBe('slot');
    expect(r.tree.children).toEqual([]);
    expect(r.crossed).toBe(true);
  });

  it('선택 케이블 위치: 그 케이블로 들어온 노드의 cableId = 선택 케이블', () => {
    const r = buildInternalPath('patch', 'S1', graph())!;
    // switch → device(sw) → slot(patch). patch 로 들어온 노드 = slot.
    const slot = r.tree.children[0].children[0];
    expect(slot.id).toBe('slot');
    expect(slot.cableId).toBe('patch');
  });
});

// 전원(실제 (구)춘천 모양): 충전기·UPS 전부 passive(=피더 아님). 충전기 케이블은 역할 없음.
// 충전기 ─c1(역할없음)─ UPS-1 ─c2(UPS:IN)─ UPS ─out1(OUT,#1)─ 단말1, ─out2(OUT,#2)─ 단말2
const powerCables = [
  { id: 'c1', sourceAssetId: 'charger', targetAssetId: 'ups1', sourceRole: null, targetRole: null, number: null, cableType: 'POWER' },
  { id: 'c2', sourceAssetId: 'ups1', targetAssetId: 'ups', sourceRole: null, targetRole: 'IN', number: null, cableType: 'POWER' },
  { id: 'out1', sourceAssetId: 'ups', targetAssetId: 'load1', sourceRole: 'OUT', targetRole: null, number: 1, cableType: 'POWER' },
  { id: 'out2', sourceAssetId: 'ups', targetAssetId: 'load2', sourceRole: 'OUT', targetRole: null, number: 2, cableType: 'POWER' },
];
const powerGraph = (): TraceGraph => ({
  assets: [],
  cables: powerCables,
  nameById: new Map([['charger', '충전기'], ['ups1', 'UPS-1'], ['ups', 'UPS'], ['load1', '단말1'], ['load2', '단말2']]),
  subNameById: new Map(),
  subById: new Map([['charger', 'S1'], ['ups1', 'S1'], ['ups', 'S1'], ['load1', 'S1'], ['load2', 'S1']]),
  parentById: new Map(),
  kindById: new Map([['charger', null], ['ups1', null], ['ups', null], ['load1', null], ['load2', null]]), // 전부 passive
  codeById: new Map(),
  placementKindById: new Map(),
  slotIndexById: new Map(),
} as unknown as TraceGraph);

describe('buildInternalPath — 전원', () => {
  it('루트 = 충전기(공급 안 받는 끝). UPS-1 에서 분기처럼 보이지 않고 충전기→UPS-1→UPS 직렬', () => {
    // 충전기-UPS-1(c1) 클릭 — 역할 없는 케이블이어도 충전기가 끝 단자라 루트.
    const r = buildInternalPath('c1', 'S1', powerGraph())!;
    expect(r.tree.id).toBe('charger');                       // 충전기부터 직렬
    expect(r.tree.children.map((n) => n.id)).toEqual(['ups1']); // 충전기는 분기 아님 — UPS-1 한 줄
    expect(r.tree.children[0].children.map((n) => n.id)).toEqual(['ups']); // → UPS
    const branch = r.tree.children[0].children[0].children;   // UPS 에서만 병렬 2개
    expect(branch.map((n) => n.id).sort()).toEqual(['load1', 'load2']);
  });

  it('OUT 케이블(분기 이후) 클릭: 충전기 → … → 그 단말 직렬 1개(다른 OUT 배제)', () => {
    const r = buildInternalPath('out1', 'S1', powerGraph())!;
    const ids = flatten(r.tree);
    expect(r.tree.id).toBe('charger');     // 여전히 충전기 시작
    expect(ids).toContain('load1');
    expect(ids).not.toContain('load2');    // 병렬 형제 OUT(번호 다름) 은 안 따라감
  });
});

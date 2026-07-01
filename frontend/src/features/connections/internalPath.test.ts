import { describe, it, expect } from 'vitest';
import { buildInternalPath } from './internalPath';
import type { TraceGraph } from '../trace/traceGraph';

// ── Fiber: patch(#1) seed 용 slice fixture ──
// slice(seed=patch) = slot→device 단일 줄기, OPGW 경유 remoteSlot까지.
// device ← patch(OUT) ─ slot ┄opgw(IN-IN)┄ remoteSlot — patch2 — remoteDevice
// sw(null:null) cable(device↔switch)는 역할 없어 slice 하류에 포함 안 됨.
const patchStrandCables = [
  { id: 'patch', sourceAssetId: 'slot', targetAssetId: 'device', sourceRole: 'OUT', targetRole: null, number: 1, cableType: 'FIBER' },
  { id: 'patch2', sourceAssetId: 'remoteSlot', targetAssetId: 'remoteDevice', sourceRole: 'OUT', targetRole: null, number: 1, cableType: 'FIBER' },
  { id: 'opgw', sourceAssetId: 'slot', targetAssetId: 'remoteSlot', sourceRole: 'IN', targetRole: 'IN', number: null, cableType: 'FIBER' },
  // device ↔ 광스위치(번호·역할 없음) — 역할 없어 slice down() 이 따라가지 않음.
  { id: 'sw', sourceAssetId: 'device', targetAssetId: 'switch', sourceRole: null, targetRole: null, number: null, cableType: 'FIBER' },
];
const patchGraph = (): TraceGraph => ({
  assets: [],
  cables: patchStrandCables,
  nameById: new Map([['device', '송변전광단말'], ['slot', '경로슬롯'], ['remoteSlot', '대국슬롯'], ['remoteDevice', '대국단말'], ['switch', '광스위치']]),
  subNameById: new Map(),
  subById: new Map([['device', 'S1'], ['slot', 'S1'], ['switch', 'S1'], ['remoteSlot', 'S2'], ['remoteDevice', 'S2']]),
  parentById: new Map(),
  roleById: new Map([['device', null], ['slot', 'slot'], ['switch', null], ['remoteSlot', 'slot'], ['remoteDevice', null]]),
  slotIndexById: new Map(),
  floorById: new Map([['device', 'F1'], ['slot', 'F1'], ['switch', 'F1'], ['remoteSlot', 'F2'], ['remoteDevice', 'F2']]),
} as unknown as TraceGraph);

// ── Fiber: opgw(IN-IN, number null) seed 용 slice fixture ──
const opgwGraph = (): TraceGraph => ({
  assets: [],
  cables: [
    { id: 'opgw', sourceAssetId: 'slot', targetAssetId: 'remoteSlot', sourceRole: 'IN', targetRole: 'IN', number: null, cableType: 'FIBER' },
  ],
  nameById: new Map([['slot', '경로슬롯'], ['remoteSlot', '대국슬롯']]),
  subNameById: new Map(),
  subById: new Map([['slot', 'S1'], ['remoteSlot', 'S2']]),
  parentById: new Map(),
  roleById: new Map([['slot', 'slot'], ['remoteSlot', 'slot']]),
  slotIndexById: new Map(),
  floorById: new Map([['slot', 'F1'], ['remoteSlot', 'F2']]),
} as unknown as TraceGraph);

const flatten = (root: { id: string; children: { id: string; children: unknown[] }[] }): string[] => {
  const out: string[] = [];
  const walk = (n: { id: string; children: { id: string; children: unknown[] }[] }) => { out.push(n.id); n.children.forEach((c) => walk(c as never)); };
  walk(root);
  return out;
};

describe('buildInternalPath', () => {
  it('코어패치 클릭: 경로슬롯→설비→광스위치(클라이언트 체인) 전부, 대국/다른코어로 폭발 안 함', () => {
    const r = buildInternalPath('patch', 'F1', patchGraph())!;
    expect(r).not.toBeNull();
    // sw(device↔switch)는 양끝 역할없음=클라이언트 링크 → 하류 체인에 포함(설비 다음 설비/장비까지).
    expect(new Set(flatten(r.tree))).toEqual(new Set(['slot', 'device', 'switch']));
    expect(r.crossed).toBe(true); // OPGW 로 대국(F2) 존재
  });

  it('루트 = 설비 말단(광스위치, 비-slot 끝단): 광스위치 → 송변전광단말 → 경로슬롯 순', () => {
    const r = buildInternalPath('patch', 'F1', patchGraph())!;
    // 컴포넌트 기반 root = 비-slot·비-supplied 끝단 = 광스위치(client). 슬롯은 OPGW 경계라 root 아님.
    expect(r.tree.id).toBe('switch');
    expect(r.tree.children[0].id).toBe('device');            // → 송변전광단말
    expect(r.tree.children[0].children[0].id).toBe('slot');  // → 경로슬롯
  });

  it('sibling 코어(patchX→slotX)는 slice 에 없으므로 내부경로에 노출 안 됨', () => {
    const r = buildInternalPath('patch', 'F1', patchGraph())!;
    expect(flatten(r.tree)).not.toContain('slotX');
  });

  it('OPGW(IN) 클릭: 슬롯 한 칸만(코어로 fan 안 함), crossed=true', () => {
    const r = buildInternalPath('opgw', 'F1', opgwGraph())!;
    expect(r.tree.id).toBe('slot');
    expect(r.tree.children).toEqual([]);
    expect(r.crossed).toBe(true);
  });

  it('선택 케이블 위치: 그 케이블로 들어온 노드의 cableId = 선택 케이블', () => {
    const r = buildInternalPath('patch', 'F1', patchGraph())!;
    // switch(root) → device(sw) → slot(patch). patch 로 들어온 노드 = slot.
    const slot = r.tree.children[0].children[0];
    expect(slot.id).toBe('slot');
    expect(slot.cableId).toBe('patch');
  });

  // 회귀: 한 설비↔슬롯에 코어 여러 개(평행)일 때, 클릭한 케이블이 그 엣지에 실려야 한다.
  // (이전엔 사전순 첫 케이블 #1 이 떠서 #17 클릭이 묻혔다.)
  it('평행 코어: device↔slot 에 #17·#1 둘 다 있어도 #17 클릭 → 그 엣지 cableId=#17', () => {
    const cs = [
      { id: 'p17', sourceAssetId: 'slot', targetAssetId: 'device', sourceRole: 'OUT', targetRole: null, number: 17, cableType: 'FIBER' },
      { id: 'p1', sourceAssetId: 'slot', targetAssetId: 'device', sourceRole: 'OUT', targetRole: null, number: 1, cableType: 'FIBER' },
      { id: 'opgw', sourceAssetId: 'slot', targetAssetId: 'remoteSlot', sourceRole: 'IN', targetRole: 'IN', number: null, cableType: 'FIBER' },
    ];
    const g = (): TraceGraph => ({
      assets: [], cables: cs,
      nameById: new Map([['device', '광단말'], ['slot', '경로슬롯'], ['remoteSlot', '대국슬롯']]),
      subNameById: new Map(),
      subById: new Map([['device', 'S1'], ['slot', 'S1'], ['remoteSlot', 'S2']]),
      parentById: new Map(),
      roleById: new Map([['device', null], ['slot', 'slot'], ['remoteSlot', 'slot']]),
      slotIndexById: new Map(),
      floorById: new Map([['device', 'F1'], ['slot', 'F1'], ['remoteSlot', 'F2']]),
    } as unknown as TraceGraph);
    const r = buildInternalPath('p17', 'F1', g())!;
    // 컴포넌트: nodeSet={slot,device}, crossed=true. root=device(비-slot 끝단), child=slot(엣지=선택 p17 우선)
    expect(r.tree.id).toBe('device');
    expect(r.tree.children[0].id).toBe('slot');
    expect(r.tree.children[0].cableId).toBe('p17'); // 평행 #1 아닌 클릭한 #17 이 엣지에
    expect(r.crossed).toBe(true); // OPGW 로 대국(F2) = 도면 밖
  });

  it('평행 코어 + 도면 scope: #17 클릭 → 경로슬롯→설비 단일, 다른 도면(OPGW 건너) 제외, 선택강조', () => {
    const cs = [
      { id: 'p17', sourceAssetId: 'slot', targetAssetId: 'dev', sourceRole: 'OUT', targetRole: null, number: 17, cableType: 'FIBER' },
      { id: 'p1',  sourceAssetId: 'slot', targetAssetId: 'dev', sourceRole: 'OUT', targetRole: null, number: 1,  cableType: 'FIBER' },
      { id: 'opgw', sourceAssetId: 'slot', targetAssetId: 'rslot', sourceRole: 'IN', targetRole: 'IN', number: null, cableType: 'FIBER' },
    ];
    const g = { assets: [], cables: cs,
      nameById: new Map([['slot', '경로슬롯'], ['dev', '광단말'], ['rslot', '대국슬롯']]),
      subNameById: new Map(), subById: new Map([['slot', 'S1'], ['dev', 'S1'], ['rslot', 'S2']]),
      parentById: new Map(), roleById: new Map([['slot', 'slot'], ['dev', null], ['rslot', 'slot']]),
      slotIndexById: new Map(), floorById: new Map([['slot', 'F1'], ['dev', 'F1'], ['rslot', 'F2']]),
    } as any;
    const r = buildInternalPath('p17', 'F1', g)!; // localDrawingId=F1
    const flat: string[] = []; const walk = (n: any) => { flat.push(n.id); n.children.forEach(walk); }; walk(r.tree);
    expect(new Set(flat)).toEqual(new Set(['slot', 'dev'])); // 도면 F1만, #1 평행/대국(F2) 제외
    expect(r.tree.id).toBe('dev');                           // root=설비(비-slot 끝단)
    const slot = r.tree.children[0]; expect(slot.id).toBe('slot'); expect(slot.cableId).toBe('p17'); // 선택 #17 엣지
    expect(r.crossed).toBe(true);                            // OPGW로 다른 도면(F2) 존재
  });
});

// 전원(실제 (구)춘천 모양): 충전기·UPS 전부 passive(=피더 아님).
// 충전기 ─c1(OUT:null)─ UPS-1 ─c2(OUT:IN)─ UPS ─out1(OUT,#1)─ 단말1, ─out2(OUT,#2)─ 단말2
// 역할이 있어야 slice 가 방향 따라 하류로 전파됨.

// seed=c1(trunk): slice가 전체 하류 탐색 → charger→ups1→ups→{load1,load2}
const powerCables = [
  { id: 'c1', sourceAssetId: 'charger', targetAssetId: 'ups1', sourceRole: 'OUT', targetRole: null, number: null, cableType: 'POWER' },
  { id: 'c2', sourceAssetId: 'ups1', targetAssetId: 'ups', sourceRole: 'OUT', targetRole: 'IN', number: null, cableType: 'POWER' },
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
  roleById: new Map([['charger', null], ['ups1', null], ['ups', null], ['load1', null], ['load2', null]]),
  slotIndexById: new Map(),
  floorById: new Map([['charger', 'F1'], ['ups1', 'F1'], ['ups', 'F1'], ['load1', 'F1'], ['load2', 'F1']]),
} as unknown as TraceGraph);

// seed=out1(#1 branch): slice upstream → charger, downstream → load1 only (out2/load2는 sibling core).
const out1Cables = [
  { id: 'c1', sourceAssetId: 'charger', targetAssetId: 'ups1', sourceRole: 'OUT', targetRole: null, number: null, cableType: 'POWER' },
  { id: 'c2', sourceAssetId: 'ups1', targetAssetId: 'ups', sourceRole: 'OUT', targetRole: 'IN', number: null, cableType: 'POWER' },
  { id: 'out1', sourceAssetId: 'ups', targetAssetId: 'load1', sourceRole: 'OUT', targetRole: null, number: 1, cableType: 'POWER' },
];
const out1Graph = (): TraceGraph => ({
  assets: [],
  cables: out1Cables,
  nameById: new Map([['charger', '충전기'], ['ups1', 'UPS-1'], ['ups', 'UPS'], ['load1', '단말1']]),
  subNameById: new Map(),
  subById: new Map([['charger', 'S1'], ['ups1', 'S1'], ['ups', 'S1'], ['load1', 'S1']]),
  parentById: new Map(),
  roleById: new Map([['charger', null], ['ups1', null], ['ups', null], ['load1', null]]),
  slotIndexById: new Map(),
  floorById: new Map([['charger', 'F1'], ['ups1', 'F1'], ['ups', 'F1'], ['load1', 'F1']]),
} as unknown as TraceGraph);

describe('buildInternalPath — 전원', () => {
  it('루트 = 충전기(공급 안 받는 끝). UPS-1 에서 분기처럼 보이지 않고 충전기→UPS-1→UPS 직렬', () => {
    // 충전기-UPS-1(c1) 클릭 — slice root=charger, 전 노드 F1 → nodeSet=전부, crossed=false
    const r = buildInternalPath('c1', 'F1', powerGraph())!;
    expect(r.tree.id).toBe('charger');                       // 충전기부터 직렬
    expect(r.tree.children.map((n) => n.id)).toEqual(['ups1']); // 충전기는 분기 아님 — UPS-1 한 줄
    expect(r.tree.children[0].children.map((n) => n.id)).toEqual(['ups']); // → UPS
    const branch = r.tree.children[0].children[0].children;   // UPS 에서만 병렬 2개
    expect(branch.map((n) => n.id).sort()).toEqual(['load1', 'load2']);
  });

  it('OUT 케이블(분기 이후) 클릭: 충전기 → … → 그 단말 직렬 1개(다른 OUT 배제)', () => {
    const r = buildInternalPath('out1', 'F1', out1Graph())!;
    const ids = flatten(r.tree);
    expect(r.tree.id).toBe('charger');     // 여전히 충전기 시작
    expect(ids).toContain('load1');
    expect(ids).not.toContain('load2');    // 병렬 형제(sibling core) 는 서버 slice 에 없음
  });
});

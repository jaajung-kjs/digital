import { describe, it, expect } from 'vitest';
import { buildConnectionDiagram, type DiagramNode } from './connectionDiagram';
import { buildTraceGraph } from '../trace/traceGraph';
import type { Asset } from '../../types/asset';

const catGroupOf = (c: { cableType?: string | null }) => {
  const t = c.cableType ?? '';
  if (t === 'FIBER') return { key: '광', label: '광', color: '#22c55e' };
  if (t === 'LAN') return { key: '네트워크', label: '네트워크', color: '#3b82f6' };
  if (t === 'GROUND') return { key: '접지', label: '접지', color: '#eab308' };
  return { key: '전원', label: '전원', color: '#ef4444' };
};

type Slim = Parameters<typeof buildTraceGraph>[0]['slimAssets'][number];
const A = (id: string, name: string, kind: Slim['connectionKind'], sub = 'subL', parent: string | null = null, code: string | null = null): Slim =>
  ({ id, name, substationId: sub, substationName: sub, parentAssetId: parent, connectionKind: kind, code });
const As = (id: string, name: string, parent: string | null, opts: Partial<{ connectionKind: string; placementKind: string; code: string }> = {}): Asset =>
  ({ id, name, parentAssetId: parent, assetType: { connectionKind: opts.connectionKind ?? null, placementKind: opts.placementKind ?? null, code: opts.code ?? null } } as unknown as Asset);

const p1Slim = [
  A('chg', '충전기', 'distributor'), A('ups', 'UPS', 'distributor'),
  A('dist', '분전반', null, 'subL', null, 'DIST'), A('fA', '피더A', 'distributor', 'subL', 'dist'), A('fB', '피더B', 'distributor', 'subL', 'dist'),
  A('t1', '단말1', null), A('t2', '단말2', null), A('t3', '단말3', null),
];
const p1Assets = [
  As('chg', '충전기', null, { connectionKind: 'distributor' }), As('ups', 'UPS', null, { connectionKind: 'distributor' }),
  As('dist', '분전반', null, { placementKind: 'DIST' }), As('fA', '피더A', 'dist', { connectionKind: 'distributor' }), As('fB', '피더B', 'dist', { connectionKind: 'distributor' }),
  As('t1', '단말1', null), As('t2', '단말2', null), As('t3', '단말3', null),
];
const p1Cables = [
  { id: 'c1', cableType: 'AC', sourceAssetId: 'chg', targetAssetId: 'ups', sourceRole: 'OUT', targetRole: 'IN' },
  { id: 'c2', cableType: 'AC', sourceAssetId: 'ups', targetAssetId: 'fA', sourceRole: 'OUT', targetRole: 'IN' },
  { id: 'c3', cableType: 'AC', sourceAssetId: 'ups', targetAssetId: 'fB', sourceRole: 'OUT', targetRole: 'IN' },
  { id: 'c4', cableType: 'AC', sourceAssetId: 'fA', targetAssetId: 't1', sourceRole: 'OUT', targetRole: null },
  { id: 'c5', cableType: 'AC', sourceAssetId: 'fA', targetAssetId: 't2', sourceRole: 'OUT', targetRole: null },
  { id: 'c6', cableType: 'AC', sourceAssetId: 'fB', targetAssetId: 't3', sourceRole: 'OUT', targetRole: null },
];
const p1Graph = buildTraceGraph({ slimAssets: p1Slim, globalCables: p1Cables, stagedAssets: [], stagedCables: [], deletes: [] });

const flatten = (n: DiagramNode, prefix = ''): string[] => {
  const here = prefix ? `${prefix}>${n.label}` : n.label;
  if (!n.children.length) return [here];
  return n.children.flatMap((c) => flatten(c, here));
};
function flattenNodes(n: DiagramNode): DiagramNode[] { return [n, ...n.children.flatMap(flattenNodes)]; }
const rootOf = (assetId: string, graph = p1Graph, assets = p1Assets) =>
  buildConnectionDiagram({ graph, assets, assetId, categoryGroupOf: catGroupOf })[0].components[0].root;

const fiberSlim = [
  A('ofd', 'OFD', null, 'subL', null, 'OFD'), A('slot', '남춘천', 'conduit', 'subL', 'ofd', 'OFD-SLOT'),
  A('rofd', '원격OFD', null, 'subR', null, 'OFD'), A('rslot', '춘천', 'conduit', 'subR', 'rofd', 'OFD-SLOT'),
  A('o1', '단말광1', null), A('o2', '단말광2', null),
  A('ro1', '대국단말1', null, 'subR'), A('ro2', '대국단말2', null, 'subR'), // 대국 단말(완전 연결)
];
const fiberAssets = [
  As('ofd', 'OFD', null, { placementKind: 'OFD', code: 'OFD' }), As('slot', '남춘천', 'ofd', { connectionKind: 'conduit' }),
  As('o1', '단말광1', null), As('o2', '단말광2', null), As('ro1', '대국단말1', null), As('ro2', '대국단말2', null),
];
const fiberCables = [
  { id: 'f1', cableType: 'FIBER', sourceAssetId: 'slot', targetAssetId: 'o1', sourceRole: 'OUT', targetRole: null, number: 1 },
  { id: 'f2', cableType: 'FIBER', sourceAssetId: 'slot', targetAssetId: 'o2', sourceRole: 'OUT', targetRole: null, number: 2 },
  { id: 'fopgw', cableType: 'FIBER', sourceAssetId: 'slot', targetAssetId: 'rslot', sourceRole: 'IN', targetRole: 'IN' },
  { id: 'fr1', cableType: 'FIBER', sourceAssetId: 'rslot', targetAssetId: 'ro1', sourceRole: 'OUT', targetRole: null, number: 1 }, // 대국 #1 단말
  { id: 'fr2', cableType: 'FIBER', sourceAssetId: 'rslot', targetAssetId: 'ro2', sourceRole: 'OUT', targetRole: null, number: 2 }, // 대국 #2 단말
];
const fiberGraph = buildTraceGraph({ slimAssets: fiberSlim, globalCables: fiberCables, stagedAssets: [], stagedCables: [], deletes: [] });

describe('buildConnectionDiagram', () => {
  it('P1 단말1 관점: 충전기(원점) 루트지만 내 공급경로만(가지치기) — 형제 단말2·단말3 제거', () => {
    const groups = buildConnectionDiagram({ graph: p1Graph, assets: p1Assets, assetId: 't1', categoryGroupOf: catGroupOf });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('전원');
    const root = groups[0].components[0].root;
    expect(root.label).toBe('충전기');
    expect(root.isOrigin).toBe(true);
    expect(flatten(root)).toEqual(['충전기>UPS>피더A>단말1']); // 내 경로만
    expect(flattenNodes(root).find((n) => n.label === '단말1')!.isSelf).toBe(true);
    // 표시집합(하이라이트 대상)도 내 경로만 — 형제 제외.
    expect(new Set(groups[0].components[0].nodeIds)).toEqual(new Set(['chg', 'ups', 'fA', 't1']));
  });
  it('P1 관점별 가지치기: 충전기·UPS=전체, 피더A=내하위만, 단말1=내경로만 (강조만 다름)', () => {
    const shape = (id: string) => flatten(rootOf(id)).sort();
    const full = ['충전기>UPS>피더A>단말1', '충전기>UPS>피더A>단말2', '충전기>UPS>피더B>단말3'].sort();
    expect(shape('chg')).toEqual(full);
    expect(shape('ups')).toEqual(full);                                                  // 상류 = 전체 동일
    expect(shape('fA')).toEqual(['충전기>UPS>피더A>단말1', '충전기>UPS>피더A>단말2'].sort()); // 피더A = 내하위(피더B 제거)
    expect(flatten(rootOf('t1'))).toEqual(['충전기>UPS>피더A>단말1']);                     // 단말 = 내경로
    const selfLabel = (id: string) => flattenNodes(rootOf(id)).filter((n) => n.isSelf).map((n) => n.label).sort();
    expect(selfLabel('chg')).toEqual(['충전기']);
    expect(selfLabel('t1')).toEqual(['단말1']);
  });
  it('실데이터형: 입력 케이블 공급측 역할이 NULL 이어도 충전기를 원점으로(입력이 분기로 안 보임)', () => {
    // 입력: DC48V=IN, 충전기=NULL(공급측 무역할). 출력: DC48V=OUT, 부하=NULL.
    const slim = [
      A('chg', '충전기', 'distributor'), A('dc', 'DC48V', 'distributor'),
      A('pdc', '전원DC', null), A('term', '통합단말', null),
    ];
    const assets = [
      As('chg', '충전기', null, { connectionKind: 'distributor' }), As('dc', 'DC48V', null, { connectionKind: 'distributor' }),
      As('pdc', '전원DC', null), As('term', '통합단말', null),
    ];
    const cables = [
      { id: 'in', cableType: 'AC', sourceAssetId: 'dc', targetAssetId: 'chg', sourceRole: 'IN', targetRole: null },
      { id: 'o1', cableType: 'AC', sourceAssetId: 'dc', targetAssetId: 'pdc', sourceRole: 'OUT', targetRole: null },
      { id: 'o2', cableType: 'AC', sourceAssetId: 'dc', targetAssetId: 'term', sourceRole: 'OUT', targetRole: null },
    ];
    const g = buildTraceGraph({ slimAssets: slim, globalCables: cables, stagedAssets: [], stagedCables: [], deletes: [] });
    const root = buildConnectionDiagram({ graph: g, assets, assetId: 'dc', categoryGroupOf: catGroupOf })[0].components[0].root;
    expect(root.label).toBe('충전기');   // 충전기가 원점(루트) — 입력이 분기로 안 보임
    expect(root.isOrigin).toBe(true);
    expect(flatten(root).sort()).toEqual(['충전기>DC48V>전원DC', '충전기>DC48V>통합단말'].sort());
  });
  it('P4 네트워크 무방향: 원점 없음 → 자기(설비3) 루트, 양방향 분기', () => {
    const slim = [A('n1', '설비1', null), A('n2', '설비2', null), A('n3', '설비3', null), A('n4', '설비4', null)];
    const assets = [As('n1', '설비1', null), As('n2', '설비2', null), As('n3', '설비3', null), As('n4', '설비4', null)];
    const cables = [
      { id: 'e1', cableType: 'LAN', sourceAssetId: 'n1', targetAssetId: 'n2' },
      { id: 'e2', cableType: 'LAN', sourceAssetId: 'n2', targetAssetId: 'n3' },
      { id: 'e3', cableType: 'LAN', sourceAssetId: 'n3', targetAssetId: 'n4' },
    ];
    const g = buildTraceGraph({ slimAssets: slim, globalCables: cables, stagedAssets: [], stagedCables: [], deletes: [] });
    const root = buildConnectionDiagram({ graph: g, assets, assetId: 'n3', categoryGroupOf: catGroupOf })[0].components[0].root;
    expect(root.label).toBe('설비3');
    expect(root.isOrigin).toBe(false);
    expect(flatten(root).sort()).toEqual(['설비3>설비2>설비1', '설비3>설비4'].sort());
  });
  it('P3 광 단말: 원점 없음 → 자기 루트, 슬롯은 boundary(대국) leaf', () => {
    const root = buildConnectionDiagram({ graph: fiberGraph, assets: fiberAssets, assetId: 'o1', categoryGroupOf: catGroupOf })[0].components[0].root;
    expect(root.label).toBe('단말광1');
    expect(root.children).toHaveLength(1);
    const slot = root.children[0];
    expect(slot.kind).toBe('boundary');
    expect(slot.children).toHaveLength(0);
    expect(slot.label).toBe('subL - subR'); // 경계 라벨 = 로컬변전소 - 대국변전소(OPGW 링크)
  });
  it('P3 광 OFD: 코어(포트)별 회로 분리 — 단말광1·단말광2 가 별도 컴포넌트(같은 슬롯이라도 코어 다르면 분리)', () => {
    const comps = buildConnectionDiagram({ graph: fiberGraph, assets: fiberAssets, assetId: 'ofd', categoryGroupOf: catGroupOf })[0].components;
    expect(comps).toHaveLength(2); // 코어 #1·#2 = 별도 회로(채널 격리)
    expect(comps.every((c) => c.root.kind === 'boundary')).toBe(true); // 각 루트=슬롯(대국 경계)
    expect(comps.flatMap((c) => flatten(c.root).map((s) => s.split('>').pop())).sort()).toEqual(['단말광1', '단말광2']);
  });
  it('편도(대국 단말 없음): 실제 케이블 존재 → 연결도(로컬)엔 자국까지 표시 — 끊긴 대국 제외는 토폴로지 전담', () => {
    const slim = [A('slot', '남춘천', 'conduit', 'subL', null, 'OFD-SLOT'), A('rslot', '춘천', 'conduit', 'subR', null, 'OFD-SLOT'), A('o1', '단말광1', null)];
    const assets = [As('slot', '남춘천', null, { connectionKind: 'conduit' }), As('o1', '단말광1', null)];
    const cables = [
      { id: 'f1', cableType: 'FIBER', sourceAssetId: 'slot', targetAssetId: 'o1', sourceRole: 'OUT', targetRole: null, number: 1 },
      { id: 'fopgw', cableType: 'FIBER', sourceAssetId: 'slot', targetAssetId: 'rslot', sourceRole: 'IN', targetRole: 'IN' },
    ];
    const g = buildTraceGraph({ slimAssets: slim, globalCables: cables, stagedAssets: [], stagedCables: [], deletes: [] });
    // o1 → slot → opgw → rslot(대국 단말 없음). 대국 설비가 없어도 자국 케이블(f1)은 실재 →
    // 연결도엔 단말광1 → 자국(슬롯=대국 경계)까지 표시. 죽은 대국(rslot/fopgw)은 트리에서 제외,
    // nodeIds=자국 단말+슬롯만 → 도면 하이라이트도 자국 경로. (편도 제거는 projectTrace 토폴로지 전담)
    const groups = buildConnectionDiagram({ graph: g, assets, assetId: 'o1', categoryGroupOf: catGroupOf });
    expect(groups).toHaveLength(1);
    const comp = groups[0].components[0];
    expect(comp.root.label).toBe('단말광1');             // 자국 단말이 self 루트
    expect(comp.root.children[0].kind).toBe('boundary');  // 슬롯=대국 경계 leaf (자국까지만)
    expect(new Set(comp.nodeIds)).toEqual(new Set(['o1', 'slot'])); // 하이라이트=자국 단말+슬롯, 죽은 대국 제외
    expect(comp.cableIds).toEqual(['f1']);                // OPGW(fopgw)는 트리/하이라이트에서 빠짐
  });
  it('core: 슬롯/OFD 회로=닿는 코어번호, 피더 다분기=null', () => {
    // (a) OFD 관점: 코어#1·#2 = 별도 회로 → 각 컴포넌트 core = 그 코어번호.
    const comps = buildConnectionDiagram({ graph: fiberGraph, assets: fiberAssets, assetId: 'ofd', categoryGroupOf: catGroupOf })[0].components;
    expect(comps.map((c) => c.core).sort()).toEqual([1, 2]);

    // (b) 피더 다분기: 입력 + 서로 다른 number 의 OUT 2개 → 한 컴포넌트, core=null.
    const slim = [A('fA', '피더A', 'distributor'), A('src', '공급원', null), A('t1', '단말1', null), A('t2', '단말2', null)];
    const assets = [As('fA', '피더A', null, { connectionKind: 'distributor' }), As('src', '공급원', null), As('t1', '단말1', null), As('t2', '단말2', null)];
    const cables = [
      { id: 'in', cableType: 'AC', sourceAssetId: 'src', targetAssetId: 'fA', sourceRole: 'OUT', targetRole: 'IN' },
      { id: 'b1', cableType: 'AC', sourceAssetId: 'fA', targetAssetId: 't1', sourceRole: 'OUT', targetRole: null, number: 1 },
      { id: 'b2', cableType: 'AC', sourceAssetId: 'fA', targetAssetId: 't2', sourceRole: 'OUT', targetRole: null, number: 2 },
    ];
    const g = buildTraceGraph({ slimAssets: slim, globalCables: cables, stagedAssets: [], stagedCables: [], deletes: [] });
    const fComps = buildConnectionDiagram({ graph: g, assets, assetId: 'fA', categoryGroupOf: catGroupOf })[0].components;
    expect(fComps).toHaveLength(1);
    expect(fComps[0].core).toBe(null);
  });
  it('P5 같은 두 끝에 전원+접지 → 종류가 달라 2그룹', () => {
    const cables = [
      { id: 'g1', cableType: 'AC', sourceAssetId: 'fA', targetAssetId: 't1', sourceRole: 'OUT', targetRole: null },
      { id: 'g2', cableType: 'GROUND', sourceAssetId: 'fA', targetAssetId: 't1', sourceRole: 'OUT', targetRole: null },
    ];
    const slim = [A('fA', '피더A', 'distributor'), A('t1', '단말1', null)];
    const assets = [As('fA', '피더A', null, { connectionKind: 'distributor' }), As('t1', '단말1', null)];
    const g = buildTraceGraph({ slimAssets: slim, globalCables: cables, stagedAssets: [], stagedCables: [], deletes: [] });
    const groups = buildConnectionDiagram({ graph: g, assets, assetId: 't1', categoryGroupOf: catGroupOf });
    expect(groups.map((x) => x.key).sort()).toEqual(['전원', '접지']);
  });
});

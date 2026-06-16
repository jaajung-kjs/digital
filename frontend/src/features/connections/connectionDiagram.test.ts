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
];
const fiberAssets = [
  As('ofd', 'OFD', null, { placementKind: 'OFD', code: 'OFD' }), As('slot', '남춘천', 'ofd', { connectionKind: 'conduit' }),
  As('o1', '단말광1', null), As('o2', '단말광2', null),
];
const fiberCables = [
  { id: 'f1', cableType: 'FIBER', sourceAssetId: 'slot', targetAssetId: 'o1', sourceRole: 'OUT', targetRole: null, number: 1 },
  { id: 'f2', cableType: 'FIBER', sourceAssetId: 'slot', targetAssetId: 'o2', sourceRole: 'OUT', targetRole: null, number: 2 },
  { id: 'fopgw', cableType: 'FIBER', sourceAssetId: 'slot', targetAssetId: 'rslot', sourceRole: 'IN', targetRole: 'IN' },
];
const fiberGraph = buildTraceGraph({ slimAssets: fiberSlim, globalCables: fiberCables, stagedAssets: [], stagedCables: [], deletes: [] });

describe('buildConnectionDiagram', () => {
  it('P1 전력 다단: 충전기(원점) 루트, 분배 분기 — 단말1 관점', () => {
    const groups = buildConnectionDiagram({ graph: p1Graph, assets: p1Assets, assetId: 't1', categoryGroupOf: catGroupOf });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('전원');
    const root = groups[0].components[0].root;
    expect(root.label).toBe('충전기');
    expect(root.isOrigin).toBe(true);
    expect(flatten(root).sort()).toEqual(['충전기>UPS>피더A>단말1', '충전기>UPS>피더A>단말2', '충전기>UPS>피더B>단말3'].sort());
    const t1 = flattenNodes(root).find((n) => n.label === '단말1')!;
    expect(t1.isSelf).toBe(true);
  });
  it('P1 다관점 동일성: 충전기/피더/단말 누가 봐도 같은 트리(강조만 다름)', () => {
    const fromT1 = rootOf('t1'); const fromChg = rootOf('chg'); const fromFA = rootOf('fA');
    const shape = (r: DiagramNode) => flatten(r).sort();
    expect(shape(fromChg)).toEqual(shape(fromT1));
    expect(shape(fromFA)).toEqual(shape(fromT1));
    const selfLabel = (r: DiagramNode) => flattenNodes(r).filter((n) => n.isSelf).map((n) => n.label);
    expect(selfLabel(fromChg)).toEqual(['충전기']);
    expect(selfLabel(fromT1)).toEqual(['단말1']);
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
  });
  it('P3 광 OFD(슬롯) 관점: 슬롯 루트 → 단말광1·단말광2 분기', () => {
    const root = buildConnectionDiagram({ graph: fiberGraph, assets: fiberAssets, assetId: 'ofd', categoryGroupOf: catGroupOf })[0].components[0].root;
    expect(root.kind).toBe('boundary');
    expect(flatten(root).map((s) => s.split('>').pop()).sort()).toEqual(['단말광1', '단말광2']);
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

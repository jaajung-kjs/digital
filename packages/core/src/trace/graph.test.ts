import { describe, expect, it } from 'vitest';
import type { AssetRef, AssetTypeSpec, CableRef, PortRef } from '../catalog/types.js';
import { instantiatePorts } from '../catalog/instantiatePorts.js';
import { buildTraceGraph, traceFrom } from './graph.js';

const device: AssetTypeSpec = {
  key: 'DEV',
  name: '장비',
  categoryKey: '통신',
  sortOrder: 1,
  placement: { placeable: true },
  labor: { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 },
  fields: [],
  containers: [],
  ports: [{ group: 'P', count: 2, direction: 'BI', medium: '광', namePattern: '포트 {n}' }],
  links: [], // 내부 통과 없음 → 추적 종단
};

const slot: AssetTypeSpec = {
  ...device,
  key: 'OFD-SLOT',
  name: '광슬롯',
  ports: [
    { group: 'A', count: 4, direction: 'BI', medium: '광', namePattern: '장비 {n}' },
    { group: 'B', count: 4, direction: 'BI', medium: '광', namePattern: '선로 {n}' },
  ],
  links: [{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
};

const feeder: AssetTypeSpec = {
  ...device,
  key: 'FEEDER',
  name: '피더',
  ports: [
    { group: 'IN', count: 1, direction: 'IN', medium: '전원', namePattern: 'IN' },
    { group: 'OUT', count: 1, direction: 'OUT', medium: '전원', namePattern: 'OUT' },
  ],
  links: [{ fromGroup: 'IN', toGroup: 'OUT', mapping: 'all' }],
};

const types = { DEV: device, 'OFD-SLOT': slot, FEEDER: feeder };

/** 헬퍼: 자산 + 포트 인스턴스 생성 (포트 id = `${assetId}:${group}${index}`) */
function makeAsset(typeKey: keyof typeof types, id: string): { asset: AssetRef; ports: PortRef[] } {
  const asset: AssetRef = { id, typeKey, name: id };
  const ports = instantiatePorts(types[typeKey], id).map((p) => ({
    ...p,
    id: `${id}:${p.group}${p.index}`,
  }));
  return { asset, ports };
}

describe('buildTraceGraph + traceFrom', () => {
  it('광슬롯 byIndex: 장비→슬롯 장비3→선로3→대국 장비까지 채널 보존 추적', () => {
    const a = makeAsset('DEV', 'devA');
    const s = makeAsset('OFD-SLOT', 'slot1');
    const b = makeAsset('DEV', 'devB');
    const cables: CableRef[] = [
      { id: 'c1', aPortId: 'devA:P1', bPortId: 'slot1:A3' },
      { id: 'c2', aPortId: 'slot1:B3', bPortId: 'devB:P1' },
    ];
    const graph = buildTraceGraph({
      types,
      assets: [a.asset, s.asset, b.asset],
      ports: [...a.ports, ...s.ports, ...b.ports],
      cables,
    });
    expect(graph.ports.get('slot1:A3')?.name).toBe('장비 3');
    const hops = traceFrom(graph, 'devA:P1');
    expect(hops).toEqual([
      { kind: 'cable', cableId: 'c1', fromPortId: 'devA:P1', toPortId: 'slot1:A3' },
      { kind: 'internal', fromPortId: 'slot1:A3', toPortId: 'slot1:B3' },
      { kind: 'cable', cableId: 'c2', fromPortId: 'slot1:B3', toPortId: 'devB:P1' },
    ]);
  });

  it('byIndex는 다른 채널로 새지 않는다 (A3 → B4 없음)', () => {
    const s = makeAsset('OFD-SLOT', 'slot1');
    const graph = buildTraceGraph({ types, assets: [s.asset], ports: s.ports, cables: [] });
    const hops = traceFrom(graph, 'slot1:A3');
    expect(hops).toEqual([{ kind: 'internal', fromPortId: 'slot1:A3', toPortId: 'slot1:B3' }]);
  });

  it('피더 all 매핑: IN→OUT 패스스루 후 하류 케이블 추적', () => {
    const f = makeAsset('FEEDER', 'fdr1');
    const d = makeAsset('DEV', 'load1');
    const powerDev = { ...d, ports: d.ports.map((p) => ({ ...p, medium: '전원' })) };
    const cables: CableRef[] = [{ id: 'c1', aPortId: 'fdr1:OUT1', bPortId: 'load1:P1' }];
    const graph = buildTraceGraph({
      types,
      assets: [f.asset, d.asset],
      ports: [...f.ports, ...powerDev.ports],
      cables,
    });
    const hops = traceFrom(graph, 'fdr1:IN1');
    expect(hops).toEqual([
      { kind: 'internal', fromPortId: 'fdr1:IN1', toPortId: 'fdr1:OUT1' },
      { kind: 'cable', cableId: 'c1', fromPortId: 'fdr1:OUT1', toPortId: 'load1:P1' },
    ]);
  });

  it('links 없는 장비는 종단 — 다른 포트로 새지 않는다', () => {
    const a = makeAsset('DEV', 'devA');
    const b = makeAsset('DEV', 'devB');
    const c = makeAsset('DEV', 'devC');
    const cables: CableRef[] = [
      { id: 'c1', aPortId: 'devA:P1', bPortId: 'devB:P1' },
      { id: 'c2', aPortId: 'devB:P2', bPortId: 'devC:P1' }, // devB의 다른 포트
    ];
    const graph = buildTraceGraph({
      types,
      assets: [a.asset, b.asset, c.asset],
      ports: [...a.ports, ...b.ports, ...c.ports],
      cables,
    });
    const hops = traceFrom(graph, 'devA:P1');
    expect(hops).toEqual([{ kind: 'cable', cableId: 'c1', fromPortId: 'devA:P1', toPortId: 'devB:P1' }]);
  });

  it('역방향 추적도 동일 그래프로 동작한다 (B측에서 시작)', () => {
    const a = makeAsset('DEV', 'devA');
    const s = makeAsset('OFD-SLOT', 'slot1');
    const cables: CableRef[] = [{ id: 'c1', aPortId: 'devA:P1', bPortId: 'slot1:A2' }];
    const graph = buildTraceGraph({ types, assets: [a.asset, s.asset], ports: [...a.ports, ...s.ports], cables });
    const hops = traceFrom(graph, 'slot1:B2');
    expect(hops).toEqual([
      { kind: 'internal', fromPortId: 'slot1:B2', toPortId: 'slot1:A2' },
      { kind: 'cable', cableId: 'c1', fromPortId: 'slot1:A2', toPortId: 'devA:P1' },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import type { AssetRef, AssetTypeSpec, CableRef, PortRef } from '../catalog/types.js';
import { instantiatePorts } from '../catalog/instantiatePorts.js';
import { buildTraceGraph, traceFrom } from './graph.js';

const device: AssetTypeSpec = {
  key: 'DEV',
  name: '장비',
  categoryKey: '통신',
  sortOrder: 1,
  labor: { laborCode: null, installManDays: 0, removeManDays: 0, relocateManDays: 0 },
  fields: [],
  containers: [],
  // 방향을 따지지 않는 종류라 내부 통과가 유도되지 않는다 → 추적 종단
  ports: [{ group: 'P', count: 2, direction: 'BI', medium: 'fiber', namePattern: '포트 {n}' }],
};

const slot: AssetTypeSpec = {
  ...device,
  key: 'OFD-SLOT',
  name: '광슬롯',
  /* 성단 판 — 인입 한 가닥(4심)이 앞면 4포트로 펼쳐진다. 통과는 선언하지 않는다:
     다심 인입이 앞면으로 나오는 것은 판의 생김새라 포트 선언에서 그대로 나온다. */
  ports: [
    { group: 'A', count: 4, direction: 'BI', medium: 'fiber', namePattern: '장비 {n}' },
    { group: 'B', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 4 },
  ],
};

const feeder: AssetTypeSpec = {
  ...device,
  key: 'FEEDER',
  name: '피더',
  ports: [
    { group: 'IN', count: 1, direction: 'IN', medium: 'power', namePattern: 'IN' },
    { group: 'OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: 'OUT' },
  ],
};

const types = { DEV: device, 'OFD-SLOT': slot, FEEDER: feeder };

/** 헬퍼: 자산 + 포트 인스턴스 생성 (포트 id = `${assetId}:${group}${index}`) */
function makeAsset(typeKey: keyof typeof types, id: string): { asset: AssetRef; ports: PortRef[] } {
  const asset: AssetRef = { id, typeKey, name: id };
  const ports = instantiatePorts(types[typeKey]!.ports, id).map((p) => ({
    ...p,
    id: `${id}:${p.group}${p.index}`,
  }));
  return { asset, ports };
}

describe('buildTraceGraph + traceFrom', () => {
  it('경로슬롯: 장비3 → 인입 → 대국 인입 → 대국 장비3 까지 코어 보존 추적', () => {
    const a = makeAsset('DEV', 'devA');
    const s = makeAsset('OFD-SLOT', 'slot1');
    const b = makeAsset('DEV', 'devB');
    const cables: CableRef[] = [
      { id: 'c1', aPortId: 'devA:P1', bPortId: 'slot1:A3' },
      { id: 'c2', aPortId: 'slot1:B1', bPortId: 'devB:P1' },
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
      { kind: 'internal', fromPortId: 'slot1:A3', toPortId: 'slot1:B1' },
      { kind: 'cable', cableId: 'c2', fromPortId: 'slot1:B1', toPortId: 'devB:P1' },
    ]);
  });

  /* 인입을 포트 하나로 접으면 그 포트는 앞면 4포트와 모두 이어진다. 코어 번호를 들고
     다니지 않으면 추적이 코어 3으로 들어가 코어 1로 나오는, 실제로는 없는 길을 찾아 낸다. */
  it('다심 인입을 지나도 코어를 가로지르지 않는다 (장비3 → 장비1 없음)', () => {
    const s = makeAsset('OFD-SLOT', 'slot1');
    const graph = buildTraceGraph({ types, assets: [s.asset], ports: s.ports, cables: [] });
    expect(traceFrom(graph, 'slot1:A3')).toEqual([
      { kind: 'internal', fromPortId: 'slot1:A3', toPortId: 'slot1:B1' },
    ]);
  });

  /* 인입 포트 자체에서 시작하면 들고 갈 번호가 없다 — 그 한 가닥이 나르는 코어 전부가 답이다. */
  it('인입에서 시작하면 코어 전부로 퍼진다', () => {
    const s = makeAsset('OFD-SLOT', 'slot1');
    const graph = buildTraceGraph({ types, assets: [s.asset], ports: s.ports, cables: [] });
    expect(traceFrom(graph, 'slot1:B1').map((h) => h.toPortId))
      .toEqual(['slot1:A1', 'slot1:A2', 'slot1:A3', 'slot1:A4']);
  });

  /**
   * **전원은 흐르는 방향이 있다 — 누른 포트가 묻는 방향을 정한다.**
   *
   * 출력을 누르면 「이 회로가 무엇을 먹이나」(하류), 입력을 누르면 「내 전원이 어디서 오나」
   * (상류)다. 방향을 안 지키면 상류로 거슬러 올라가다 그 반의 **다른 출력들로 되쏟아진다** —
   * 단말 하나에서 추적했는데 그 반이 먹이는 스물세 자산이 다 딸려 나왔다(실측 120홉 → 6홉).
   */
  describe('전원은 누른 포트의 방향으로만 간다', () => {
    /** 상류 반 → 피더 → 부하. 가운데 피더를 두고 양쪽을 본다. */
    const scene = () => {
      const up = makeAsset('FEEDER', 'up');
      const f = makeAsset('FEEDER', 'fdr1');
      const d = makeAsset('DEV', 'load1');
      const powerDev = { ...d, ports: d.ports.map((p) => ({ ...p, medium: 'power', direction: 'IN' as const })) };
      const cables: CableRef[] = [
        { id: 'c0', aPortId: 'up:OUT1', bPortId: 'fdr1:IN1' },
        { id: 'c1', aPortId: 'fdr1:OUT1', bPortId: 'load1:P1' },
      ];
      return buildTraceGraph({
        types,
        assets: [up.asset, f.asset, d.asset],
        ports: [...up.ports, ...f.ports, ...powerDev.ports],
        cables,
      });
    };

    it('출력에서 시작하면 하류로 — 무엇을 먹이나', () => {
      expect(traceFrom(scene(), 'fdr1:OUT1')).toEqual([
        { kind: 'cable', cableId: 'c1', fromPortId: 'fdr1:OUT1', toPortId: 'load1:P1' },
      ]);
    });

    it('입력에서 시작하면 상류로 — 어디서 오나', () => {
      expect(traceFrom(scene(), 'fdr1:IN1')).toEqual([
        { kind: 'cable', cableId: 'c0', fromPortId: 'fdr1:IN1', toPortId: 'up:OUT1' },
        { kind: 'internal', fromPortId: 'up:OUT1', toPortId: 'up:IN1' },
      ]);
    });

    /* 단말의 입력에서 거슬러 올라가도 **그 반의 다른 회로로 새지 않는다**. */
    it('단말에서 거슬러 올라가면 나에게 오는 길 하나뿐이다', () => {
      const hops = traceFrom(scene(), 'load1:P1');
      expect(hops.map((h) => h.toPortId)).toEqual(['fdr1:OUT1', 'fdr1:IN1', 'up:OUT1', 'up:IN1']);
    });
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
    const hops = traceFrom(graph, 'slot1:A2');
    expect(hops).toEqual([
      { kind: 'cable', cableId: 'c1', fromPortId: 'slot1:A2', toPortId: 'devA:P1' },
      { kind: 'internal', fromPortId: 'slot1:A2', toPortId: 'slot1:B1' },
    ]);
  });
});

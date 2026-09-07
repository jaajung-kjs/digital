import { describe, expect, it } from 'vitest';
import type { AssetRef, AssetTypeSpec, CableRef, PortRef } from '../catalog/types.js';
import { instantiatePorts } from '../catalog/instantiatePorts.js';
import { buildTraceGraph, traceFlows, traceFrom } from './graph.js';

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

/** 분전반 — 입력 하나가 출력 둘로 갈린다(같은 데서 먹는 갈래 둘). */
const dist: AssetTypeSpec = {
  ...device,
  key: 'DIST',
  name: '분전반',
  ports: [
    { group: 'IN', count: 1, direction: 'IN', medium: 'power', namePattern: 'IN' },
    { group: 'OUT', count: 2, direction: 'OUT', medium: 'power', namePattern: 'OUT {n}' },
  ],
};

/** 모선 — 갈린 둘이 다시 모인다. */
const bus2: AssetTypeSpec = {
  ...device,
  key: 'BUS2',
  name: '모선',
  ports: [
    { group: 'IN', count: 2, direction: 'IN', medium: 'power', namePattern: 'IN {n}' },
    { group: 'OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: 'OUT' },
  ],
};

const types = { DEV: device, 'OFD-SLOT': slot, FEEDER: feeder, DIST: dist, BUS2: bus2 };

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
      { kind: 'internal', fromPortId: 'slot1:A3', toPortId: 'slot1:B1', core: 3 },
      { kind: 'cable', cableId: 'c2', fromPortId: 'slot1:B1', toPortId: 'devB:P1' },
    ]);
  });

  /* 인입을 포트 하나로 접으면 그 포트는 앞면 4포트와 모두 이어진다. 코어 번호를 들고
     다니지 않으면 추적이 코어 3으로 들어가 코어 1로 나오는, 실제로는 없는 길을 찾아 낸다. */
  it('다심 인입을 지나도 코어를 가로지르지 않는다 (장비3 → 장비1 없음)', () => {
    const s = makeAsset('OFD-SLOT', 'slot1');
    const graph = buildTraceGraph({ types, assets: [s.asset], ports: s.ports, cables: [] });
    expect(traceFrom(graph, 'slot1:A3')).toEqual([
      { kind: 'internal', fromPortId: 'slot1:A3', toPortId: 'slot1:B1', core: 3 },
    ]);
  });

  /**
   * **다심 포트에 닿은 홉은 탄 코어를 적는다** — 그 자리를 부를 이름이 그것뿐이라서.
   *
   * OPGW 는 포트가 하나(늘 1번)다. 그래서 코어 1의 길과 코어 2의 길이 `장비#1` 로 똑같이
   * 적혔고, 화면에서 「1번 포트도 2번 포트도 대국이 같은 1번 포트」로 읽혔다. 자리는 갈렸는데
   * 이름이 겹친 것이다. 홉이 코어를 들고 나오면 화면이 「… 코어 2」로 부를 수 있다.
   */
  it('두 국을 잇는 인입을 건너도 코어 번호를 들고 간다', () => {
    const s1 = makeAsset('OFD-SLOT', 'slot1');
    const s2 = makeAsset('OFD-SLOT', 'slot2');
    const cables: CableRef[] = [{ id: 'opgw', aPortId: 'slot1:B1', bPortId: 'slot2:B1' }];
    const graph = buildTraceGraph({
      types,
      assets: [s1.asset, s2.asset],
      ports: [...s1.ports, ...s2.ports],
      cables,
    });
    expect(traceFrom(graph, 'slot1:A2')).toEqual([
      { kind: 'internal', fromPortId: 'slot1:A2', toPortId: 'slot1:B1', core: 2 },
      { kind: 'cable', cableId: 'opgw', fromPortId: 'slot1:B1', toPortId: 'slot2:B1', core: 2 },
      { kind: 'internal', fromPortId: 'slot2:B1', toPortId: 'slot2:A2' },
    ]);
    // 코어 2의 길과 코어 3의 길은 **같은 OPGW 포트**를 지나지만 서로 다른 코어다.
    expect(traceFrom(graph, 'slot1:A3').map((h) => [h.toPortId, h.core]))
      .toEqual([['slot1:B1', 3], ['slot2:B1', 3], ['slot2:A3', undefined]]);
  });

  /**
   * **국 밖의 자리에도 코어를 적는다** — 거기가 코어가 가장 필요한 곳이라서.
   *
   * 화면이 든 것은 제 변전소의 자산뿐이라, 구간 케이블 건너편 OPGW 는 그래프에 포트로 서지
   * 못한다. 그래서 「다심인가」를 물으면 아니라는 답이 나와 코어가 지워졌고, 대국이 늘
   * `…#1` 로 적혔다 — 코어 1의 길과 코어 2의 길이 글자까지 같아진 자리가 바로 여기다.
   */
  it('국 밖(그래프에 없는) 대국 인입에도 탄 코어가 남는다', () => {
    const s1 = makeAsset('OFD-SLOT', 'slot1');
    const cables: CableRef[] = [{ id: 'opgw', aPortId: 'slot1:B1', bPortId: 'remote:B1' }];
    const graph = buildTraceGraph({ types, assets: [s1.asset], ports: s1.ports, cables });
    expect(traceFrom(graph, 'slot1:A2').map((h) => [h.toPortId, h.core]))
      .toEqual([['slot1:B1', 2], ['remote:B1', 2]]);
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
      { kind: 'internal', fromPortId: 'slot1:A2', toPortId: 'slot1:B1', core: 2 },
    ]);
  });
});

/**
 * **모선에 매달린 축전지** — 방향 없는 자리(`BI`)가 추적을 어떻게 지나는가.
 *
 * 분배부는 직류 입력(정류기에서) · 직류 출력(부하로) · 직류 모선(축전지) 셋을 갖는다.
 * 축전지는 평상시 충전되고 정전이면 공급한다 — **양쪽 다 보여야 한다.**
 *
 * 그러면서 상류 추적이 **형제 회로로 새면 안 된다**. 모선은 출력들과도 통하므로, 방향을
 * 「BI 는 다 통과」로 두면 그 반이 먹이는 출력들이 상류에 딸려 나온다(방향 규칙이 애초에
 * 막던 그 버그다). 방향 없는 끝이 상대의 반대 노릇을 하면 그 길이 저절로 막힌다.
 */
describe('모선 — 방향 없는 자리를 지나는 추적', () => {
  const bus: AssetTypeSpec = {
    ...device,
    key: 'BUS',
    name: '분배부',
    ports: [
      { group: 'IN', count: 1, direction: 'IN', medium: 'power', namePattern: '직류 입력', variant: 'DC' },
      { group: 'OUT', count: 2, direction: 'OUT', medium: 'power', namePattern: '직류 출력 {n}', variant: 'DC' },
      { group: 'BUS', count: 1, direction: 'BI', medium: 'power', namePattern: '직류 모선', variant: 'DC' },
    ],
  };
  const batt: AssetTypeSpec = {
    ...device,
    key: 'BATT',
    name: '축전지',
    ports: [{ group: 'T', count: 1, direction: 'BI', medium: 'power', namePattern: '축전지 단자', variant: 'DC' }],
  };
  const load: AssetTypeSpec = {
    ...device, key: 'LOAD', name: '부하',
    ports: [{ group: 'IN', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' }],
  };
  const rect: AssetTypeSpec = {
    ...device, key: 'RECT', name: '정류기',
    ports: [{ group: 'OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력', variant: 'DC' }],
  };
  const scene = () => {
    const t = { BUS: bus, BATT: batt, LOAD: load, RECT: rect } as unknown as typeof types;
    const mk = (key: string, id: string) => {
      const spec = ({ BUS: bus, BATT: batt, LOAD: load, RECT: rect } as Record<string, AssetTypeSpec>)[key]!;
      return {
        asset: { id, typeKey: key, name: id } as AssetRef,
        ports: instantiatePorts(spec.ports, id).map((q) => ({ ...q, id: `${id}:${q.group}${q.index}` })),
      };
    };
    const b = mk('BUS', 'bus'); const a = mk('BATT', 'batt');
    const l1 = mk('LOAD', 'load1'); const l2 = mk('LOAD', 'load2'); const r = mk('RECT', 'rect');
    const cables: CableRef[] = [
      { id: 'cr', aPortId: 'rect:OUT1', bPortId: 'bus:IN1' },
      { id: 'cb', aPortId: 'bus:BUS1', bPortId: 'batt:T1' },
      { id: 'c1', aPortId: 'bus:OUT1', bPortId: 'load1:IN1' },
      { id: 'c2', aPortId: 'bus:OUT2', bPortId: 'load2:IN1' },
    ];
    return buildTraceGraph({
      types: t,
      assets: [b.asset, a.asset, l1.asset, l2.asset, r.asset],
      ports: [...b.ports, ...a.ports, ...l1.ports, ...l2.ports, ...r.ports],
      cables,
    });
  };

  /** 정전이면 축전지가 공급원이다 — 「내 전원이 어디서 오나」에 나와야 한다. */
  it('상류: 부하에서 거슬러 오르면 정류기와 축전지가 둘 다 나온다', () => {
    const reached = traceFrom(scene(), 'load1:IN1').map((h) => h.toPortId);
    expect(reached).toContain('rect:OUT1');
    expect(reached).toContain('batt:T1');
  });

  /* **이것이 회귀 감시다.** 모선은 형제 출력들과도 통하지만, 거기로 가는 것은 상류가
     아니라 하류다 — 상류 추적에 남의 회로가 딸려 나오면 안 된다. */
  it('상류: 형제 회로로 되쏟아지지 않는다', () => {
    const reached = traceFrom(scene(), 'load1:IN1').map((h) => h.toPortId);
    expect(reached).not.toContain('bus:OUT2');
    expect(reached).not.toContain('load2:IN1');
  });

  /** 평상시에는 정류기가 축전지를 부동충전한다 — 「무엇을 먹이나」에도 나와야 한다. */
  it('하류: 정류기 출력에서 내려가면 부하 둘과 축전지가 다 나온다', () => {
    const reached = traceFrom(scene(), 'rect:OUT1').map((h) => h.toPortId);
    expect(reached).toContain('load1:IN1');
    expect(reached).toContain('load2:IN1');
    expect(reached).toContain('batt:T1');
  });

  /** 축전지 자신을 누르면 방향이 없으니 양쪽으로 퍼진다 — 충전도 방전도 제 일이다. */
  it('축전지 단자에서는 양쪽으로 퍼진다', () => {
    const reached = traceFrom(scene(), 'batt:T1').map((h) => h.toPortId);
    expect(reached).toContain('rect:OUT1');
    expect(reached).toContain('load1:IN1');
  });

  /**
   * **답이 둘인 물음**은 따로 답한다 — 한 그루에 섞으면 공급원과 부하가 형제로 서서
   * 넷이 같은 것처럼 읽힌다.
   */
  it('모선 단자는 질문이 둘, 방향 있는 자리는 하나', () => {
    const g = scene();
    expect(traceFlows(g.ports.get('batt:T1'))).toEqual(['upstream', 'downstream']);
    expect(traceFlows(g.ports.get('load1:IN1'))).toEqual(['upstream']);
    expect(traceFlows(g.ports.get('rect:OUT1'))).toEqual(['downstream']);
  });

  it('질문을 갈라 물으면 나를 먹이는 쪽과 내가 먹이는 쪽이 나뉜다', () => {
    const g = scene();
    const up = traceFrom(g, 'batt:T1', 'upstream').map((h) => h.toPortId);
    const down = traceFrom(g, 'batt:T1', 'downstream').map((h) => h.toPortId);
    /* 나를 먹이는 쪽 — 정류기뿐이다. */
    expect(up).toContain('rect:OUT1');
    expect(up).not.toContain('load1:IN1');
    /* 내가 먹이는 쪽 — 부하뿐이다. */
    expect(down).toContain('load1:IN1');
    expect(down).toContain('load2:IN1');
    expect(down).not.toContain('rect:OUT1');
  });

  /**
   * **묻는 방향이 곧 출발 자리의 방향이다** — 방향 있는 자리가 늘 그러던 것과 같다.
   *
   * 입력을 누르면 제 케이블로 나가지 제 장비 안을 옆으로 헤집지 않는다. 모선 단자에는
   * 선언된 방향이 없어 그 규칙이 빠졌었고, 그래서 단자 하나를 물었는데 모선에 달린 것이
   * 전부 나왔다.
   */
  it('모선 단자를 물으면 제 케이블 건너편만 — 제 모선 안으로 퍼지지 않는다', () => {
    const g = scene();
    /* 분배부의 모선 단자(축전지가 물린 자리). 입력으로 물어도 출력으로 물어도 축전지뿐이다. */
    for (const flow of ['upstream', 'downstream'] as const) {
      const reached = traceFrom(g, 'bus:BUS1', flow).map((h) => h.toPortId);
      expect(reached).toEqual(['batt:T1']);
    }
  });

  /** 한 걸음 건너가면 선언된 방향이 다시 다스린다 — 축전지에서 물으면 모선 너머가 나온다. */
  it('모선을 건너간 뒤부터는 선언된 방향이 다스린다', () => {
    const g = scene();
    const up = traceFrom(g, 'batt:T1', 'upstream').map((h) => h.toPortId);
    expect(up).toContain('bus:BUS1');
    expect(up).toContain('rect:OUT1');
    const down = traceFrom(g, 'batt:T1', 'downstream').map((h) => h.toPortId);
    expect(down).toContain('load1:IN1');
    expect(down).toContain('load2:IN1');
  });

  /**
   * **갈라졌다 다시 모이는 길은 트리가 아니라 DAG 다.**
   *
   * 정류기 둘이 같은 분전반에서 먹고 같은 모선으로 모인다. 걷기는 자리를 한 번만 밟으므로
   * 공유하는 윗동아리(분전반 입력 → 소내)는 먼저 온 갈래가 가져간다 — 그것만 남기면 다른
   * 갈래는 「아무 데서도 안 온다」가 되어, 배선은 맞는데 그림이 거짓말을 한다.
   * 걷지는 않되 **간선은 남긴다**(`revisit`).
   */
  it('같은 데서 먹는 갈래 둘 — 뒤에 온 갈래도 그 자리로 간선이 남는다', () => {
    const src = makeAsset('FEEDER', 'src');
    const d = makeAsset('DIST', 'dist');
    const r1 = makeAsset('FEEDER', 'r1');
    const r2 = makeAsset('FEEDER', 'r2');
    const bus = makeAsset('BUS2', 'bus');
    const load = makeAsset('FEEDER', 'load');
    const cables: CableRef[] = [
      { id: 'c0', aPortId: 'src:OUT1', bPortId: 'dist:IN1' },
      { id: 'c1', aPortId: 'dist:OUT1', bPortId: 'r1:IN1' },
      { id: 'c2', aPortId: 'dist:OUT2', bPortId: 'r2:IN1' },
      { id: 'c3', aPortId: 'r1:OUT1', bPortId: 'bus:IN1' },
      { id: 'c4', aPortId: 'r2:OUT1', bPortId: 'bus:IN2' },
      { id: 'c5', aPortId: 'bus:OUT1', bPortId: 'load:IN1' },
    ];
    const g = buildTraceGraph({
      types,
      assets: [src.asset, d.asset, r1.asset, r2.asset, bus.asset, load.asset],
      ports: [...src.ports, ...d.ports, ...r1.ports, ...r2.ports, ...bus.ports, ...load.ports],
      cables,
    });
    const hops = traceFrom(g, 'load:IN1', 'upstream');
    /* 두 정류기 다 제 출력까지 올라간다. */
    expect(hops.map((h) => h.toPortId)).toEqual(expect.arrayContaining(['r1:OUT1', 'r2:OUT1', 'dist:OUT1', 'dist:OUT2']));
    /* 분전반 입력으로 드는 간선이 **둘** 다 있다 — 하나는 걸어서, 하나는 다시 만나서. */
    const intoDistIn = hops.filter((h) => h.toPortId === 'dist:IN1');
    expect(intoDistIn.map((h) => h.fromPortId).sort()).toEqual(['dist:OUT1', 'dist:OUT2']);
    expect(intoDistIn.filter((h) => h.revisit === true)).toHaveLength(1);
    /* 소내까지는 한 번만 올라간다 — 되풀이해 걷지 않는다. */
    expect(hops.filter((h) => h.toPortId === 'src:OUT1')).toHaveLength(1);
  });

  /** 되짚는 길은 「다시 만났다」가 아니다 — 간선 하나는 한 번만 적는다. */
  it('타고 온 길을 되짚어 다시 적지 않는다', () => {
    const a = makeAsset('DEV', 'devA');
    const b = makeAsset('DEV', 'devB');
    const g = buildTraceGraph({
      types, assets: [a.asset, b.asset], ports: [...a.ports, ...b.ports],
      cables: [{ id: 'c1', aPortId: 'devA:P1', bPortId: 'devB:P1' }],
    });
    /* 광은 양쪽으로 다 열려 있어(`either`) 방향 규칙이 안 막는다 — 간선 표시가 막는다. */
    expect(traceFrom(g, 'devA:P1').filter((h) => h.revisit === true)).toEqual([]);
  });

  /** 광은 상·하류가 없다 — 방향 없는 자리라도 질문은 하나다(어휘가 정한다). */
  it('방향을 따지지 않는 종류는 질문이 하나뿐', () => {
    const s = makeAsset('OFD-SLOT', 'slotX');
    const g = buildTraceGraph({ types, assets: [s.asset], ports: s.ports, cables: [] });
    expect(traceFlows(g.ports.get('slotX:A1'))).toEqual(['both']);
  });
});

import { describe, expect, it } from 'vitest';
import { SEED_ASSEMBLIES, SEED_ASSET_TYPES, SEED_CABLE_GROUPS, SEED_CATEGORIES } from './catalog.js';
import { validateAssembly, type AssemblyLinkSpec } from '../catalog/assembly.js';
import { validateTypeSpec } from '../validation/typeSpec.js';
import { instantiatePorts } from '../catalog/instantiatePorts.js';
import { buildTraceGraph, traceFrom } from '../trace/graph.js';

const CTX = {
  categoryKeys: SEED_CATEGORIES.map((c) => c.key),
  mediumKeys: SEED_CABLE_GROUPS.map((g) => g.key),
};

describe('시드 카탈로그', () => {
  it('장비 품목이 제 어휘 안에서 유효하다', () => {
    for (const t of SEED_ASSET_TYPES) {
      expect({ key: t.key, issues: validateTypeSpec(t, CTX) }).toEqual({ key: t.key, issues: [] });
    }
  });

  /**
   * **설비 품목이 담은 내부 배선이 실제로 이어지는가.**
   *
   * 시드가 적어 둔 배선은 배포 때 그대로 DB 에 들어간다 — 거기서 틀리면 컨테이너가 뜨다가
   * 죽거나(더 나쁘게는) 이을 수 없는 짝이 조용히 실린다. 판정은 케이블을 이을 때와 **같은
   * 함수**(`validateConnection`)가 하므로, 여기서 통과하면 화면에서도 통과한다.
   */
  it('설비 품목의 구성과 내부 배선이 유효하다', () => {
    const typeKeys = new Set(SEED_ASSET_TYPES.map((t) => t.key));
    const portsOf = (key: string) => SEED_ASSET_TYPES.find((t) => t.key === key)?.ports;

    for (const a of SEED_ASSEMBLIES) {
      /* 시드는 항목을 **이름**으로 가리킨다(id 가 없다) — 판정에 넣으려면 id 를 붙인다.
         서버도 같은 일을 한다(`seed/next.ts` 의 `itemId` 다리). */
      const items = a.items.map((i, n) => ({ ...i, id: `i${n}` }));
      const idOf = new Map(items.map((i) => [i.name, i.id]));
      const links: AssemblyLinkSpec[] = (a.links ?? []).map((l, n) => ({
        id: `l${n}`,
        aItemId: idOf.get(l.aItem) ?? '없음', aGroup: l.aGroup, aIndex: l.aIndex,
        bItemId: idOf.get(l.bItem) ?? '없음', bGroup: l.bGroup, bIndex: l.bIndex,
      }));
      expect({ key: a.key, issue: validateAssembly({ ...a, items, links }, typeKeys, portsOf) })
        .toEqual({ key: a.key, issue: null });
    }
  });

  /* 통신용 충전기는 랙 한 대짜리 설비다 — 놓으면 장비 여섯과 배선 아홉이 함께 선다. */
  it('통신용 충전기가 장비 여섯과 배선 아홉을 들고 있다', () => {
    const chg = SEED_ASSEMBLIES.find((a) => a.key === 'CHG-48V-SET');
    expect(chg?.items).toHaveLength(6);
    expect(chg?.links).toHaveLength(9);
  });
});

/**
 * **UPS 1식을 놓으면 추적이 무엇을 말하는가.**
 *
 * 시드의 배선이 유효하다는 것과, 그 배선이 **쓸모 있는 답을 낸다**는 것은 다른 말이다.
 * UPS 를 쪼갠 유일한 까닭이 「부하를 추적하면 전원 셋이 다 나온다」이므로 그것을 잰다 —
 * 안 그러면 나중에 누가 모듈을 합치면서 조용히 축전지를 잃어버린다.
 */
describe('UPS 1식 — 놓았을 때의 추적', () => {
  const spec = SEED_ASSEMBLIES.find((a) => a.key === 'UPS-SET')!;
  const typeOf = (key: string) => SEED_ASSET_TYPES.find((t) => t.key === key)!;

  /** 설비를 편다 — 항목마다 자산 하나, 배선마다 케이블 하나(`assemblyToPlacement` 과 같은 계산). */
  const place = () => {
    const assets = spec.items.map((i) => ({ id: i.name, typeKey: i.typeKey, name: i.name }));
    const ports = spec.items.flatMap((i) =>
      instantiatePorts(typeOf(i.typeKey).ports, i.name).map((p) => ({ ...p, id: `${i.name}:${p.group}${p.index}` })));
    const cables = (spec.links ?? []).map((l, n) => ({
      id: `L${n}`, aPortId: `${l.aItem}:${l.aGroup}${l.aIndex}`, bPortId: `${l.bItem}:${l.bGroup}${l.bIndex}`,
    }));
    return { assets, ports, cables };
  };

  it('부하를 거슬러 오르면 상용·바이패스·축전지가 다 나온다', () => {
    const { assets, ports, cables } = place();
    /* 밖에서 이을 것들을 붙인다 — 소내배전반(상용·바이패스) · 축전지반 · 부하. */
    const ext = [
      { id: '소내배전반', typeKey: 'CHG-DIST', name: '소내배전반' },
      { id: 'UPS 축전지', typeKey: 'UPS-BATTERY', name: 'UPS 축전지' },
      { id: '부하', typeKey: 'SID-125', name: '부하' },
    ];
    const extPorts = ext.flatMap((a) =>
      instantiatePorts(typeOf(a.typeKey).ports, a.id).map((p) => ({ ...p, id: `${a.id}:${p.group}${p.index}` })));
    const wired = [
      ...cables,
      { id: 'AC-IN', aPortId: '소내배전반:POWER-OUT-AC1', bPortId: 'UPS 정류기:POWER-IN-AC1' },
      { id: 'AC-BYPASS', aPortId: '소내배전반:POWER-OUT-AC2', bPortId: 'UPS 절체 스위치:POWER-IN-AC-BYPASS1' },
      { id: 'BATT', aPortId: 'UPS DC 링크:POWER-BI-DC1', bPortId: 'UPS 축전지:POWER-DC1' },
      { id: 'AC-OUT', aPortId: 'UPS 절체 스위치:POWER-OUT-AC1', bPortId: '부하:POWER-IN-DC1' },
    ];
    /* 부하의 입력은 직류라 교류 출력과 못 잇는다 — 부하 쪽만 교류 입력으로 바꿔 둔다. */
    const allPorts = [...ports, ...extPorts].map((p) =>
      p.id === '부하:POWER-IN-DC1' ? { ...p, medium: 'power', direction: 'IN' as const, variant: 'AC' } : p);

    const graph = buildTraceGraph({
      types: {}, assets: [...assets, ...ext], ports: allPorts as never, cables: wired,
    });
    const reached = new Set(traceFrom(graph, '부하:POWER-IN-DC1', 'upstream').map((h) => h.toPortId));

    expect([...reached]).toContain('소내배전반:POWER-OUT-AC1');   // 상용
    expect([...reached]).toContain('소내배전반:POWER-OUT-AC2');   // 바이패스
    expect([...reached]).toContain('UPS 축전지:POWER-DC1');       // 축전지
  });

  /**
   * **바이패스로 도는 길에는 축전지가 없다** — UPS 를 쪼갠 값이 여기서 나온다.
   *
   * 바이패스 입력에서 내려가면 절체 스위치를 지나 부하로 갈 뿐, DC 링크 쪽으로는 가지
   * 않는다(그쪽은 인버터가 먹이는 길이다).
   */
  it('바이패스에서 내려가면 축전지를 거치지 않는다', () => {
    const { assets, ports, cables } = place();
    const graph = buildTraceGraph({ types: {}, assets, ports: ports as never, cables });
    const reached = traceFrom(graph, 'UPS 절체 스위치:POWER-IN-AC-BYPASS1', 'downstream').map((h) => h.toPortId);
    expect(reached).toContain('UPS 절체 스위치:POWER-OUT-AC1');
    expect(reached.some((id) => id.startsWith('UPS DC 링크'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { derivedLinks, internalLinkMap } from './internalLinks.js';
import { SEED_ASSET_TYPES } from '../seed/catalog.js';
import type { Direction, PortRef } from '../catalog/types.js';

const tpl = (group: string, medium: string, direction: Direction, positions = 1) => ({ group, medium, direction, positions });
const port = (id: string, group: string, index: number, medium: string, direction: Direction, positions = 1): PortRef =>
  ({ id, assetId: 'a', group, index, name: `${group}${index}`, direction, medium, positions });

describe('derivedLinks — 포트 선언에서 저절로 나오는 내부 통과', () => {
  /* 방향을 나눠 선언한 것 자체가 "들어온 것이 나간다" 는 뜻이다. 예전에는 그 사실을
     시드에 한 번 더 적었고, 그래서 축전지 하나가 빠져 있어도 아무도 몰랐다. */
  it('전원 입력 그룹은 모든 전원 출력 그룹과 통한다', () => {
    expect(derivedLinks([tpl('PWR-IN', 'power', 'IN'), tpl('PWR-OUT', 'power', 'OUT')]))
      .toEqual([{ fromGroup: 'PWR-IN', toGroup: 'PWR-OUT', mapping: 'all' }]);
  });

  it('출력이 없으면 유도하지 않는다 — 전원을 먹기만 하는 장비', () => {
    expect(derivedLinks([tpl('PWR-IN', 'power', 'IN'), tpl('P', 'network', 'BI')])).toEqual([]);
  });

  /* 방향을 따지지 않는 종류(네트워크·제어·광)는 어느 쪽이 들어오고 나가는지 선언에
     없다 — 없는 사실을 지어내지 않는다. 스위치의 24포트가 서로 다 통한다고 해 버리면
     추적이 아무 데나 뚫린다. */
  it('방향이 뜻을 갖지 않는 종류는 유도하지 않는다', () => {
    expect(derivedLinks([tpl('P', 'network', 'BI'), tpl('COM', 'control', 'BI')])).toEqual([]);
  });

  it('다심 인입은 앞면 광 그룹과 코어 번호로 통한다', () => {
    expect(derivedLinks([tpl('CORE', 'fiber', 'BI'), tpl('TRUNK', 'fiber', 'BI', 24)]))
      .toEqual([{ fromGroup: 'TRUNK', toGroup: 'CORE', mapping: 'byPosition' }]);
  });

  it('앞면 후보가 둘이면 유도하지 않는다 — 어느 쪽인지는 선언해야 안다', () => {
    expect(derivedLinks([
      tpl('CORE-A', 'fiber', 'BI'), tpl('CORE-B', 'fiber', 'BI'), tpl('TRUNK', 'fiber', 'BI', 24),
    ])).toEqual([]);
  });

  /* 예전에 시드가 손으로 적고 있던 다섯 규칙이 전부, 그리고 빠져 있던 축전지까지 나온다. */
  it('시드 전 타입: 손으로 적던 다섯 규칙 + 빠져 있던 축전지가 유도된다', () => {
    const got = Object.fromEntries(
      SEED_ASSET_TYPES
        .map((t) => [t.key, derivedLinks(t.ports)] as const)
        .filter(([, links]) => links.length > 0)
        .map(([k, links]) => [k, links.map((l) => `${l.fromGroup}→${l.toGroup} ${l.mapping}`)]),
    );
    expect(got).toEqual({
      'OFD-SLOT': ['FIBER-TRUNK→FIBER byPosition'],
      FEEDER: ['POWER-IN→POWER-OUT all'],
      CHARGER: ['POWER-IN→POWER-OUT all'],
      UPS: ['POWER-IN→POWER-OUT all'],
      // 충전 입력과 방전 출력은 같은 DC 모선에 걸린다 — 시드에만 빠져 있었다.
      BATTERY: ['POWER-IN→POWER-OUT all'],
      'PWR-AC': ['POWER-IN→POWER-OUT all'],
      /* 직류 분전반도 같다 — 예전에는 네트워크 포트를 달고 있어서 통과가 유도되지 않았다
         (임시값이 남아 있던 자리다). 포트를 바로잡으니 규칙도 저절로 따라왔다. */
      'PWR-DC': ['POWER-IN→POWER-OUT all'],
    });
  });
});

describe('internalLinkMap — 규칙은 포트 선언에서만 나온다', () => {
  it('선언 없이 전원이 통과한다', () => {
    const ports = [port('i', 'PWR-IN', 1, 'power', 'IN'), port('o', 'PWR-OUT', 1, 'power', 'OUT')];
    expect(internalLinkMap(ports).get('i')).toEqual(['o']);
  });

  /* 방향을 따지지 않는 종류끼리는 통과하지 않는다 — 없는 사실을 지어내면 24구 스위치의
     모든 포트가 서로 통한다고 해 버려 추적이 아무 데나 뚫린다. */
  it('방향 없는 종류의 포트들은 서로 통하지 않는다', () => {
    const ports = [
      port('i', 'PWR-IN', 1, 'power', 'IN'), port('o', 'PWR-OUT', 1, 'power', 'OUT'),
      port('m1', 'MOD1', 1, 'control', 'BI'), port('m2', 'MOD2', 1, 'control', 'BI'),
    ];
    const map = internalLinkMap(ports);
    expect(map.get('m1')).toBeUndefined();
    expect(map.get('i')).toEqual(['o']);
  });

  /* 24심 인입 옆에 48구 판이 있어도 없는 코어까지 이어졌다고 하면 안 된다. */
  it('byPosition 은 인입의 코어 수까지만 이어진다', () => {
    const ports = [
      port('t', 'TRUNK', 1, 'fiber', 'BI', 2),
      port('c1', 'CORE', 1, 'fiber', 'BI'), port('c2', 'CORE', 2, 'fiber', 'BI'), port('c3', 'CORE', 3, 'fiber', 'BI'),
    ];
    expect(internalLinkMap(ports).get('t')).toEqual(['c1', 'c2']);
    expect(internalLinkMap(ports).get('c3')).toBeUndefined();
  });
});

/**
 * **화면이 「다심이면 특별히」를 적지 않게** — 이웃은 선언에서 나온다.
 *
 * 포트 상세가 「이 포트의 이웃」을 물을 때 이 지도를 쓴다. 그래서 슬롯의 앞면 어댑터를
 * 고르면 인입이, 인입을 고르면 앞면들이 이웃으로 나온다 — 자국(앞면 → 장비)과 대국
 * (인입 → 상대국)을 한 판에서 오갈 수 있는 근거가 이것이다.
 */
describe('포트 상세가 쓰는 이웃', () => {
  const trunk = { id: 't', group: 'TRUNK', medium: 'fiber', direction: 'BI' as const, positions: 3, index: 1 };
  const front = (i: number) => ({ id: `f${i}`, group: 'CORE', medium: 'fiber', direction: 'BI' as const, positions: 1, index: i });

  it('앞면 어댑터의 이웃은 인입 하나다 — 거기서 대국으로 건너간다', () => {
    const map = internalLinkMap([trunk, front(1), front(2), front(3)]);
    expect(map.get('f2')).toEqual(['t']);
  });

  it('인입의 이웃은 제 코어 수만큼의 앞면이다', () => {
    const map = internalLinkMap([trunk, front(1), front(2), front(3), front(4)]);
    /* 24심 인입 옆에 48구 판이 있어도 없는 코어까지 이어졌다고 하지 않는다. */
    expect(map.get('t')).toEqual(['f1', 'f2', 'f3']);
  });

  it('이웃이 없는 포트는 그 줄 자체가 서지 않는다 — 빈 상자를 만들지 않는다', () => {
    const lone = { id: 'n', group: 'NET', medium: 'network', direction: 'BI' as const, positions: 1, index: 1 };
    expect(internalLinkMap([lone]).get('n')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { Direction, PortRef } from '../catalog/types.js';
import { validateConnection } from './connection.js';

const port = (id: string, medium = 'fiber', direction: Direction = 'BI'): PortRef => ({
  id,
  assetId: `asset-${id}`,
  group: 'A',
  index: 1,
  name: id,
  direction,
  medium,
});

/** 케이블이 하나도 안 물린 상태. */
const empty = new Map<string, number>();
const used = (...ids: string[]) => new Map(ids.map((id) => [id, 1]));

describe('validateConnection', () => {
  it('유효한 연결은 null', () => {
    expect(validateConnection(port('p1'), port('p2'), empty)).toBeNull();
  });

  it('같은 포트끼리 → same-port', () => {
    expect(validateConnection(port('p1'), port('p1'), empty)).toBe('same-port');
  });

  it('이미 물린 포트 → port-occupied', () => {
    expect(validateConnection(port('p1'), port('p2'), used('p2'))).toBe('port-occupied');
    expect(validateConnection(port('p1'), port('p2'), used('p1'))).toBe('port-occupied');
  });

  it('매체 불일치 → medium-mismatch', () => {
    expect(validateConnection(port('p1', 'fiber'), port('p2', 'power'), empty)).toBe('medium-mismatch');
  });

  it('cableMedium 지정 시 포트 매체와 불일치 → medium-mismatch', () => {
    expect(validateConnection(port('p1', 'fiber'), port('p2', 'fiber'), empty, 'power')).toBe('medium-mismatch');
    expect(validateConnection(port('p1', 'fiber'), port('p2', 'fiber'), empty, 'fiber')).toBeNull();
  });

  it('어휘에 없는 종류는 예전 규칙(같은 매체끼리)으로 둔다 — 데이터가 앞서 나가도 잠기지 않게', () => {
    expect(validateConnection(port('p1', '미지의매체'), port('p2', '미지의매체'), empty)).toBeNull();
    expect(validateConnection(port('p1', '미지의매체'), port('p2', '다른매체'), empty)).toBe('medium-mismatch');
  });
});

/* 전원은 공급(OUT)과 소비(IN)가 갈린다. 예전에는 방향을 아예 보지 않아서 UPS 출력과
   충전기 출력을 이어도 저장됐다. */
describe('방향 규칙 — 전원(opposite)', () => {
  const p = (id: string, direction: Direction) => port(id, 'power', direction);

  it('출력끼리는 막는다', () => {
    expect(validateConnection(p('a', 'OUT'), p('b', 'OUT'), empty)).toBe('direction-mismatch');
  });

  it('입력끼리도 막는다', () => {
    expect(validateConnection(p('a', 'IN'), p('b', 'IN'), empty)).toBe('direction-mismatch');
  });

  it('출력 → 입력은 통과', () => {
    expect(validateConnection(p('a', 'OUT'), p('b', 'IN'), empty)).toBeNull();
  });

  it('BI 는 어느 쪽과도 맞는다 — "정해지지 않음" 이지 "같은 쪽" 이 아니다', () => {
    expect(validateConnection(p('a', 'BI'), p('b', 'OUT'), empty)).toBeNull();
    expect(validateConnection(p('a', 'BI'), p('b', 'IN'), empty)).toBeNull();
    expect(validateConnection(p('a', 'BI'), p('b', 'BI'), empty)).toBeNull();
  });
});

describe('방향 규칙 — 방향을 따지지 않는 종류(any)', () => {
  it('네트워크는 같은 방향끼리도 통과', () => {
    expect(validateConnection(port('a', 'network', 'IN'), port('b', 'network', 'IN'), empty)).toBeNull();
  });

  it('제어도 통과 — 널모뎀처럼 같은 쪽끼리 직결하는 배선이 실제로 있다', () => {
    expect(validateConnection(port('a', 'control', 'OUT'), port('b', 'control', 'OUT'), empty)).toBeNull();
  });
});

/* 접지 부스바에는 여러 기기의 접지선이 한 단자로 모인다. */
describe('다중 결선 — 접지', () => {
  it('접지 단자는 이미 물려 있어도 더 받는다', () => {
    const busbar = port('bus', 'ground');
    expect(validateConnection(busbar, port('p2', 'ground'), used('bus'))).toBeNull();
    expect(validateConnection(busbar, port('p3', 'ground'), new Map([['bus', 7]]))).toBeNull();
  });

  it('접지가 아닌 종류는 여전히 1가닥', () => {
    expect(validateConnection(port('a', 'network'), port('b', 'network'), used('a'))).toBe('port-occupied');
  });
});

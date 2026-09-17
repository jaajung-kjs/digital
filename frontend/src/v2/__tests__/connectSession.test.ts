import { describe, expect, it } from 'vitest';
import {
  openSession, withFrom,
  type ConnectFrom, type ConnectOrigin,
} from '../connectSession';

const ORIGIN: ConnectOrigin = { substationId: 'ss-a', view: '계통', floorId: 'f-3' };
const FIBER: ConnectFrom = { portId: 'p-1', label: 'OFD · 슬롯 1 · 광 1', substationId: 'ss-a', medium: 'fiber' };
const POWER: ConnectFrom = { portId: 'p-9', label: '분전반 · 분기 1', substationId: 'ss-a', medium: 'power' };

describe('연결 세션 — 무엇을 잇는 중인가', () => {
  /* 세션이 서면 **아직 출발이 없다** — 도면에서 「케이블」을 누른 직후가 그 상태다. */
  it('열면 출발이 비어 있고 돌아갈 자리를 기억한다', () => {
    const s = openSession(ORIGIN);
    expect(s.from).toBeNull();
    expect(s.origin).toEqual(ORIGIN);
  });

  it('출발이 정해지면 그 값만 들어온다', () => {
    const s = withFrom(openSession(ORIGIN), FIBER);
    expect(s.from).toEqual(FIBER);
    expect(s.origin).toEqual(ORIGIN);
  });

  /* 출발을 바꿔도 돌아갈 자리는 그대로다 — 「시작한 화면」은 처음 한 번 정해진다. */
  it('출발을 바꿔도 돌아갈 자리는 그대로다', () => {
    const s = withFrom(withFrom(openSession(ORIGIN), FIBER), POWER);
    expect(s.from).toEqual(POWER);
    expect(s.origin).toEqual(ORIGIN);
  });

  /**
   * **세션이 아는 것은 둘뿐이다.**
   *
   * 한때 여기 `categoryId` 와 `keepGoing` 이 함께 살았다. 종류를 **고르기 전에** 물으니
   * 안 고른 채 포트를 누르면 「종류를 고르세요」로 튕겨 **고른 포트가 버려졌고**, 도면 위에서
   * 무엇을 잘못했는지 알기도 어려웠다. 지금은 포트를 고른 뒤에 묻는다
   * (`ConnectCategoryDialog`) — 물을 시점이 정해져 있어 세션이 들고 있을 이유가 없다.
   */
  it('세션에는 출발과 돌아갈 자리밖에 없다', () => {
    expect(Object.keys(withFrom(openSession(ORIGIN), FIBER)).sort()).toEqual(['from', 'origin']);
  });
});

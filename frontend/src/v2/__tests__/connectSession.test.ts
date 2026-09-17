import { describe, expect, it } from 'vitest';
import {
  openSession, withFrom, setCategory, setKeepGoing, canConnect, finish,
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
    expect(s.keepGoing).toBe(false);
  });

  /**
   * **종류는 매체가 정한 목록에서 직전에 쓴 것이 물려 온다.**
   *
   * 예전에는 그 매체 그룹의 **첫 품목을 말없이** 집었다(`FloorPlanView.tsx:483`) — 광이면
   * 「OPGW」가 되는데 정작 이으려던 것이 「광점퍼코드」여도 그랬다. 물려 오는 값은 화면에
   * 고른 채로 보이므로 숨은 값이 아니다.
   */
  it('출발이 정해지면 그 매체에 직전에 쓴 종류가 물려 온다', () => {
    const s = withFrom(openSession(ORIGIN), FIBER, { fiber: 'cat-jumper' });
    expect(s.from).toEqual(FIBER);
    expect(s.categoryId).toBe('cat-jumper');
  });

  /* 그 매체를 처음 쓰면 **비어 있다** — 짐작해 채우지 않는다. */
  it('직전 기록이 없으면 종류는 비어 있다', () => {
    const s = withFrom(openSession(ORIGIN), FIBER, {});
    expect(s.categoryId).toBeNull();
  });

  /* 다른 매체의 기록을 끌어다 쓰지 않는다 — 전원 기록이 광에 새면 매체 불일치로 튕긴다. */
  it('다른 매체의 기록은 끌어오지 않는다', () => {
    const s = withFrom(openSession(ORIGIN), FIBER, { power: 'cat-fcv' });
    expect(s.categoryId).toBeNull();
  });

  /* 출발을 바꾸면 종류도 그 매체의 것으로 다시 물려 온다. */
  it('출발을 바꾸면 종류도 따라 바뀐다', () => {
    const a = withFrom(openSession(ORIGIN), FIBER, { fiber: 'cat-jumper', power: 'cat-fcv' });
    const b = withFrom(a, POWER, { fiber: 'cat-jumper', power: 'cat-fcv' });
    expect(b.categoryId).toBe('cat-fcv');
  });

  it('종류는 오버레이에서 언제든 바꾼다', () => {
    const s = setCategory(withFrom(openSession(ORIGIN), FIBER, {}), 'cat-opgw');
    expect(s.categoryId).toBe('cat-opgw');
  });
});

describe('연결 세션 — 이을 수 있는가', () => {
  /* **셋이 다 차야 이어진다.** 종류가 비면 못 잇는다 — 휴리스틱이 사라졌다는 증거다. */
  it('출발과 종류가 다 있어야 이을 수 있다', () => {
    expect(canConnect(openSession(ORIGIN))).toBe(false);
    expect(canConnect(withFrom(openSession(ORIGIN), FIBER, {}))).toBe(false);
    expect(canConnect(setCategory(withFrom(openSession(ORIGIN), FIBER, {}), 'cat-jumper'))).toBe(true);
  });
});

describe('연결 세션 — 이은 뒤', () => {
  /* 한 가닥만 이을 생각이었으면 세션이 끝난다. */
  it('이어서 또 잇지 않으면 세션이 끝난다', () => {
    const s = setCategory(withFrom(openSession(ORIGIN), FIBER, {}), 'cat-jumper');
    expect(finish(s)).toBeNull();
  });

  /**
   * **「이어서 또 잇기」는 출발만 비운다** — 돌아갈 자리와 종류는 그대로다.
   *
   * 계통에서 시작했으면 계통으로 돌아와 다음 회로 칸을 누르면 된다. 예전에는 말없이
   * `1/3` 로 돌아가 방금 완성한 일이 실패한 것처럼 보였다.
   */
  it('이어서 또 잇기면 출발만 비우고 자리와 종류는 남는다', () => {
    const s = setKeepGoing(setCategory(withFrom(openSession(ORIGIN), FIBER, {}), 'cat-jumper'), true);
    const next = finish(s);
    expect(next).not.toBeNull();
    expect(next!.from).toBeNull();
    expect(next!.categoryId).toBe('cat-jumper');
    expect(next!.origin).toEqual(ORIGIN);
    expect(next!.keepGoing).toBe(true);
  });
});

/**
 * PortsEditor — **선언 표**. 이 판이 실제로 갖는 구획만 한 줄씩 서고, 더하는 길은 하나다.
 *
 * 예전에는 종류 아홉이 0개짜리로 늘 서 있는 판이었다(§1.7-i 위반: 조회하러 온 사람에게
 * 입력 상자 아홉). 여기서 붙잡는 것은 그 뒤집힘이다 — 없는 포트는 표에 없고, 값은 읽는
 * 줄로 서며, 새 줄은 「＋ 포트 추가」로만 생긴다.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { V2Catalog } from '../types';
import type { TypeDraft } from '../catalogDraft';
import { PortsEditor } from '../components/admin/PortsEditor';

/* 판은 매체 이름·색을 카탈로그에서 읽는다(`useMediumLabel`·`useMediumColor`) — 그 훅은
   react-query 를 타므로 여기서는 어휘만 돌려주는 목으로 갈음한다. */
const MEDIUM_NAMES: Record<string, string> = {
  power: '전원', network: '네트워크', fiber: '광', control: '제어', ground: '접지',
};
vi.mock('../hooks', () => ({
  useMediumLabel: () => (key: string) => MEDIUM_NAMES[key] ?? key,
  useMediumColor: () => () => null,
}));

// ─── 팩토리 ─────────────────────────────────────────────────────────────────
const mkCatalog = (): V2Catalog => ({
  categories: [{ id: 'cat-1', key: '통신', name: '통신장비', sortOrder: 1 }],
  types: [],
  cableGroups: [
    { id: 'cg-1', key: 'fiber', name: '광', color: '#8B5CF6', laborCode: null, installManDays: 0, removeManDays: 0, sortOrder: 1, categories: [] },
    { id: 'cg-2', key: 'network', name: '통신', color: '#3B82F6', laborCode: null, installManDays: 0, removeManDays: 0, sortOrder: 2, categories: [] },
  ],
});

const mkDraft = (portOverrides: TypeDraft['ports'] = []): TypeDraft => ({
  key: 'RACK',
  name: '랙',
  categoryId: 'cat-1',
  sortOrder: 1,
  defaultWidth: null,
  defaultHeight: null,
  laborCode: null,
  installManDays: 0,
  removeManDays: 0,
  relocateManDays: 0,
  fieldDefs: [],
  containers: [],
  ports: portOverrides,
  links: [],
});

// ─── 테스트 ──────────────────────────────────────────────────────────────────
/** 그 구획의 값을 고치러 간다 — 값은 **이름표에 붙어 있다**(누르면 그 자리에서 상자). */
const editValue = (label: string) =>
  fireEvent.click(screen.getByRole('button', { name: `${label} 고치기` }));

/** 종류를 골라 더한다 — 「＋ 포트 추가」를 누르면 그때 메뉴가 열린다. */
const addKind = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: /포트 추가/ }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
};

describe('PortsEditor', () => {
  /**
   * **판이 곧 목록이다.** 무슨 구획이 몇 개인지는 판이 그림으로 말한다 — 표로 다시 적지 않는다.
   */
  it('(a) 표가 아니라 판이 선다 — 구획과 포트가 그려진다', () => {
    const draft = mkDraft([
      { group: 'A', count: 12, direction: 'BI', medium: 'fiber', namePattern: '코어 {n}' },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    expect(screen.queryByRole('table')).toBeNull();
    // 포트 열둘이 판에 실제로 그려진다(번호가 붙는다).
    expect(screen.getByRole('button', { name: '코어 1 미연결' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '코어 12 미연결' })).toBeInTheDocument();
    /* 값은 그 구획의 이름표에 붙어 있다 — 위쪽 도구모음이 아니다.
       구획 이름은 **그 포트의 이름**이다(「코어 1」… → 「코어」). */
    expect(screen.getByRole('button', { name: '코어 개수 고치기' }).textContent).toBe('12개');
  });

  /* 만들기는 **누른 그 순간에** 고른다 — 장전된 목록이 화면에 늘 떠 있지 않는다. */
  it('(a-2) 포트가 하나도 없으면 판 대신 빈 상태가 선다 — 더하는 길은 단추 하나', () => {
    render(<PortsEditor draft={mkDraft([])} onChange={vi.fn()} issues={[]} />);
    expect(screen.getByText('포트가 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /포트 추가/ }));
    expect(screen.getByRole('menuitem', { name: '네트워크' })).toBeInTheDocument();
  });

  it('(b) 종류를 고르면 그 구획이 판에 서고, 값은 그 이름표에 붙는다', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    addKind('네트워크');

    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports).toHaveLength(1);
    expect(called.ports[0]).toMatchObject({ medium: 'network', direction: 'BI', count: 1 });
    // 지어낼 필요가 없어야 한다 — 그룹 키·이름 패턴은 어휘가 준다.
    expect(called.ports[0]!.group).not.toBe('');
    expect(called.ports[0]!.namePattern).toContain('{n}');

    /* 더하기와 개수 정하기가 **한 걸음**이다 — 갓 더한 구획의 개수 칸이 열린 채로 선다.
       포트 구획을 더하는 사람은 거의 언제나 개수를 함께 정한다(24구 판·12심 슬롯). */
    rerender(<PortsEditor draft={mkDraft(called.ports)} onChange={onChange} issues={[]} />);
    const count = screen.getByLabelText('네트워크 개수') as HTMLInputElement;
    expect(count).toBeInstanceOf(HTMLInputElement);

    fireEvent.change(count, { target: { value: '24' } });
    fireEvent.blur(count);
    expect(onChange.mock.calls[1][0].ports[0]).toMatchObject({ count: 24 });
  });

  /* 품목이 정하는 것은 **갈래까지**다 — 몇 V 인지는 회로마다 다르므로 계통 표가 적는다. */
  it('(b-2) 전원은 입력·출력이 따로 있고, AC·DC 도 따로다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    addKind('전원 출력(DC)');
    expect(onChange.mock.calls[0][0].ports[0]).toMatchObject({ medium: 'power', direction: 'OUT', variant: 'DC' });
    expect(onChange.mock.calls[0][0].ports[0].voltage).toBeUndefined();
  });

  it('(b-3) 지우면 그 구획이 빠진다', () => {
    const existing = mkDraft([{ group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '네트워크 {n}' }]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} issues={[]} />);

    fireEvent.click(screen.getByRole('button', { name: '네트워크 지우기' }));
    expect(onChange.mock.calls[0][0].ports).toHaveLength(0);
  });

  /* 24심 OPGW 한 가닥은 앞면 24구로 갈라져 나온다 — 코어 하나가 어댑터 하나다. */
  it('(f) 성단 코어 수를 고치면 앞면 광 포트 개수가 따라온다', () => {
    const draft = mkDraft([
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}', positions: 1 },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} issues={[]} />);

    editValue('OPGW 심선 수');
    const input = screen.getByLabelText('OPGW 심선 수');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);

    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports.find((p) => p.group === 'TRUNK')!.positions).toBe(12);
    expect(ports.find((p) => p.group === 'CORE')!.count).toBe(12);
  });

  /* 성단을 켜면 나갈 어댑터가 함께 생긴다 — 24심 인입만 있고 앞면이 없는 판은 없다. */
  it('(f-3) 앞면이 없는 상태에서 성단을 더하면 광 포트가 함께 생긴다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    addKind('OPGW');
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    const trunk = ports.find((p) => (p.positions ?? 1) > 1)!;
    const adapter = ports.find((p) => p.medium === 'fiber' && (p.positions ?? 1) === 1)!;
    expect(trunk.count).toBe(1);
    expect(adapter.count).toBe(trunk.positions);
  });

  /* 어긋난 조합도 실물에 있다 — 24심 인입 옆의 48구 판. 일부러 어긋내 둔 값은 안 건드린다. */
  it('(f-2) 어댑터가 코어 수와 이미 어긋나 있으면 따라오지 않는다', () => {
    const draft = mkDraft([
      { group: 'CORE', count: 48, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}', positions: 1 },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} issues={[]} />);

    editValue('OPGW 심선 수');
    const input = screen.getByLabelText('OPGW 심선 수');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);

    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports.find((p) => p.group === 'CORE')!.count).toBe(48);
  });

  /* 광은 단심과 다심이 **다른 구획**이다 — 어느 쪽인지는 심선 수가 가른다. */
  it('(b-4) OPGW 구획은 단심 광과 섞이지 않는다', () => {
    const existing = mkDraft([
      { group: 'FIBER', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} issues={[]} />);

    addKind('OPGW');
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports).toHaveLength(2);
    expect(ports[1]!.positions).toBeGreaterThan(1);
    expect(ports[1]!.group).not.toBe(ports[0]!.group);
  });

  /**
   * **인입이 어디로 갈리는지 정해지지 않으면 말해 준다.**
   *
   * 코어 i ↔ 앞면 i 번 규칙은 **앞면 후보가 정확히 하나일 때만** 유도된다(`derivedLinks`).
   * 둘이면 규칙이 아예 안 생겨서, 저장한 뒤 선번장에서 「왜 아무것도 안 뜨지」로 알게 된다.
   * 막지는 않는다 — 어긋난 조합도 실물에 있고 그건 이 화면이 알 수 없다.
   */
  it('(g) 다심 인입이 갈 곳이 모호하면 알려 준다 — 막지는 않는다', () => {
    const ok = mkDraft([
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}', positions: 1 },
    ]);
    const { unmount } = render(<PortsEditor draft={ok} onChange={vi.fn()} issues={[]} />);
    expect(screen.queryByText(/갈리는지|앞면/)).toBeNull();
    unmount();

    /* 앞면이 둘 — 어느 쪽으로 갈리는지 정할 수 없다. */
    const twoFronts = mkDraft([
      ...ok.ports,
      { group: 'CORE-2', count: 12, direction: 'BI', medium: 'fiber', namePattern: '광 B {n}', positions: 1 },
    ]);
    const second = render(<PortsEditor draft={twoFronts} onChange={vi.fn()} issues={[]} />);
    expect(screen.getByText(/어느 쪽으로 갈리는지 정할 수 없습니다/)).toBeInTheDocument();
    second.unmount();

    /* 앞면이 코어보다 적으면 남는 코어는 갈 자리가 없다. */
    const short = mkDraft([
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
      { group: 'CORE', count: 10, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}', positions: 1 },
    ]);
    render(<PortsEditor draft={short} onChange={vi.fn()} issues={[]} />);
    expect(screen.getByText(/14심은 나갈 앞면이 없습니다/)).toBeInTheDocument();
  });

  /**
   * **개수를 0 으로 만들다 만 상태**가 생기지 않는다.
   *
   * 0 은 「그 구획이 없다」는 뜻이고, 없애는 길은 지우개 하나다. 칸에서 0 이나 빈 값을
   * 만들 수 있으면 「포트 0개짜리 구획」이 판에 남아, 있지도 않은 것이 자리를 차지한다.
   */
  it('(i) 개수는 0 이 되지 않는다 — 없애는 길은 지우개뿐', () => {
    const draft = mkDraft([
      { group: 'NETWORK', count: 4, direction: 'BI', medium: 'network', namePattern: '네트워크 {n}' },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} issues={[]} />);

    editValue('네트워크 개수');
    const input = screen.getByLabelText('네트워크 개수');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(onChange.mock.calls[0][0].ports[0]).toMatchObject({ count: 1 });

    /* 빈 칸으로 두고 나가도 마찬가지다 — 없는 값이 0 이 되지 않는다. */
    onChange.mockClear();
    editValue('네트워크 개수');
    const again = screen.getByLabelText('네트워크 개수');
    fireEvent.change(again, { target: { value: '' } });
    fireEvent.blur(again);
    expect(onChange.mock.calls[0]?.[0].ports[0]).toMatchObject({ count: 1 });
  });

  /* 성단을 지우면 앞면만 남는다 — 그건 그냥 광 포트라 아무 문제가 없다(말하지 않는다). */
  it('(j) 성단을 지우면 앞면만 남고, 그건 정상이다', () => {
    const onlyFront = mkDraft([
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}', positions: 1 },
    ]);
    render(<PortsEditor draft={onlyFront} onChange={vi.fn()} issues={[]} />);
    expect(screen.queryByText(/앞면|갈리는지/)).toBeNull();
  });

  /* 반대로 앞면을 지우면 24심을 받아 놓고 나갈 자리가 없다 — 그건 말해 준다. */
  it('(k) 앞면을 지우면 코어가 나갈 자리가 없다고 말한다', () => {
    const onlyTrunk = mkDraft([
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    render(<PortsEditor draft={onlyTrunk} onChange={vi.fn()} issues={[]} />);
    expect(screen.getByText(/코어가 나갈 자리가 없습니다/)).toBeInTheDocument();
  });

  /**
   * **심선 수는 2 밑으로 내려가지 않는다.** 1 이면 그건 다심이 아니라 보통 포트라
   * 구획의 정체가 바뀐다(어휘가 그 둘을 가른다) — 값 하나로 종류가 뒤집히면 안 된다.
   */
  it('(l) 심선 수를 1 로 만들 수 없다 — 그건 다른 종류다', () => {
    const draft = mkDraft([
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}', positions: 1 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} issues={[]} />);

    editValue('OPGW 심선 수');
    const input = screen.getByLabelText('OPGW 심선 수');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.blur(input);
    expect(onChange.mock.calls[0][0].ports.find((p: { group: string }) => p.group === 'TRUNK')).toMatchObject({ positions: 2 });
  });

  /** **뜻이 같은 구획이 둘**이면 순번으로만 갈린다 — 대개 실수이므로 합치라고 말해 준다. */
  it('(h) 뜻이 같은 구획이 둘이면 순번으로 갈리고, 합치라고 말해 준다', () => {
    const two = mkDraft([
      { group: 'POWER-OUT-AC', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력 {n}', variant: 'AC' },
      { group: 'POWER-OUT-AC-2', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력 {n}', variant: 'AC' },
    ]);
    render(<PortsEditor draft={two} onChange={vi.fn()} issues={[]} />);

    expect(screen.getByRole('button', { name: '전원 출력(AC) 1 개수 고치기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전원 출력(AC) 2 개수 고치기' })).toBeInTheDocument();
    expect(screen.getByText(/구획이 둘입니다/)).toBeInTheDocument();
    expect(screen.queryByText(/POWER-OUT-AC/)).toBeNull();
  });

  /**
   * **세부는 다심의 코어 수뿐**이다.
   *
   * 전압은 이제 품목이 정하지 않는다 — 380/220V 3상4선 반은 한 반에서 380V 3상과 220V 단상을
   * 함께 내보내므로, 회로마다 다른 값을 품목에 못 박을 수 없다(계통 표가 적는다).
   */
  it('(e) 품목이 정하는 것은 개수와 코어 수까지 — 전압 칩은 없다', () => {
    const draft = mkDraft([
      { group: 'PWR', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}', positions: 1 },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    expect(screen.queryByRole('button', { name: /전압 고치기/ })).toBeNull();
    /* 갈래는 이름이 말한다. */
    expect(screen.getByRole('button', { name: '전원 입력(DC) 개수 고치기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OPGW 심선 수 고치기' }).textContent).toBe('24코어');
  });
});

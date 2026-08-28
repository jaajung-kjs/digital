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
/** 이 줄의 어느 칸을 고치는 단추 — 읽는 줄이 기본이라 값은 단추로 선다. */
const cell = (label: string) => screen.getByRole('button', { name: `${label} 고치기` });

describe('PortsEditor', () => {
  it('(a) 없는 포트는 표에 없다 — 이 판이 갖는 구획만 선다', () => {
    const draft = mkDraft([
      { group: 'A', count: 12, direction: 'BI', medium: 'fiber', namePattern: '코어 {n}' },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    /* 그 줄의 개수는 읽는 값으로 서 있다(누르면 그때 상자가 된다).
       이름은 **표에 선 것들 사이에서** 갈린다 — 광이 한 줄뿐이면 그냥 「광」이고,
       성단이 함께 서면 그때 「광」·「광 다심」으로 갈린다(`portGroupLabel`). */
    expect(cell('광 개수').textContent).toBe('12');
    /* 안 고른 종류는 화면에 없다 — 예전에는 아홉 줄이 0 으로 서 있었다. */
    for (const name of ['전원 입력(AC)', '네트워크', 'OPGW', '접지']) {
      expect(screen.queryByRole('button', { name: `${name} 개수 고치기` })).toBeNull();
    }
    // 지어내야 하던 값들은 여전히 화면에 없다 — 종류가 이미 정했다.
    expect(screen.queryByDisplayValue('A')).toBeNull();
  });

  it('(a-2) 포트가 하나도 없으면 표 대신 빈 상태가 선다', () => {
    render(<PortsEditor draft={mkDraft([])} onChange={vi.fn()} issues={[]} />);
    expect(screen.getByText('포트가 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    // 더하는 길은 늘 열려 있다.
    expect(screen.getByRole('button', { name: /포트 추가/ })).toBeInTheDocument();
  });

  /* 더하는 일은 **명시적**이고, 고르는 자리는 표 안의 새 줄이다(§1.7-m). */
  it('(b) ＋ 포트 추가 → 그 자리에 종류를 고르는 줄이 서고, 고르면 선언이 생긴다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    // 누르기 전에는 고르는 칸이 없다 — 갑자기 칸이 자라나는 일이 없다.
    expect(screen.queryByLabelText('포트 종류')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /포트 추가/ }));

    const select = screen.getByLabelText('포트 종류') as HTMLSelectElement;
    const network = [...select.options].findIndex((o) => o.text === '네트워크');
    fireEvent.change(select, { target: { value: String(network - 1) } }); // 0번은 안내 문구

    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports).toHaveLength(1);
    expect(called.ports[0]).toMatchObject({ medium: 'network', direction: 'BI', count: 1 });
    // 지어낼 필요가 없어야 한다 — 그룹 키·이름 패턴은 어휘가 준다.
    expect(called.ports[0]!.group).not.toBe('');
    expect(called.ports[0]!.namePattern).toContain('{n}');
  });

  it('(b-2) 전원은 입력·출력이 따로 있고, AC·DC 도 따로다 — 전압까지 실려 온다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /포트 추가/ }));

    const select = screen.getByLabelText('포트 종류') as HTMLSelectElement;
    const i = [...select.options].findIndex((o) => o.text === '전원 출력(DC)');
    fireEvent.change(select, { target: { value: String(i - 1) } });

    expect(onChange.mock.calls[0][0].ports[0]).toMatchObject({
      medium: 'power', direction: 'OUT', variant: 'DC', voltage: 'DC 48V',
    });
  });

  /* 지우는 손은 그 줄에 있다 — 개수를 0 으로 만드는 것과 같은 일이다. */
  it('(b-3) 줄을 지우면 그 선언이 빠진다', () => {
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

    fireEvent.click(cell('OPGW 심선 수'));
    fireEvent.change(screen.getByLabelText('OPGW 심선 수'), { target: { value: '12' } });
    fireEvent.blur(screen.getByLabelText('OPGW 심선 수'));

    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports.find((p) => p.group === 'TRUNK')!.positions).toBe(12);
    expect(ports.find((p) => p.group === 'CORE')!.count).toBe(12);
  });

  /* 성단을 켜면 나갈 어댑터가 함께 생긴다 — 24심 인입만 있고 앞면이 없는 판은 없다. */
  it('(f-3) 앞면이 없는 상태에서 성단을 더하면 광 포트가 함께 생긴다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /포트 추가/ }));

    const select = screen.getByLabelText('포트 종류') as HTMLSelectElement;
    const i = [...select.options].findIndex((o) => o.text === '광 다심');
    fireEvent.change(select, { target: { value: String(i - 1) } });

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

    fireEvent.click(cell('OPGW 심선 수'));
    fireEvent.change(screen.getByLabelText('OPGW 심선 수'), { target: { value: '12' } });
    fireEvent.blur(screen.getByLabelText('OPGW 심선 수'));

    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports.find((p) => p.group === 'CORE')!.count).toBe(48);
  });

  /* 광은 단심과 다심이 **다른 줄**이다 — 어느 쪽인지는 심선 수가 가른다. */
  it('(b-4) 광 다심 줄은 단심 광과 섞이지 않는다', () => {
    const existing = mkDraft([
      { group: 'FIBER', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} issues={[]} />);

    expect(cell('광 개수').textContent).toBe('24');
    fireEvent.click(screen.getByRole('button', { name: /포트 추가/ }));
    const select = screen.getByLabelText('포트 종류') as HTMLSelectElement;
    const i = [...select.options].findIndex((o) => o.text === '광 다심');
    fireEvent.change(select, { target: { value: String(i - 1) } });

    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports).toHaveLength(2);
    expect(ports[1]!.positions).toBeGreaterThan(1);
    expect(ports[1]!.group).not.toBe(ports[0]!.group);
  });

  /**
   * **읽는 줄이 기본이다**(§1.7-i) — 값마다 상자를 늘 세우지 않는다.
   *
   * 예전 판은 종류 아홉의 개수 칸이 늘 입력 상자였다. 조회하러 온 사람에게 편집기부터
   * 들이미는 꼴이고, 실수로 바꾸기도 쉽다.
   */
  it('(c) 값은 글자로 서고, 누를 때만 상자가 된다', () => {
    const draft = mkDraft([
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);

    fireEvent.click(cell('광 개수'));
    expect(screen.getByLabelText('광 개수')).toBeInstanceOf(HTMLInputElement);
  });

  /**
   * **같은 말을 두 번 세우지 않는다.** 「구획」과 「이름」이 따로 있었는데 둘이 사실상 같았다
   * (「전원 입력(DC)」·「전원 입력 {n}」). 이름이 실제로 어떻게 붙는지는 아래 전면판이
   * 번호까지 붙여 보여 준다.
   */
  it('(c-2) 이름 패턴 열은 없다 — 구획 이름이 그 줄의 이름이다', () => {
    const draft = mkDraft([
      { group: 'PWR', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'DC', voltage: 'DC 48V' },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('전원 입력(DC)')).toBeInTheDocument();
    expect(within(table).queryByText('전원 입력 {n}')).toBeNull();
  });

  /**
   * **세부 열은 요구하는 줄이 있을 때만 선다.** 대시로만 채워진 열은 자리만 먹고 아무 말도
   * 하지 않으며, 「아직 안 적었다」로 잘못 읽힌다 — 그 종류에는 세부라는 것이 아예 없다.
   */
  it('(e-2) 세부를 요구하는 줄이 없으면 그 열이 서지 않는다', () => {
    const plain = mkDraft([
      { group: 'CTRL', count: 12, direction: 'BI', medium: 'control', namePattern: '제어 {n}', positions: 1 },
    ]);
    const { unmount } = render(<PortsEditor draft={plain} onChange={vi.fn()} issues={[]} />);
    expect(screen.queryByRole('columnheader', { name: '세부' })).toBeNull();
    unmount();

    const withPower = mkDraft([
      { group: 'CTRL', count: 12, direction: 'BI', medium: 'control', namePattern: '제어 {n}', positions: 1 },
      { group: 'PWR', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC', voltage: 'DC 48V' },
    ]);
    render(<PortsEditor draft={withPower} onChange={vi.fn()} issues={[]} />);
    expect(screen.getByRole('columnheader', { name: '세부' })).toBeInTheDocument();
  });

  /* 전압은 **그 종류가 요구하는 칸**이다 — 전원 줄에만 서고, 갈래가 고를 값을 좁힌다. */
  it('(e) 세부 칸은 그 종류의 것이다 — 전원은 전압, 다심은 코어', () => {
    const draft = mkDraft([
      { group: 'PWR', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC', voltage: 'DC 48V' },
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    expect(cell('전원 입력(DC) 전압').textContent).toBe('DC 48V');
    expect(screen.queryByRole('button', { name: '전원 입력(DC) 심선 수 고치기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '광 심선 수 고치기' })).toBeNull(); // 단심 어댑터
    expect(cell('OPGW 심선 수').textContent).toContain('24');

    /* 고를 수 있는 값은 갈래가 정한다 — DC 줄에 AC 전압이 뜨지 않는다. */
    fireEvent.click(cell('전원 입력(DC) 전압'));
    const opts = [...(screen.getByLabelText('전원 입력(DC) 전압') as HTMLSelectElement).options].map((o) => o.text);
    expect(opts).toContain('DC 48V');
    expect(opts.some((o) => o.startsWith('AC'))).toBe(false);
  });
});

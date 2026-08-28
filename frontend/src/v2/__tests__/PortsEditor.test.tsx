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
/** 판에서 그 구획을 고른다 — 포트를 아무거나 누르면 그 구획이 골라진다.
    판의 포트는 「이름 + 상태」로 읽힌다(`PortFaceplate`). */
const pickGroup = (portName: string) =>
  fireEvent.click(screen.getByRole('button', { name: `${portName} 미연결` }));

/** 종류를 골라 더한다 — 도구모음의 [목록] + [추가]. */
const addKind = (name: string) => {
  const select = screen.getByLabelText('포트 종류') as HTMLSelectElement;
  const i = [...select.options].findIndex((o) => o.text === name);
  fireEvent.change(select, { target: { value: String(i) } });
  fireEvent.click(screen.getByRole('button', { name: /추가/ }));
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
  });

  it('(a-2) 포트가 하나도 없으면 판 대신 빈 상태가 선다 — 더하는 길은 늘 열려 있다', () => {
    render(<PortsEditor draft={mkDraft([])} onChange={vi.fn()} issues={[]} />);
    expect(screen.getByText('포트가 없습니다')).toBeInTheDocument();
    expect(screen.getByLabelText('포트 종류')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /추가/ })).toBeInTheDocument();
  });

  /* 도구모음은 **한 줄로 고정**이다 — 고를 때만 생기는 칸이 아니라 자리가 늘 있는 칸이다. */
  it('(b) 종류를 골라 더하면 그 구획이 판에 서고, 도구모음이 그 값을 든다', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    addKind('네트워크');

    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports).toHaveLength(1);
    expect(called.ports[0]).toMatchObject({ medium: 'network', direction: 'BI', count: 1 });
    // 지어낼 필요가 없어야 한다 — 그룹 키·이름 패턴은 어휘가 준다.
    expect(called.ports[0]!.group).not.toBe('');
    expect(called.ports[0]!.namePattern).toContain('{n}');

    /* 더한 구획은 **바로 고른 상태**다 — 개수를 고치는 손이 곧장 이어진다. */
    rerender(<PortsEditor draft={mkDraft(called.ports)} onChange={onChange} issues={[]} />);
    expect(screen.getByLabelText('네트워크 개수')).toBeInstanceOf(HTMLInputElement);
  });

  it('(b-2) 전원은 입력·출력이 따로 있고, AC·DC 도 따로다 — 전압까지 실려 온다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    addKind('전원 출력(DC)');
    expect(onChange.mock.calls[0][0].ports[0]).toMatchObject({
      medium: 'power', direction: 'OUT', variant: 'DC', voltage: 'DC 48V',
    });
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

    pickGroup('OPGW');
    fireEvent.change(screen.getByLabelText('OPGW 심선 수'), { target: { value: '12' } });

    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports.find((p) => p.group === 'TRUNK')!.positions).toBe(12);
    expect(ports.find((p) => p.group === 'CORE')!.count).toBe(12);
  });

  /* 성단을 켜면 나갈 어댑터가 함께 생긴다 — 24심 인입만 있고 앞면이 없는 판은 없다. */
  it('(f-3) 앞면이 없는 상태에서 성단을 더하면 광 포트가 함께 생긴다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    addKind('광 다심');
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

    pickGroup('OPGW');
    fireEvent.change(screen.getByLabelText('OPGW 심선 수'), { target: { value: '12' } });

    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports.find((p) => p.group === 'CORE')!.count).toBe(48);
  });

  /* 광은 단심과 다심이 **다른 구획**이다 — 어느 쪽인지는 심선 수가 가른다. */
  it('(b-4) 광 다심 구획은 단심 광과 섞이지 않는다', () => {
    const existing = mkDraft([
      { group: 'FIBER', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} issues={[]} />);

    addKind('광 다심');
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports).toHaveLength(2);
    expect(ports[1]!.positions).toBeGreaterThan(1);
    expect(ports[1]!.group).not.toBe(ports[0]!.group);
  });

  /**
   * **고른 구획의 값만 도구모음에 뜬다** — 그 종류가 요구하는 것만.
   * 전원은 전압, 다심은 코어 수, 나머지는 개수뿐이다.
   */
  it('(e) 세부는 그 종류가 요구할 때만 도구모음에 선다', () => {
    const draft = mkDraft([
      { group: 'PWR', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC', voltage: 'DC 48V' },
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    pickGroup('전원 입력');
    const voltage = screen.getByLabelText('전원 입력(DC) 전압') as HTMLSelectElement;
    expect(voltage.value).toBe('DC 48V');
    /* 고를 수 있는 값은 갈래가 정한다 — DC 구획에 AC 전압이 뜨지 않는다. */
    expect([...voltage.options].some((o) => o.text.startsWith('AC'))).toBe(false);
    expect(screen.queryByLabelText('전원 입력(DC) 심선 수')).toBeNull();

    pickGroup('광 1');
    expect(screen.queryByLabelText('광 전압')).toBeNull();
    expect(screen.queryByLabelText('광 심선 수')).toBeNull(); // 단심 어댑터

    pickGroup('OPGW');
    expect((screen.getByLabelText('OPGW 심선 수') as HTMLInputElement).value).toBe('24');
  });
});

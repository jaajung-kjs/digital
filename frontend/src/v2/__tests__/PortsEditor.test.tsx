/**
 * PortsEditor — **줄 수가 고정된 표**. 종류마다 한 줄, 개수만 적는다(0 = 없음).
 *
 * 포트 종류는 고정 어휘라(`portPresets()` 일곱) 편집기도 고정일 수 있다. 예전에는 종류를
 * 고를 때마다 카드가 쌓여 자산마다 편집 화면의 키가 달랐다(§1.6 위반).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { V2Catalog } from '../types';
import type { TypeDraft } from '../catalogDraft';
import { PortsEditor } from '../components/admin/PortsEditor';

// ─── 팩토리 ─────────────────────────────────────────────────────────────────
const mkCatalog = (): V2Catalog => ({
  categories: [{ id: 'cat-1', key: '통신', name: '통신장비', sortOrder: 1 }],
  types: [],
  cableGroups: [
    { id: 'cg-1', key: 'fiber', name: '광', color: '#8B5CF6', laborType: null, installHoursPerM: 0, removeHoursPerM: 0, sortOrder: 1, categories: [] },
    { id: 'cg-2', key: 'network', name: '통신', color: '#3B82F6', laborType: null, installHoursPerM: 0, removeHoursPerM: 0, sortOrder: 2, categories: [] },
  ],
});

const mkDraft = (portOverrides: TypeDraft['ports'] = []): TypeDraft => ({
  key: 'RACK',
  name: '랙',
  categoryId: 'cat-1',
  sortOrder: 1,
  defaultWidth: null,
  defaultHeight: null,
  laborType: null,
  installHours: 0,
  removeHours: 0,
  relocateHours: 0,
  fieldDefs: [],
  containers: [],
  ports: portOverrides,
  links: [],
});

// ─── 테스트 ──────────────────────────────────────────────────────────────────
describe('PortsEditor', () => {
  const catalog = mkCatalog();

  it('(a) 포트 줄은 **종류와 개수**만 보여 준다', () => {
    const draft = mkDraft([
      { group: 'A', count: 12, direction: 'BI', medium: 'fiber', namePattern: '코어 {n}' },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} locked={false} issues={[]} />);

    expect(screen.getByDisplayValue('12')).toBeTruthy(); // 개수
    // 종류가 줄 제목이다 — 「광」은 추가 버튼에도 있으므로 개수 칸의 라벨로 짚는다.
    expect(screen.getByLabelText('광 개수')).toBeTruthy();
    // 지어내야 하던 값들은 화면에 없다 — 종류가 이미 정했다.
    expect(screen.queryByDisplayValue('A')).toBeNull();
    expect(screen.queryByDisplayValue('코어 {n}')).toBeNull();
  });

  /* 표는 늘 일곱 줄이다 — 무엇을 고르든 키가 그대로여야 자산마다 화면이 달라지지 않는다. */
  it('(a-2) 포트가 하나도 없어도 종류 줄은 모두 서 있다', () => {
    render(<PortsEditor draft={mkDraft([])} onChange={vi.fn()} locked={false} issues={[]} />);
    for (const name of ['전원 입력', '전원 출력', '네트워크', '광', '광 다심', '제어', '접지']) {
      expect((screen.getByLabelText(`${name} 개수`) as HTMLInputElement).value).toBe('0');
    }
  });

  /* 예전에는 종류마다 버튼이 있어 누르면 카드가 하나 쌓였다. 이제 그 줄의 개수를 적으면 된다. */
  it('(b) 개수를 적으면 그 종류의 포트가 규칙에 맞게 만들어진다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} locked={false} issues={[]} />);

    fireEvent.change(screen.getByLabelText('네트워크 개수'), { target: { value: '24' } });

    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports).toHaveLength(1);
    expect(called.ports[0]).toMatchObject({ medium: 'network', direction: 'BI', count: 24 });
    // 지어낼 필요가 없어야 한다 — 빈칸으로 나오면 예전과 같아진다.
    expect(called.ports[0]!.group).not.toBe('');
    expect(called.ports[0]!.namePattern).toContain('{n}');
  });

  it('(b-2) 전원은 입력·출력이 따로 있다 — 서로 다른 물건이다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} locked={false} issues={[]} />);

    fireEvent.change(screen.getByLabelText('전원 출력 개수'), { target: { value: '2' } });
    expect(onChange.mock.calls[0][0].ports[0]).toMatchObject({ medium: 'power', direction: 'OUT' });
  });

  /* 개수 0 이 곧 「그 종류 없음」이다 — 지우는 길이 따로 있으면 규칙이 둘이 된다. */
  it('(b-3) 개수를 0 으로 되돌리면 그 종류가 빠진다', () => {
    const existing = mkDraft([{ group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '네트워크 {n}' }]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} locked={false} issues={[]} />);

    fireEvent.change(screen.getByLabelText('네트워크 개수'), { target: { value: '0' } });
    expect(onChange.mock.calls[0][0].ports).toHaveLength(0);
  });

  /* 광은 단심과 다심이 **다른 줄**이다 — 어느 쪽인지는 심선 수가 가른다. */
  it('(b-4) 광 다심 줄은 단심 광과 섞이지 않는다', () => {
    const existing = mkDraft([
      { group: 'FIBER', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} locked={false} issues={[]} />);

    expect((screen.getByLabelText('광 개수') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('광 다심 개수') as HTMLInputElement).value).toBe('0');

    fireEvent.change(screen.getByLabelText('광 다심 개수'), { target: { value: '1' } });
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports).toHaveLength(2);
    expect(ports[1]).toMatchObject({ medium: 'fiber', count: 1 });
    expect(ports[1]!.positions).toBeGreaterThan(1);
    expect(ports[1]!.group).not.toBe(ports[0]!.group);
  });

  /* 매체를 고르는 칸은 없앴다 — 종류 버튼이 곧 매체 선택이다. 나중에 매체를 바꾸고 싶으면
     그 줄을 지우고 다시 고른다(중간에 바꾸면 이름·심선 수가 어긋난 채로 남는다). */
  it('(c) 매체·방향·그룹·이름 패턴을 고르는 칸이 없다', () => {
    const draft = mkDraft([
      { group: 'A', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'A' },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} locked={false} issues={[]} />);

    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('(d) locked=true이면 입력 전부 disabled', () => {
    const draft = mkDraft([
      { group: 'A', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'A' },
    ]);
    const onChange = vi.fn();

    render(<PortsEditor draft={draft} onChange={onChange} locked={true} issues={[]} />);

    const spinbuttons = screen.queryAllByRole('spinbutton');
    // queryAll* 은 없으면 빈 배열을 조용히 돌려준다 — count 입력이 사라지는 회귀가
    // 나도 아래 forEach 가 0회 돌아 통과해 버린다.
    expect(spinbuttons.length).toBeGreaterThan(0);
    spinbuttons.forEach((input) => expect((input as HTMLInputElement).disabled).toBe(true));

    // 구조가 잠겼으면 개수 칸이 전부 잠긴다 — 표의 모양은 그대로 두되 손댈 수 없다.
    expect(screen.getAllByRole('spinbutton').every((x) => (x as HTMLInputElement).disabled)).toBe(true);
  });

  /* 심선 수는 **다심이 있는 종류**(광)에만 뜬다. 그 안에서 1이면 어댑터, 24면 성단이다 —
     예전에는 매체 키가 그 둘을 갈랐다. 전원에는 다심이 없으므로 칸도 없다. */
  it('(e) 심선 수 칸은 **다심 줄**에만 뜬다', () => {
    const draft = mkDraft([
      { group: 'PWR', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 {n}' },
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} locked={false} issues={[]} />);

    expect(screen.queryByLabelText('전원 입력 심선 수')).toBeNull(); // 전원 — 다심이 없다
    expect(screen.queryByLabelText('광 심선 수')).toBeNull();        // 단심 광 어댑터 — 늘 1
    expect((screen.getByLabelText('광 다심 심선 수') as HTMLInputElement).value).toBe('24');
  });

  it('(e-2) 심선 수를 고치면 onChange 로 positions 가 전달된다', () => {
    const draft = mkDraft([
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} locked={false} issues={[]} />);

    fireEvent.change(screen.getByLabelText('광 다심 심선 수'), { target: { value: '12' } });
    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports[0]).toMatchObject({ positions: 12 });
  });
});

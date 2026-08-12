/**
 * PortsEditor — **고른 종류와 개수만** 묻는다.
 *
 * 그룹 키·방향·매체·이름 패턴은 화면에 없다. 고른 종류가 이미 정한 값이라 물어 봐야 답이
 * 하나뿐인 칸이었고, 접어 두어도 「무엇을 적어야 하나」를 고민하게 만들었다.
 * 심선 수만 남는다 — 같은 광이라도 성단이 24심인지 12심인지는 물건마다 다르다.
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

  /* 예전에는 빈 행 하나가 생기고 그룹 키·이름 패턴을 사용자가 지어내야 했다.
     이제 종류를 고르면 규칙에 맞게 채워져 나오고 손댈 곳은 개수뿐이다. */
  it('(b) 미리 정의된 포트 버튼 → 규칙에 맞는 행이 만들어진다', () => {
    const draft = mkDraft([]);
    const onChange = vi.fn();

    render(<PortsEditor draft={draft} onChange={onChange} locked={false} issues={[]} />);

    fireEvent.click(screen.getByRole('button', { name: '네트워크' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports).toHaveLength(1);
    expect(called.ports[0]).toMatchObject({ medium: 'network', direction: 'BI', count: 1 });
    // 지어낼 필요가 없어야 한다 — 빈칸으로 나오면 예전과 같아진다.
    expect(called.ports[0]!.group).not.toBe('');
    expect(called.ports[0]!.namePattern).toContain('{n}');
  });

  it('(b-2) 전원은 입력·출력이 따로 있다 — 서로 다른 물건이다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} locked={false} issues={[]} />);

    fireEvent.click(screen.getByRole('button', { name: '전원 출력' }));
    expect(onChange.mock.calls[0][0].ports[0]).toMatchObject({ medium: 'power', direction: 'OUT' });
  });

  it('(b-3) 같은 종류를 두 번 넣어도 그룹 키가 겹치지 않는다', () => {
    const existing = mkDraft([{ group: 'NETWORK', count: 1, direction: 'BI', medium: 'network', namePattern: '네트워크 {n}' }]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} locked={false} issues={[]} />);

    fireEvent.click(screen.getByRole('button', { name: '네트워크' }));
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
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

    // 구조가 잠겼으면 포트를 더할 방법이 아예 없어야 한다 — 눌리지 않는 버튼을 늘어놓지 않는다.
    expect(screen.queryByRole('button', { name: '네트워크' })).toBeNull();
  });

  /* 심선 수는 **다심이 있는 종류**(광)에만 뜬다. 그 안에서 1이면 어댑터, 24면 성단이다 —
     예전에는 매체 키가 그 둘을 갈랐다. 전원에는 다심이 없으므로 칸도 없다. */
  it('(e) 심선 수 칸은 **다심 포트**에만 뜬다', () => {
    const draft = mkDraft([
      { group: 'PWR', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 {n}' },
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} locked={false} issues={[]} />);

    expect(screen.queryByLabelText(/포트 1 심선 수/i)).toBeNull(); // 전원 — 다심이 없다
    expect(screen.queryByLabelText(/포트 2 심선 수/i)).toBeNull(); // 단심 광 어댑터 — 늘 1
    expect((screen.getByLabelText(/포트 3 심선 수/i) as HTMLInputElement).value).toBe('24');
  });

  it('(e-2) 심선 수를 고치면 onChange 로 positions 가 전달된다', () => {
    const draft = mkDraft([
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} locked={false} issues={[]} />);

    fireEvent.change(screen.getByLabelText(/포트 1 심선 수/i), { target: { value: '12' } });
    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports[0]).toMatchObject({ positions: 12 });
  });
});

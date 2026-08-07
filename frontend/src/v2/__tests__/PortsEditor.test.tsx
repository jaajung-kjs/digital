/**
 * PortsEditor — TDD (5 cases)
 * (a) draft.ports 행이 렌더된다
 * (b) 미리 정의된 포트 버튼 → 규칙에 맞는 행이 만들어진다
 * (c) medium select 옵션이 catalog.cableGroups에서 파생된다
 * (d) locked=true(assetCount>0)이면 입력 전부 disabled
 * (e) lineSide 체크박스: draft에서 읽기 + onChange에 반전값 전달
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
    { id: 'cg-3', key: 'fiber-trunk', name: '광 인입', color: '#15803D', laborType: null, installHoursPerM: 0, removeHoursPerM: 0, sortOrder: 3, categories: [] },
  ],
});

const mkDraft = (portOverrides: TypeDraft['ports'] = []): TypeDraft => ({
  key: 'RACK',
  name: '랙',
  categoryId: 'cat-1',
  sortOrder: 1,
  isActive: true,
  placeable: false,
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

  it('(a) draft.ports 행이 화면에 렌더된다', () => {
    const draft = mkDraft([
      { group: 'A', count: 12, direction: 'BI', medium: 'fiber', namePattern: '코어 {n}' },
    ]);
    const onChange = vi.fn();

    render(<PortsEditor draft={draft} onChange={onChange} catalog={catalog} locked={false} issues={[]} />);

    // 그룹 이름이 보여야 한다
    expect(screen.getByDisplayValue('A')).toBeTruthy();
    // 수량이 보여야 한다
    expect(screen.getByDisplayValue('12')).toBeTruthy();
    // namePattern이 보여야 한다
    expect(screen.getByDisplayValue('코어 {n}')).toBeTruthy();
  });

  /* 예전에는 빈 행 하나가 생기고 그룹 키·이름 패턴을 사용자가 지어내야 했다.
     이제 종류를 고르면 규칙에 맞게 채워져 나오고 손댈 곳은 개수뿐이다. */
  it('(b) 미리 정의된 포트 버튼 → 규칙에 맞는 행이 만들어진다', () => {
    const draft = mkDraft([]);
    const onChange = vi.fn();

    render(<PortsEditor draft={draft} onChange={onChange} catalog={catalog} locked={false} issues={[]} />);

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
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} catalog={catalog} locked={false} issues={[]} />);

    fireEvent.click(screen.getByRole('button', { name: '전원 출력' }));
    expect(onChange.mock.calls[0][0].ports[0]).toMatchObject({ medium: 'power', direction: 'OUT' });
  });

  it('(b-3) 같은 종류를 두 번 넣어도 그룹 키가 겹치지 않는다', () => {
    const existing = mkDraft([{ group: 'NETWORK', count: 1, direction: 'BI', medium: 'network', namePattern: '네트워크 {n}' }]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} catalog={catalog} locked={false} issues={[]} />);

    fireEvent.click(screen.getByRole('button', { name: '네트워크' }));
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports[1]!.group).not.toBe(ports[0]!.group);
  });

  it('(c) medium select 옵션이 catalog.cableGroups에서 파생된다', () => {
    const draft = mkDraft([
      { group: 'A', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'A' },
    ]);
    const onChange = vi.fn();

    render(<PortsEditor draft={draft} onChange={onChange} catalog={catalog} locked={false} issues={[]} />);

    // medium select에 cableGroups 의 name/key 기반 옵션이 있어야 한다
    const selects = screen.getAllByRole('combobox');
    // medium select를 찾는다 — aria-label 또는 옵션 내용으로
    const mediumSelect = selects.find((s) => {
      const options = Array.from((s as HTMLSelectElement).options);
      return options.some((o) => o.value === 'fiber') && options.some((o) => o.value === 'network');
    });
    expect(mediumSelect).toBeTruthy();

    const options = Array.from((mediumSelect as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toContain('fiber');
    expect(options).toContain('network');
  });

  it('(d) locked=true이면 입력 전부 disabled', () => {
    const draft = mkDraft([
      { group: 'A', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'A' },
    ]);
    const onChange = vi.fn();

    render(<PortsEditor draft={draft} onChange={onChange} catalog={catalog} locked={true} issues={[]} />);

    // 모든 input/select가 disabled여야 한다
    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => expect((input as HTMLInputElement).disabled).toBe(true));

    const spinbuttons = screen.queryAllByRole('spinbutton');
    // queryAll* 은 없으면 빈 배열을 조용히 돌려준다 — count 입력이 사라지는 회귀가
    // 나도 아래 forEach 가 0회 돌아 통과해 버린다.
    expect(spinbuttons.length).toBeGreaterThan(0);
    spinbuttons.forEach((input) => expect((input as HTMLInputElement).disabled).toBe(true));

    const selects = screen.getAllByRole('combobox');
    selects.forEach((select) => expect((select as HTMLSelectElement).disabled).toBe(true));

    // 구조가 잠겼으면 포트를 더할 방법이 아예 없어야 한다 — 눌리지 않는 버튼을 늘어놓지 않는다.
    expect(screen.queryByRole('button', { name: '네트워크' })).toBeNull();
  });

  /* 심선 수는 다심 종류에만 뜻이 있다 — 보통 광 포트에 칸이 뜨면 어휘가 흐려진다. */
  it('(e) 심선 수 칸은 다심 종류에만 뜬다', () => {
    const draft = mkDraft([
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber-trunk', namePattern: '광 인입', positions: 24 },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} catalog={catalog} locked={false} issues={[]} />);

    expect(screen.queryByLabelText(/포트 1 심선 수/i)).toBeNull(); // 단심 광
    expect((screen.getByLabelText(/포트 2 심선 수/i) as HTMLInputElement).value).toBe('24');
  });

  it('(e-2) 심선 수를 고치면 onChange 로 positions 가 전달된다', () => {
    const draft = mkDraft([
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber-trunk', namePattern: '광 인입', positions: 24 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} catalog={catalog} locked={false} issues={[]} />);

    fireEvent.change(screen.getByLabelText(/포트 1 심선 수/i), { target: { value: '12' } });
    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports[0]).toMatchObject({ positions: 12 });
  });
});

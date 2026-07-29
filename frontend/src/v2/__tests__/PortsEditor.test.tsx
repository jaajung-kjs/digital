/**
 * PortsEditor — TDD (5 cases)
 * (a) draft.ports 행이 렌더된다
 * (b) + 추가 클릭 → onChange에 기본 행 추가된 배열 전달
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

  it('(b) + 추가 클릭 → onChange에 기본 행 추가된 배열 전달', () => {
    const draft = mkDraft([]);
    const onChange = vi.fn();

    render(<PortsEditor draft={draft} onChange={onChange} catalog={catalog} locked={false} issues={[]} />);

    const addBtn = screen.getByRole('button', { name: /추가/i });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports).toHaveLength(1);
    // 기본행은 유효한 medium(첫 cableGroup key) 또는 비어있는 구조를 가진다
    expect(called.ports[0]).toHaveProperty('group');
    expect(called.ports[0]).toHaveProperty('count');
    expect(called.ports[0]).toHaveProperty('direction');
    expect(called.ports[0]).toHaveProperty('medium');
    expect(called.ports[0]).toHaveProperty('namePattern');
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
    spinbuttons.forEach((input) => expect((input as HTMLInputElement).disabled).toBe(true));

    const selects = screen.getAllByRole('combobox');
    selects.forEach((select) => expect((select as HTMLSelectElement).disabled).toBe(true));

    // + 추가 버튼도 disabled여야 한다
    const addBtn = screen.getByRole('button', { name: /추가/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('(e) lineSide 체크박스: draft.ports[i].lineSide=true이면 체크, onChange로 반전값 전달', () => {
    const draft = mkDraft([
      { group: 'B', count: 2, direction: 'BI', medium: 'fiber', namePattern: '선로 {n}', lineSide: true },
    ]);
    const onChange = vi.fn();

    render(<PortsEditor draft={draft} onChange={onChange} catalog={catalog} locked={false} issues={[]} />);

    // 선로측 체크박스가 체크 상태여야 한다
    const checkbox = screen.getByRole('checkbox', { name: /포트 1 선로측/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    // 클릭하면 onChange가 lineSide: false로 호출되어야 한다
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledTimes(1);
    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports[0]).toMatchObject({ lineSide: false });
  });
});

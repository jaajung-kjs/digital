import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import type { Equipment, Link } from '../../../model/types';
import { useWorkspaceRoute } from '../../../useWorkspaceRoute';
import { PowerView } from '../PowerView';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({ data: { categories: [], rackTypes: [], equipmentTypes: [{ id: 'tp', key: 'k', name: '분전반', categoryId: 'c', sortOrder: 1 }], media: [], cableTypes: [] } }),
}));

const eq = (id: string, name: string, circuitCount = 0, o: Partial<Equipment> = {}): Equipment => ({
  id, substationId: 'S1', rackId: 'r', name, typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null,
  installDate: null, manager: null, note: null, circuitCount, panelCount: null, updatedAt: '', ...o,
});
const link = (id: string, a: Link['a'], b: Link['b']): Link => ({
  id, substationId: 'S1', cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], a, b, updatedAt: '',
});
const cb = (equipmentId: string, no: number) => ({ kind: 'circuit' as const, equipmentId, no });
const to = (equipmentId: string, label?: string) => ({ kind: 'equipment' as const, equipmentId, ...(label ? { label } : {}) });

/** 소내전원반(4 교류 → 통신용 분전반) · 통신용 분전반(1 교류 MCCB1 30A → 충전기, 2 직류 예비, 3 예비). */
beforeEach(() => {
  store.getState().reset();
  const s = store.getState();
  s.create('racks', { id: 'r', substationId: 'S1', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
  s.create('equipment', eq('panel', '소내전원반', 4));
  s.create('equipment', eq('dist', '통신용 분전반', 3, { typeId: 'tp' }));
  s.create('equipment', eq('chg', '충전기', 0, { status: 'fault' }));
  s.updateCircuit('panel', 4, { current: 'AC', label: '통신용' });
  s.updateCircuit('dist', 1, { current: 'AC', label: 'MCCB1', capacity: '30A' });
  s.updateCircuit('dist', 2, { current: 'DC' });
  s.create('links', link('k1', cb('panel', 4), to('dist')));
  s.create('links', link('k2', cb('dist', 1), to('chg', 'AC IN')));
});

function Harness() {
  const route = useWorkspaceRoute();
  const loc = useLocation();
  return (
    <>
      <span data-testid="loc">{decodeURIComponent(loc.search)}</span>
      <PowerView
        substationId="S1" view={route.power} onView={route.setPowerView} focus={route.supply}
        selectedEquipmentId={route.eqId} onSelectSupply={route.selectSupply} onSelectEquipment={route.selectEquipment}
      />
    </>
  );
}
const renderTree = (extra = '') => render(
  <MemoryRouter initialEntries={[`/n/S1?view=전원 계통&power=tree${extra}`]}>
    <Routes><Route path="/n/:nodeId" element={<Harness />} /></Routes>
  </MemoryRouter>,
);
const items = () => screen.queryAllByRole('treeitem');
const keys = () => items().map((r) => r.dataset.key);
const row = (key: string) => items().find((r) => r.dataset.key === key)!;

describe('전원 계통 — 계통도', () => {
  it('뿌리 = 입력 전원 없는 공급 설비, 그 아래 차단기 번호 순 · 부하 설비의 차단기는 그 줄 아래', () => {
    renderTree();
    expect(screen.getByRole('radio', { name: '계통도' })).toBeChecked();
    expect(keys()).toEqual([
      'r:panel', 'r:panel/1', 'r:panel/2', 'r:panel/3', 'r:panel/4',
      'r:panel/4/1', 'r:panel/4/2', 'r:panel/4/3',
    ]);
    expect(row('r:panel')).toHaveAttribute('aria-level', '1');
    expect(row('r:panel/4')).toHaveAttribute('aria-level', '2');
    expect(row('r:panel/4/1')).toHaveAttribute('aria-level', '3');
    expect(row('r:panel/4')).toHaveTextContent('차단기 4 · 통신용 · 교류');
    expect(row('r:panel/4')).toHaveTextContent('통신용 분전반');
    expect(row('r:panel/4')).toHaveTextContent('분전반'); // 품목(흐림)
    expect(row('r:panel/4/1')).toHaveTextContent('차단기 1 · MCCB1 · 30A · 교류');
    expect(within(row('r:panel/4/1')).getByText('고장')).toBeInTheDocument(); // 정상이 아니면 상태
  });

  it('입력 전원이 없는 뿌리는 흐린 「입력 전원 미등록」(경고 아님)', () => {
    renderTree();
    const meta = within(row('r:panel')).getByText('입력 전원 미등록');
    expect(meta).toHaveClass('text-content-muted');
    expect(meta).not.toHaveClass('text-warning');
  });

  it('부하가 없는 차단기는 「예비」로 남는다', () => {
    renderTree();
    expect(within(row('r:panel/4/3')).getByText('예비')).toHaveClass('text-content-faint');
    expect(within(row('r:panel/1')).getByText('예비')).toBeInTheDocument();
  });

  it('이중 입력 — 두 번째 자리는 이름 + 「위에 표시됨」, 누르면 처음 펼친 줄로(접힌 조상은 편다)', () => {
    const s = store.getState();
    s.create('equipment', eq('ups', 'UPS', 1));
    s.create('links', link('k3', cb('ups', 1), to('dist')));
    renderTree();
    const anchor = items().find((r) => r.dataset.anchor === 'dist')!;
    const again = items().filter((r) => within(r).queryByRole('button', { name: '위에 표시됨' }));
    expect(again).toHaveLength(1);
    expect(again[0]).toHaveTextContent('통신용 분전반');
    expect(again[0]!.dataset.key).not.toBe(anchor.dataset.key);
    // 처음 자리의 부모를 접어 둔 뒤 눌러도 펴고 그리로 간다.
    const parentKey = anchor.dataset.key!.split('/').slice(0, -1).join('/');
    fireEvent.click(within(row(parentKey)).getByRole('button', { name: /접기$/ }));
    expect(items().some((r) => r.dataset.anchor === 'dist')).toBe(false);
    fireEvent.click(within(again[0]!).getByRole('button', { name: '위에 표시됨' }));
    const back = items().find((r) => r.dataset.anchor === 'dist')!;
    expect(back).toBeInTheDocument();
    expect(document.activeElement).toBe(back);
  });

  it('순환(분전반 → 충전기 → 분전반)은 그 자리에 경고 「순환」으로 멈춘다', () => {
    const s = store.getState();
    s.update('equipment', 'chg', { circuitCount: 1 });
    s.updateCircuit('chg', 1, { current: 'DC' });
    s.create('links', link('k4', cb('chg', 1), to('dist', 'DC IN')));
    renderTree();
    const loop = row('r:panel/4/1/1');
    expect(loop).toHaveTextContent('통신용 분전반');
    expect(within(loop).getByText('순환')).toHaveClass('text-warning');
    expect(keys().filter((k) => k!.startsWith('r:panel/4/1/1/'))).toEqual([]);
  });

  it('교류/직류 거르기 — 직류 보기에서는 교류로 받는 분전반이 뿌리, 보일 차단기 없는 뿌리는 숨긴다', () => {
    renderTree();
    fireEvent.change(screen.getByRole('combobox', { name: '교류/직류' }), { target: { value: 'DC' } });
    expect(keys()).toEqual(['r:dist', 'r:dist/2']);
    expect(row('r:dist')).toHaveTextContent('교류 입력: 소내전원반 차단기 4');
  });

  it('검색은 맞는 줄과 그 조상만 남긴다', () => {
    renderTree();
    fireEvent.change(screen.getByRole('textbox', { name: '전원 계통 검색' }), { target: { value: '충전기' } });
    expect(keys()).toEqual(['r:panel', 'r:panel/4', 'r:panel/4/1']);
    fireEvent.change(screen.getByRole('textbox', { name: '전원 계통 검색' }), { target: { value: '없는것' } });
    expect(screen.getByText("'없는것'에 해당하는 설비·차단기가 없습니다")).toBeInTheDocument();
  });

  it('설비 줄을 누르면 그 설비(eq), 차단기 줄은 부하 설비, 예비 줄은 그 차단기를 가진 설비', () => {
    renderTree();
    fireEvent.click(row('r:panel'));
    expect(screen.getByTestId('loc')).toHaveTextContent('eq=panel');
    fireEvent.click(row('r:panel/4/1'));
    expect(screen.getByTestId('loc')).toHaveTextContent('eq=chg');
    expect(row('r:panel/4/1')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(row('r:panel/4/3'));
    expect(screen.getByTestId('loc')).toHaveTextContent('eq=dist');
  });

  it('줄마다 접기/펼치기, 도구줄의 「모두 접기 / 모두 펼치기」', () => {
    renderTree();
    fireEvent.click(within(row('r:panel/4')).getByRole('button', { name: /접기$/ }));
    expect(keys()).toEqual(['r:panel', 'r:panel/1', 'r:panel/2', 'r:panel/3', 'r:panel/4']);
    fireEvent.click(screen.getByRole('button', { name: '모두 접기' }));
    expect(keys()).toEqual(['r:panel']);
    fireEvent.click(screen.getByRole('button', { name: '모두 펼치기' }));
    expect(keys()).toHaveLength(8);
  });

  it('차단기를 가진 설비가 없으면 시작 안내', () => {
    store.getState().reset();
    renderTree();
    expect(screen.getByText('차단기가 있는 설비가 없습니다')).toBeInTheDocument();
    expect(items()).toHaveLength(0);
  });
});

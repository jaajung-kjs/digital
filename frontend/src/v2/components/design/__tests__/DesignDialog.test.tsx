import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverheadRates } from '@twin/core';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import type { Catalog, Equipment, FiberLine, Rack } from '../../../model/types';
import { DesignDialog } from '../DesignDialog';

const RATES: OverheadRates = {
  byDuration: {
    간접노무비: {
      '10억미만': { '183': 0.191, '365': 0.195, '1095': 0.198, '1096+': 0.21 },
      '10-50억': { '183': 0.189, '365': 0.193, '1095': 0.196, '1096+': 0.208 },
      '50-300억': { '183': 0.19, '365': 0.194, '1095': 0.197, '1096+': 0.209 },
      '300-1000억': { '183': 0.191, '365': 0.195, '1095': 0.198, '1096+': 0.21 },
      '1000억이상': { '183': 0.189, '365': 0.193, '1095': 0.196, '1096+': 0.208 },
    },
    기타경비: {
      '10억미만': { '183': 0.055, '365': 0.057, '1095': 0.061, '1096+': 0.067 },
      '10-50억': { '183': 0.058, '365': 0.059, '1095': 0.063, '1096+': 0.069 },
      '50-300억': { '183': 0.064, '365': 0.066, '1095': 0.069, '1096+': 0.076 },
      '300-1000억': { '183': 0.066, '365': 0.068, '1095': 0.072, '1096+': 0.078 },
      '1000억이상': { '183': 0.069, '365': 0.071, '1095': 0.074, '1096+': 0.081 },
    },
  },
  bySize: {
    일반관리비: { '10억미만': 0.08, '10-50억': 0.08, '50-300억': 0.065, '300-1000억': 0.05, '1000억이상': 0.045 },
    이윤: { '10억미만': 0.15, '10-50억': 0.15, '50-300억': 0.12, '300-1000억': 0.1, '1000억이상': 0.09 },
  },
  fixed: { 고용보험료: 0.0101, 건강보험료: 0.03595, 연금보험료: 0.0475, 퇴직공제부금비: 0.023, 노인장기요양보험료: 0.1314 },
  sanan: {
    '2천만미만': { rate: 0, base: null },
    '5억미만': { rate: 0.0315, base: null },
    '5-50억': { rate: 0.0253, base: 3_300_000 },
    '50억이상': { rate: 0.026, base: null },
  },
};

const labor = (laborCode: string | null, unitPrice: number | null, install: number | null, remove: number | null = 0, relocate: number | null = 0) =>
  ({ laborCode, unitPrice, installManDays: install, removeManDays: remove, relocateManDays: relocate });

const BASE_CATALOG: Catalog = {
  categories: [],
  rackTypes: [{ id: 'rt', key: 'r', name: '19인치 통신랙', sortOrder: 1, ...labor('1086', 1_200_000, 1, 0.5, 0.8) }],
  equipmentTypes: [
    { id: 'et', key: 'e', name: 'L3 스위치', categoryId: 'c', sortOrder: 1, ...labor('1086', 3_000_000, 0.5) },
    { id: 'ex', key: 'x', name: '미등록 직종 설비', categoryId: 'c', sortOrder: 2, ...labor('9999', 100, 2) },
  ],
  cableTypes: [{ id: 'smf', key: 's', name: '광케이블', medium: 'optical', sortOrder: 1, unitPrice: 3400, installManDays: 0.06, removeManDays: 0.03, laborCode: '1086' }],
  media: [],
  wageStandard: { latestDate: '2026-상반기', rows: [{ code: '1086', name: '통신내선공', sector: '', wage: 300_000, marker: '', markerNote: null, effectiveLabel: '2026-상반기' }] },
  overheadStandard: { id: 'oh', effective: '2026-04-30', kind: '', ...(RATES as unknown as Pick<NonNullable<Catalog['overheadStandard']>, 'byDuration' | 'bySize' | 'fixed' | 'sanan'>) },
};

const h = vi.hoisted(() => ({ catalog: null as unknown }));
vi.mock('../../../model/hooks', () => ({ useCatalog: () => ({ data: h.catalog }) }));
vi.mock('../../../hooks', async (orig) => ({ ...(await orig<typeof import('../../../hooks')>()), useV2OrgTree: () => ({ data: undefined }) }));

const rack = (id: string, substationId: string, over: Partial<Rack> = {}): Rack => ({
  id, substationId, name: id, rackTypeId: 'rt', floorId: 'F1', x: 0, y: 0, width: 60, height: 60, facing: '아래', updatedAt: 't', ...over,
});
const eq = (id: string, substationId: string, rackId: string, over: Partial<Equipment> = {}): Equipment => ({
  id, substationId, rackId, name: id, typeId: 'et', status: 'normal', model: null, maker: null, madeOn: null, serial: null,
  installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: 't', ...over,
});
const line = (id: string, over: Partial<FiberLine> = {}): FiberLine => ({
  id, cableTypeId: 'smf', coreCount: 24, name: null, lengthKm: 1.5, segments: [],
  aSubstationId: 'S1', aEquipmentId: null, aPanel: null, aStartNo: 1, bSubstationId: 'S2', bEquipmentId: null, bPanel: null, bStartNo: 1,
  aSubstationName: '북춘천S/S', bSubstationName: '(구)춘천S/S', updatedAt: 't', ...over,
});

function seed(saved: { racks?: Rack[]; equipment?: Equipment[] } = {}) {
  store.setState({
    saved: {
      ...store.getState().saved,
      substations: { S1: { id: 'S1', name: '북춘천S/S' }, S2: { id: 'S2', name: '(구)춘천S/S' } },
      racks: saved.racks ?? [], equipment: saved.equipment ?? [],
    },
  });
}

const open = () => render(<DesignDialog open onClose={vi.fn()} />);
/** 상자 안 — 인쇄본(`body` 밑, 화면에서는 숨김)에도 같은 글이 서므로 화면 시험은 상자 안만 본다. */
const ui = () => within(screen.getByRole('dialog'));
const printed = () => within(document.querySelector<HTMLElement>('[data-design-print]')!);

beforeEach(() => {
  store.getState().reset();
  h.catalog = BASE_CATALOG;
});

describe('설계서', () => {
  it('두 국에 걸친 변경안이 한 창에 국별로 묶이고, 합계는 평평한 목록 하나에서 낸다', () => {
    seed();
    store.getState().create('racks', rack('R-new', 'S2'));
    store.getState().create('equipment', eq('E-new', 'S2', 'R-new'));
    store.getState().create('fiberLines', line('L1'));
    open();
    const groups = ui().getAllByTestId('design-group');
    expect(groups.map((g) => within(g).getAllByRole('columnheader')[0]!.textContent)).toEqual([
      expect.stringContaining('(구)춘천S/S'), expect.stringContaining('북춘천S/S'),
    ]);
    /* 줄마다 묶음 하나에만 선다 — 두 국에 걸친 광선로도(대표 국 A 끝 북춘천). */
    const names = groups.flatMap((g) => within(g).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[2]!.textContent));
    expect(names.sort()).toEqual(['E-new', 'R-new', '북춘천S/S–(구)춘천S/S'].sort());
    expect(within(groups[1]!).getByText('북춘천S/S–(구)춘천S/S')).toBeInTheDocument();
    expect(within(groups[1]!).getByText('광선로')).toBeInTheDocument();
    /* 1,200,000 + 3,000,000 + 1500 m × 3,400 = 9,300,000 */
    expect(ui().getByTestId('design-material-total').textContent).toBe('9,300,000');
    expect(ui().getByTestId('design-mandays-total').textContent).toBe('91.500');
  });

  it('랙째 옮기면 랙 이설 1건 — 안의 설비는 이설로 세지 않는다', () => {
    seed({ racks: [rack('R1', 'S1')], equipment: [eq('E1', 'S1', 'R1')] });
    store.getState().update('racks', 'R1', { x: 120 });
    open();
    const rows = ui().getAllByRole('row').filter((r) => within(r).queryByText('이설'));
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('랙')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('R1')).toBeInTheDocument();
    expect(ui().queryAllByTestId('design-group')).toHaveLength(0);
  });

  it('제비율이 없으면 금액을 내지 않고 기준정보 미등록으로 막는다', () => {
    h.catalog = { ...BASE_CATALOG, overheadStandard: null };
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    expect(ui().getByTestId('design-blocked').textContent).toContain('제비율 기준정보 미등록 — 기준정보에서 업로드하세요');
    expect(ui().queryByTestId('design-total')).toBeNull();
    expect(ui().queryByText('총공사비')).toBeNull();
  });

  it('노임단가가 없어도 막는다', () => {
    h.catalog = { ...BASE_CATALOG, wageStandard: null };
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    expect(ui().getByTestId('design-blocked').textContent).toContain('노임단가 기준정보 미등록');
    expect(ui().queryByTestId('design-total')).toBeNull();
  });

  it('직종 단가가 없는 줄은 「단가 없음」, 합계 옆에 「노임 미반영 n건」', () => {
    seed({ racks: [rack('R1', 'S1')] });
    store.getState().create('equipment', eq('E-x', 'S1', 'R1', { typeId: 'ex' }));
    open();
    expect(ui().getByText('단가 없음')).toBeInTheDocument();
    expect(ui().getByText('노임 미반영 1건')).toBeInTheDocument();
    expect(ui().getByTestId('design-total')).toBeInTheDocument();
  });

  it('노무유형이 없는 품목은 「노무유형 미지정 n건」으로 따로 선다', () => {
    h.catalog = { ...BASE_CATALOG, rackTypes: [{ ...BASE_CATALOG.rackTypes[0]!, laborCode: null }] };
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    expect(ui().getByText('노무유형 미지정 1건')).toBeInTheDocument();
  });

  it('공사기간을 바꾸면 간접노무비가 바뀐다', () => {
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    const indirect = () => ui().getByText('간접노무비').closest('tr')!;
    /* 공량 1 × 300,000 = 300,000 · 183일 이하 19.1% */
    expect(within(indirect()).getByText('57,300')).toBeInTheDocument();
    fireEvent.change(ui().getByLabelText('공사기간'), { target: { value: '200' } });
    expect(within(indirect()).getByText('58,500')).toBeInTheDocument();
    expect(within(indirect()).getByText('19.5%')).toBeInTheDocument();
    expect(within(indirect()).getByText('직접노무비')).toBeInTheDocument();
  });

  it('공사기간이 비었거나 잘못이면 그 자리에서 말하고 금액을 막는다 — 0 으로 셈하지 않는다', () => {
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    const days = ui().getByLabelText('공사기간');
    for (const bad of ['', 'abc', '0']) {
      fireEvent.change(days, { target: { value: bad } });
      fireEvent.blur(days);
      expect(ui().getByText('1 이상의 일수를 입력하세요')).toBeInTheDocument();
      expect(ui().getByTestId('design-blocked').textContent).toContain('공사기간 입력 오류');
      expect(ui().queryByTestId('design-total')).toBeNull();
    }
    fireEvent.change(days, { target: { value: '45' } });
    expect(ui().queryByText('1 이상의 일수를 입력하세요')).toBeNull();
    expect(ui().getByTestId('design-total')).toBeInTheDocument();
  });

  it('신설인데 자재단가가 없으면 재료비는 「—」, 합계 옆에 「자재단가 미입력 n건」', () => {
    h.catalog = { ...BASE_CATALOG, rackTypes: [{ ...BASE_CATALOG.rackTypes[0]!, unitPrice: null }] };
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    const row = ui().getByText('R-new').closest('tr')!;
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2); // 자재단가 · 재료비
    expect(within(row).queryByText('0')).toBeNull();
    expect(ui().getByTestId('design-unpriced').textContent).toBe('자재단가 미입력 1건');
  });

  it('노임단가가 없으면 공사규모는 재료비만 반영했다고 적는다', () => {
    h.catalog = { ...BASE_CATALOG, wageStandard: null };
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    expect(ui().getByText('노임단가 미등록 — 재료비만 반영')).toBeInTheDocument();
  });

  it('변경이 없으면 「변경 내용이 없습니다」, 값 변경만 있으면 산출하지 않는다고 말한다', () => {
    seed({ racks: [rack('R1', 'S1')] });
    const { unmount } = open();
    expect(ui().getByText('변경 내용이 없습니다.')).toBeInTheDocument();
    expect(ui().queryByText(/값 변경/)).toBeNull();
    unmount();
    store.getState().update('racks', 'R1', { name: '새 이름' });
    open();
    expect(ui().getByText('변경 내용이 없습니다.')).toBeInTheDocument();
    expect(ui().getByText('값 변경(길이·품목 등)은 산출하지 않습니다.')).toBeInTheDocument();
  });

  it('품목을 못 찾은 줄은 「품목 미지정」으로 남는다', () => {
    seed();
    store.getState().create('racks', rack('R-new', 'S1', { rackTypeId: 'gone' }));
    open();
    expect(ui().getByText('품목 미지정')).toBeInTheDocument();
  });

  it('인쇄 — 상자 밖 인쇄본에 머리말(대상 변전소·작성일·기준)·산출 내역 표·공사비 표·합계가 선다', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    seed();
    store.getState().create('racks', rack('R-new', 'S2'));
    store.getState().create('fiberLines', line('L1'));
    open();
    fireEvent.click(ui().getByRole('button', { name: '인쇄' }));
    expect(print).toHaveBeenCalledOnce();

    const doc = document.querySelector<HTMLElement>('[data-design-print]')!;
    expect(doc.parentElement).toBe(document.body);
    expect(screen.getByRole('dialog').contains(doc)).toBe(false);
    expect(printed().getByRole('heading', { level: 1, name: '설계서', hidden: true })).toBeInTheDocument();
    expect(printed().getByText('(구)춘천S/S · 북춘천S/S')).toBeInTheDocument();
    expect(printed().getByText(/^\d{4}-\d{2}-\d{2}$/)).toBeInTheDocument();
    expect(printed().getByText('노임단가 2026-상반기 · 제비율 2026-04-30')).toBeInTheDocument();
    expect(printed().getByText('공사기간 30일 · 계약방법 경쟁 · 산재보험료 한전 기준')).toBeInTheDocument();

    const [items, cost] = [...doc.querySelectorAll('table')];
    expect(items!.querySelector('thead')!.textContent).toContain('산출 내역');
    expect(items!.querySelector('thead')!.textContent).toContain('공량');
    expect(within(items!).getByTestId('design-material-total').textContent).toBe('6,300,000');
    expect(cost!.querySelector('thead')!.textContent).toContain('공사비');
    expect(within(cost!).getByText('총공사비')).toBeInTheDocument();
    expect(within(cost!).getByTestId('design-total').textContent).toBe(ui().getByTestId('design-total').textContent);
    /* 인쇄본은 머리·합계 줄을 붙이지 않는다(종이에서 sticky 는 뜻이 없고 쪽마다 머리줄이 반복된다). */
    expect(doc.querySelector('.sticky')).toBeNull();
  });

  it('빈 변경안에는 인쇄 단추가 없다', () => {
    seed();
    open();
    expect(ui().queryByRole('button', { name: '인쇄' })).toBeNull();
  });
});

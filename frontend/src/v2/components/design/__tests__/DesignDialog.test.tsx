import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverheadRates } from '@twin/core';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import type { Catalog, Equipment, FiberLine, Rack } from '../../../model/types';
import { DesignDialog, PRINTING_CLASS } from '../DesignDialog';

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
  window.sessionStorage.clear();
  document.documentElement.classList.remove(PRINTING_CLASS);
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
    const names = groups.flatMap((g) => within(g).getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length > 0)
      .map((r) => within(r).getAllByRole('cell')[2]!.textContent));
    expect(names.sort()).toEqual(['E-new', 'R-new', '북춘천S/S–(구)춘천S/S'].sort());
    expect(within(groups[1]!).getByText('북춘천S/S–(구)춘천S/S')).toBeInTheDocument();
    expect(within(groups[1]!).getByText('광선로')).toBeInTheDocument();
    /* B 끝 (구)춘천 묶음에는 수량 없이 「어디에 실렸는지」만 선다. */
    const ref = within(groups[0]!).getByTestId('design-ref');
    expect(ref.textContent).toBe('광선로 북춘천S/S–(구)춘천S/S · 북춘천S/S 묶음에 포함');
    expect(within(groups[1]!).queryByTestId('design-ref')).toBeNull();
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

  it('제비율이 없어도 노임단가가 있으면 직접노무비까지는 낸다 — 종이에는 「미산출」로 적는다', () => {
    h.catalog = { ...BASE_CATALOG, overheadStandard: null };
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    const direct = ui().getByText('직접노무비').closest('tr')!;
    expect(within(direct).getByText('300,000')).toBeInTheDocument();
    expect(printed().getByTestId('design-blocked').textContent).toBe('제비율 미등록 — 공사비 미산출');
    expect(printed().queryByText(/업로드/)).toBeNull();
  });

  it('직종 단가가 없는 줄은 「미등록」, 총공사비 옆에 「노무비 미반영 n건」', () => {
    seed({ racks: [rack('R1', 'S1')] });
    store.getState().create('equipment', eq('E-x', 'S1', 'R1', { typeId: 'ex' }));
    open();
    expect(ui().getByText('미등록')).toBeInTheDocument();
    expect(ui().getByTestId('design-flags').textContent).toBe('노무비 미반영 1건');
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
    expect(ui().getByTestId('design-flags').textContent).toBe('자재단가 미입력 1건');
  });

  it('품목에 공량이 없으면 그 줄은 「미입력」, 합계·총공사비 옆에 「공량 미입력 n건」 — 셈은 0', () => {
    h.catalog = { ...BASE_CATALOG, rackTypes: [{ ...BASE_CATALOG.rackTypes[0]!, relocateManDays: null }] };
    seed({ racks: [rack('R1', 'S1')] });
    store.getState().update('racks', 'R1', { x: 500 });
    open();
    const row = ui().getByText('R1').closest('tr')!;
    expect(within(row).getByText('미입력')).toBeInTheDocument();
    expect(ui().getByTestId('design-mandays-missing').textContent).toBe('공량 미입력 1건');
    expect(ui().getByTestId('design-mandays-total').textContent).toBe('0.000');
    expect(ui().getByTestId('design-flags').textContent).toBe('공량 미입력 1건');
  });

  it('철거 줄은 자재단가·재료비 모두 「—」', () => {
    seed({ racks: [rack('R1', 'S1')] });
    store.getState().remove('racks', 'R1');
    open();
    const row = ui().getByText('R1').closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[6]!.textContent).toBe('—');
    expect(cells[7]!.textContent).toBe('—');
  });

  it('소수 m 의 재료비는 줄마다 원 단위 — 산출 내역 합계 = 원가계산서 재료비', () => {
    h.catalog = { ...BASE_CATALOG, cableTypes: [{ ...BASE_CATALOG.cableTypes[0]!, unitPrice: 3_401 }] };
    seed();
    store.getState().create('fiberLines', line('L1', { lengthKm: 0.0025 }));
    open();
    /* 2.5 m × 3,401 = 8,502.5 → 8,503 */
    expect(ui().getByTestId('design-material-total').textContent).toBe('8,503');
    const material = ui().getByText('재료비', { selector: 'td' }).closest('tr')!;
    expect(within(material).getByText('8,503')).toBeInTheDocument();
  });

  it('원가계산서 차례 — 소계 줄과 부가가치세의 근거(공급가액)', () => {
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    const cost = ui().getByText('총공사비').closest('table')!;
    const labels = [...cost.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')!.textContent);
    expect(labels).toEqual([
      '재료비', '직접노무비', '간접노무비', '노무비 계',
      '공구손료', '산재보험료', '고용보험료', '건강보험료', '연금보험료', '퇴직공제부금비', '노인장기요양보험료', '산업안전보건관리비', '기타경비',
      '경비 계', '순공사원가', '일반관리비', '이윤', '총원가(공급가액)', '부가가치세',
    ]);
    const vat = within(cost).getByText('부가가치세').closest('tr')!;
    expect(within(vat).getByText('공급가액')).toBeInTheDocument();
  });

  it('노무유형별 공량의 노무비 열 합 = 직접노무비, 직종 이름 자연 순서', () => {
    h.catalog = {
      ...BASE_CATALOG,
      equipmentTypes: [...BASE_CATALOG.equipmentTypes, { id: 'e2', key: 'e2', name: '전원 설비', categoryId: 'c', sortOrder: 3, ...labor('1001', 100, 0.25) }],
      wageStandard: {
        latestDate: '2026-상반기',
        rows: [
          { code: '1086', name: '통신내선공', sector: '', wage: 300_000, marker: '', markerNote: null, effectiveLabel: '2026-상반기' },
          { code: '1001', name: '전기공', sector: '', wage: 333_333, marker: '', markerNote: null, effectiveLabel: '2026-상반기' },
        ],
      },
    };
    seed({ racks: [rack('R1', 'S1')] });
    store.getState().create('equipment', eq('E1', 'S1', 'R1'));
    store.getState().create('equipment', eq('E2', 'S1', 'R1', { typeId: 'e2' }));
    open();
    const laborTable = ui().getByText('노무유형별 공량').closest('table')!;
    const rows = [...laborTable.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
    /* 전기공 0.25 × 333,333 = 83,333.25 → 83,333 · 통신내선공 0.5 × 300,000 = 150,000 */
    expect(rows).toEqual([
      ['전기공', '0.250', '333,333', '83,333'],
      ['통신내선공', '0.500', '300,000', '150,000'],
      ['총공량', '0.750', '', '233,333'],
    ]);
    const direct = ui().getByText('직접노무비', { selector: 'td:first-child' }).closest('tr')!;
    expect(within(direct).getByText('233,333')).toBeInTheDocument();
  });

  it('산출 조건(공사명·공사기간·계약방법·산재 기준)은 상자를 다시 열어도 남는다', () => {
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    const first = open();
    expect(printed().getByText('(공사명 미입력)')).toBeInTheDocument();
    fireEvent.change(ui().getByLabelText('공사명'), { target: { value: '북춘천 광선로 신설' } });
    fireEvent.change(ui().getByLabelText('공사기간'), { target: { value: '90' } });
    fireEvent.click(ui().getByRole('radio', { name: '수의' }));
    first.unmount();
    open();
    expect((ui().getByLabelText('공사명') as HTMLInputElement).value).toBe('북춘천 광선로 신설');
    expect((ui().getByLabelText('공사기간') as HTMLInputElement).value).toBe('90');
    expect(ui().getByRole('radio', { name: '수의' })).toHaveAttribute('aria-checked', 'true');
    expect(printed().getByText('북춘천 광선로 신설')).toBeInTheDocument();
  });

  it('세션 저장소가 막혀 있어도 열린다', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    expect((ui().getByLabelText('공사기간') as HTMLInputElement).value).toBe('30');
    fireEvent.change(ui().getByLabelText('공사기간'), { target: { value: '60' } });
    expect((ui().getByLabelText('공사기간') as HTMLInputElement).value).toBe('60');
    get.mockRestore();
    set.mockRestore();
  });

  it('노임단가가 없으면 공사규모는 재료비만 반영했다고 적는다', () => {
    h.catalog = { ...BASE_CATALOG, wageStandard: null };
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    expect(ui().getByText('노임단가 미등록 — 재료비만 반영')).toBeInTheDocument();
  });

  it('산출할 것이 없으면 그렇게 말하고, 길이·품목이 실제로 바뀐 것만 「산출하지 않습니다」라고 알린다', () => {
    seed({ racks: [rack('R1', 'S1')] });
    const notice = '수정 사항(길이·품목 등)은 산출하지 않습니다.';
    const first = open();
    expect(ui().getByText('산출할 항목이 없습니다.')).toBeInTheDocument();
    expect(ui().queryByText(notice)).toBeNull();
    first.unmount();
    /* 이름만 바꾼 것은 설계서와 상관없다. */
    store.getState().update('racks', 'R1', { name: '새 이름' });
    const second = open();
    expect(ui().queryByText(notice)).toBeNull();
    second.unmount();
    /* 품목을 바꾸면 알린다 — 되돌리면 다시 조용하다. */
    store.getState().update('racks', 'R1', { rackTypeId: 'rt2' });
    const third = open();
    expect(ui().getByText(notice)).toBeInTheDocument();
    third.unmount();
    store.getState().update('racks', 'R1', { rackTypeId: 'rt' });
    open();
    expect(ui().queryByText(notice)).toBeNull();
  });

  it('품목을 못 찾은 줄은 「품목 미지정」으로 남는다', () => {
    seed();
    store.getState().create('racks', rack('R-new', 'S1', { rackTypeId: 'gone' }));
    open();
    expect(ui().getByText('품목 미지정')).toBeInTheDocument();
  });

  it('인쇄 — 인쇄하는 동안만 <html> 에 표시를 단다(앱의 다른 인쇄는 그대로), afterprint 에 걷는다', () => {
    const root = document.documentElement;
    const during: boolean[] = [];
    const print = vi.spyOn(window, 'print').mockImplementation(() => { during.push(root.classList.contains(PRINTING_CLASS)); });
    seed();
    store.getState().create('racks', rack('R-new', 'S1'));
    open();
    expect(root.classList.contains(PRINTING_CLASS)).toBe(false);
    fireEvent.click(ui().getByRole('button', { name: '인쇄' }));
    expect(print).toHaveBeenCalledOnce();
    expect(during).toEqual([true]);
    window.dispatchEvent(new Event('afterprint'));
    expect(root.classList.contains(PRINTING_CLASS)).toBe(false);
    print.mockRestore();
  });

  it('인쇄 — afterprint 가 오지 않아도 잠시 뒤 표시를 걷는다', () => {
    vi.useFakeTimers();
    try {
      const print = vi.spyOn(window, 'print').mockImplementation(() => {});
      seed();
      store.getState().create('racks', rack('R-new', 'S1'));
      open();
      fireEvent.click(ui().getByRole('button', { name: '인쇄' }));
      expect(document.documentElement.classList.contains(PRINTING_CLASS)).toBe(true);
      vi.advanceTimersByTime(10_000);
      expect(document.documentElement.classList.contains(PRINTING_CLASS)).toBe(false);
      print.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('인쇄 — 상자 밖 인쇄본에 머리말(대상 변전소·작성일·기준)·산출 내역 표·공사비 표·합계가 선다', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    seed();
    store.getState().create('racks', rack('R-new', 'S2'));
    store.getState().create('fiberLines', line('L1'));
    open();
    fireEvent.click(ui().getByRole('button', { name: '인쇄' }));
    expect(print).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('afterprint'));

    const doc = document.querySelector<HTMLElement>('[data-design-print]')!;
    expect(doc.parentElement).toBe(document.body);
    expect(screen.getByRole('dialog').contains(doc)).toBe(false);
    expect(printed().getByRole('heading', { level: 1, name: '설계서', hidden: true })).toBeInTheDocument();
    expect(printed().getByText('(구)춘천S/S · 북춘천S/S')).toBeInTheDocument();
    expect(printed().getByText(/^\d{4}-\d{2}-\d{2}$/)).toBeInTheDocument();
    expect(printed().getByText('노임단가 2026-상반기 · 제비율 2026-04-30')).toBeInTheDocument();
    expect(printed().getByText('공사기간 30일 · 계약방법 경쟁 · 산재보험료 한전 기준')).toBeInTheDocument();

    const tables = [...doc.querySelectorAll('table')];
    expect(tables).toHaveLength(3);
    const [items, labor, cost] = tables;
    /* 노무유형별 공량은 산출 내역과 공사비 사이 — 현장 설계서의 공량 집계. */
    expect(labor!.querySelector('thead')!.textContent).toContain('노무유형별 공량');
    expect(within(labor!).getByText('총공량')).toBeInTheDocument();
    expect(printed().getByText('(공사명 미입력)')).toBeInTheDocument();
    expect(within(labor!).getByText('통신내선공')).toBeInTheDocument();
    expect(items!.querySelector('thead')!.textContent).toContain('산출 내역');
    expect(items!.querySelector('thead')!.textContent).toContain('공량');
    expect(within(items!).getByTestId('design-material-total').textContent).toBe('6,300,000');
    expect(cost!.querySelector('thead')!.textContent).toContain('공사비');
    expect(within(cost!).getByText('총공사비')).toBeInTheDocument();
    expect(within(cost!).getByTestId('design-total').textContent).toBe(ui().getByTestId('design-total').textContent);
    /* 인쇄본은 머리·합계 줄을 붙이지 않는다(종이에서 sticky 는 뜻이 없고 쪽마다 머리줄이 반복된다). */
    expect(doc.querySelector('thead.sticky, tfoot.sticky')).toBeNull();
  });

  it('빈 변경안에는 인쇄 단추가 없다', () => {
    seed();
    open();
    expect(ui().queryByRole('button', { name: '인쇄' })).toBeNull();
  });
});

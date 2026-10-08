import { describe, expect, it } from 'vitest';
import { unitReportItem, cableReportItem, computeReport, materialCostOf } from './computeReport.js';
import type { ReportItem } from './computeReport.js';

const labor = { laborCode: '통신내선공', unitPrice: null, installManDays: 2, removeManDays: 1, relocateManDays: 3 };
const fiberCable = { name: '광케이블', laborCode: '통신외선공', installManDays: 0.04, removeManDays: 0.02 };

describe('unitReportItem', () => {
  it('작업별 공량', () => {
    expect(unitReportItem('equipment-install', 'L3 스위치 1', 'L3 스위치', labor)).toMatchObject({ qty: 1, unit: '대', manDays: 2, laborCode: '통신내선공', manDaysMissing: false });
    expect(unitReportItem('equipment-relocate', 'L3 스위치 1', 'L3 스위치', labor).manDays).toBe(3);
    expect(unitReportItem('rack-install', '랙 1', '19인치 랙', labor).manDays).toBe(2);
  });
  it('철거', () => {
    expect(unitReportItem('equipment-remove', 'L3 스위치 1', 'L3 스위치', labor).manDays).toBe(1);
  });
  it('공량 미입력(null) — 0 으로 세고 미입력으로 알린다. 0 은 미입력이 아니다', () => {
    const blank = { ...labor, relocateManDays: null };
    expect(unitReportItem('rack-relocate', '랙 1', '19인치 랙', blank)).toMatchObject({ manDays: 0, manDaysMissing: true });
    expect(unitReportItem('rack-install', '랙 1', '19인치 랙', blank).manDaysMissing).toBe(false);
    expect(unitReportItem('rack-relocate', '랙 1', '19인치 랙', { ...labor, relocateManDays: 0 })).toMatchObject({ manDays: 0, manDaysMissing: false });
  });
});

describe('cableReportItem', () => {
  it('lengthM × perM', () => {
    expect(cableReportItem('cable-install', 'A↔B', fiberCable, 50)).toMatchObject({ qty: 50, unit: 'm', manDays: 2, laborCode: '통신외선공' });
    expect(cableReportItem('cable-remove', 'A↔B', fiberCable, 50).manDays).toBe(1);
  });
  it('길이 미입력 → 0 + note', () => {
    expect(cableReportItem('cable-install', 'A↔B', fiberCable, null)).toMatchObject({ qty: 0, manDays: 0, note: '길이 미입력' });
  });
  it('m 당 공량 미입력(null) → 공량 미입력', () => {
    expect(cableReportItem('cable-remove', 'A↔B', { ...fiberCable, removeManDays: null }, 50)).toMatchObject({ qty: 50, manDays: 0, manDaysMissing: true });
    expect(cableReportItem('cable-install', 'A↔B', { ...fiberCable, removeManDays: null }, 50).manDaysMissing).toBe(false);
  });
});

describe('computeReport', () => {
  it('노무유형별 합계 + 총합', () => {
    const s = computeReport([
      unitReportItem('rack-install', '랙 1', '19인치 랙', labor),
      unitReportItem('equipment-remove', 'UPS 1', 'UPS', { ...labor, laborCode: '통신내선공', removeManDays: 0.5 }),
      cableReportItem('cable-install', 'A↔B', fiberCable, 50),
      unitReportItem('equipment-install', '접지 1', '접지함체', { laborCode: null, unitPrice: null, installManDays: 0, removeManDays: 0, relocateManDays: 0 }),
    ]);
    expect(s.totalManDays).toBeCloseTo(2 + 0.5 + 2);
    expect(s.byLaborType).toEqual([
      { laborCode: '통신내선공', totalManDays: 2.5 },
      { laborCode: '통신외선공', totalManDays: 2 },
    ]);
    expect(s.items).toHaveLength(4);
  });
});

/**
 * 자재는 **살 때만** 값이 붙는다.
 *
 * 이 규칙이 없던 동안 철거·이설 줄에도 단가가 곱해졌다 — 철거 공사의 재료비가 신설과 똑같이
 * 잡히고, 그 값이 일반관리비·이윤·부가세까지 밀고 올라갔다.
 */
describe('materialCostOf', () => {
  const item = (over: Partial<ReportItem>): ReportItem => ({
    kind: 'equipment-install', name: 'x', typeName: 't', laborCode: null,
    qty: 1, unit: '대', manDays: 0, unitPrice: null, manDaysMissing: false, ...over,
  });

  it('신설은 수량 × 단가', () => {
    expect(materialCostOf(item({ qty: 3, unitPrice: 1_200_000 }))).toBe(3_600_000);
    expect(materialCostOf(item({ kind: 'cable-install', unit: 'm', qty: 120, unitPrice: 3_400 }))).toBe(408_000);
  });

  it('철거·이설은 사는 것이 없다 — 단가가 적혀 있어도 0', () => {
    expect(materialCostOf(item({ kind: 'equipment-remove', unitPrice: 1_200_000 }))).toBe(0);
    expect(materialCostOf(item({ kind: 'equipment-relocate', unitPrice: 1_200_000 }))).toBe(0);
    expect(materialCostOf(item({ kind: 'cable-remove', unit: 'm', qty: 120, unitPrice: 3_400 }))).toBe(0);
  });

  it('소수 m 는 줄마다 원 단위로 반올림한다 — 합계는 반올림한 줄의 합', () => {
    expect(materialCostOf(item({ kind: 'cable-install', unit: 'm', qty: 2.5, unitPrice: 2_101 }))).toBe(5_253);
    const r = computeReport([
      item({ kind: 'cable-install', unit: 'm', qty: 2.5, unitPrice: 2_101 }),
      item({ kind: 'cable-install', unit: 'm', qty: 2.5, unitPrice: 2_101 }),
    ]);
    expect(r.totalMaterialCost).toBe(10_506);
  });

  it('단가를 안 적었으면 0 이다', () => {
    expect(materialCostOf(item({ qty: 5, unitPrice: null }))).toBe(0);
  });

  it('합계는 신설만 센다', () => {
    const r = computeReport([
      item({ qty: 2, unitPrice: 1_000_000 }),
      item({ kind: 'equipment-remove', qty: 1, unitPrice: 9_000_000 }),
    ]);
    expect(r.totalMaterialCost).toBe(2_000_000);
  });
});

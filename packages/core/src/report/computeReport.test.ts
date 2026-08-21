import { describe, expect, it } from 'vitest';
import { assetReportItem, cableReportItem, computeReport, materialCostOf } from './computeReport.js';
import type { ReportItem } from './computeReport.js';

const labor = { laborCode: '통신내선공', installManDays: 2, removeManDays: 1, relocateManDays: 3 };
const fiberGroup = { name: '광', laborCode: '통신외선공', installManDays: 0.04, removeManDays: 0.02 };

describe('assetReportItem', () => {
  it('kind별 공량', () => {
    expect(assetReportItem('asset-install', '랙1', '랙', labor)).toMatchObject({ qty: 1, unit: '대', manDays: 2, laborCode: '통신내선공' });
    expect(assetReportItem('asset-relocate', '랙1', '랙', labor).manDays).toBe(3);
  });
  it('remove 분기', () => {
    expect(assetReportItem('asset-remove', '랙1', '랙', labor).manDays).toBe(1);
  });
});

describe('cableReportItem', () => {
  it('lengthM × perM', () => {
    expect(cableReportItem('cable-install', 'A↔B', fiberGroup, 50)).toMatchObject({ qty: 50, unit: 'm', manDays: 2, laborCode: '통신외선공' });
    expect(cableReportItem('cable-remove', 'A↔B', fiberGroup, 50).manDays).toBe(1);
  });
  it('길이 미입력 → 0 + note', () => {
    expect(cableReportItem('cable-install', 'A↔B', fiberGroup, null)).toMatchObject({ qty: 0, manDays: 0, note: '길이 미입력' });
  });
});

describe('computeReport', () => {
  it('노무유형별 합계 + 총합', () => {
    const s = computeReport([
      assetReportItem('asset-install', '랙1', '랙', labor),
      assetReportItem('asset-remove', 'UPS1', 'UPS', { ...labor, laborCode: '통신내선공', removeManDays: 0.5 }),
      cableReportItem('cable-install', 'A↔B', fiberGroup, 50),
      assetReportItem('asset-install', '접지1', '접지함체', { laborCode: null, installManDays: 0, removeManDays: 0, relocateManDays: 0 }),
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
    kind: 'asset-install', name: 'x', typeName: 't', laborCode: null,
    qty: 1, unit: '대', manDays: 0, unitPrice: null, ...over,
  });

  it('신설은 수량 × 단가', () => {
    expect(materialCostOf(item({ qty: 3, unitPrice: 1_200_000 }))).toBe(3_600_000);
    expect(materialCostOf(item({ kind: 'cable-install', unit: 'm', qty: 120, unitPrice: 3_400 }))).toBe(408_000);
  });

  it('철거·이설은 사는 것이 없다 — 단가가 적혀 있어도 0', () => {
    expect(materialCostOf(item({ kind: 'asset-remove', unitPrice: 1_200_000 }))).toBe(0);
    expect(materialCostOf(item({ kind: 'asset-relocate', unitPrice: 1_200_000 }))).toBe(0);
    expect(materialCostOf(item({ kind: 'cable-remove', unit: 'm', qty: 120, unitPrice: 3_400 }))).toBe(0);
  });

  it('단가를 안 적었으면 0 이다', () => {
    expect(materialCostOf(item({ qty: 5, unitPrice: null }))).toBe(0);
  });

  it('합계는 신설만 센다', () => {
    const r = computeReport([
      item({ qty: 2, unitPrice: 1_000_000 }),
      item({ kind: 'asset-remove', qty: 1, unitPrice: 9_000_000 }),
    ]);
    expect(r.totalMaterialCost).toBe(2_000_000);
  });
});

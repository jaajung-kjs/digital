import { describe, expect, it } from 'vitest';
import { assetReportItem, cableReportItem, computeReport } from './computeReport.js';

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

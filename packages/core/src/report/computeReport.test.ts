import { describe, expect, it } from 'vitest';
import { assetReportItem, cableReportItem, computeReport } from './computeReport.js';

const labor = { laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 3 };
const fiberGroup = { name: '광', laborType: '통신외선공', installHoursPerM: 0.04, removeHoursPerM: 0.02 };

describe('assetReportItem', () => {
  it('kind별 공량', () => {
    expect(assetReportItem('asset-install', '랙1', '랙', labor)).toMatchObject({ qty: 1, unit: '대', hours: 2, laborType: '통신내선공' });
    expect(assetReportItem('asset-relocate', '랙1', '랙', labor).hours).toBe(3);
  });
  it('remove 분기', () => {
    expect(assetReportItem('asset-remove', '랙1', '랙', labor).hours).toBe(1);
  });
});

describe('cableReportItem', () => {
  it('lengthM × perM', () => {
    expect(cableReportItem('cable-install', 'A↔B', fiberGroup, 50)).toMatchObject({ qty: 50, unit: 'm', hours: 2, laborType: '통신외선공' });
    expect(cableReportItem('cable-remove', 'A↔B', fiberGroup, 50).hours).toBe(1);
  });
  it('길이 미입력 → 0 + note', () => {
    expect(cableReportItem('cable-install', 'A↔B', fiberGroup, null)).toMatchObject({ qty: 0, hours: 0, note: '길이 미입력' });
  });
});

describe('computeReport', () => {
  it('노무유형별 합계 + 총합', () => {
    const s = computeReport([
      assetReportItem('asset-install', '랙1', '랙', labor),
      assetReportItem('asset-remove', 'UPS1', 'UPS', { ...labor, laborType: '통신내선공', removeHours: 0.5 }),
      cableReportItem('cable-install', 'A↔B', fiberGroup, 50),
      assetReportItem('asset-install', '접지1', '접지함체', { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 }),
    ]);
    expect(s.totalHours).toBeCloseTo(2 + 0.5 + 2);
    expect(s.byLaborType).toEqual([
      { laborType: '통신내선공', totalHours: 2.5 },
      { laborType: '통신외선공', totalHours: 2 },
    ]);
    expect(s.items).toHaveLength(4);
  });
});

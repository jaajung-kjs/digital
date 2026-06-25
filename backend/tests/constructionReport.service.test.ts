/**
 * Task 4 — constructionReport service unit tests.
 * DB 규칙 기반 노무/자재 계산, 부속자재 없음.
 */
import { describe, it, expect } from 'vitest';
import { calculateConstructionReport, type RuleContext } from '../src/services/constructionReport.service.js';

const ruleCtx: RuleContext = {
  cableRuleByCategoryId: new Map([
    [
      'catFiber',
      {
        groupName: '광',
        laborType: '통신외선공',
        installHoursPerMeter: 0.04,
        removeHoursPerMeter: 0.02,
        relocateHoursPerMeter: null,
      },
    ],
  ]),
  equipRuleByTypeId: new Map([
    [
      'typeRack',
      {
        name: '랙',
        laborType: '통신내선공',
        installHoursPerUnit: 2.0,
        removeHoursPerUnit: 1.0,
        relocateHoursPerUnit: 3.0,
      },
    ],
  ]),
};

const before = { equipment: [], cables: [] };
const after = {
  equipment: [{ id: 'e1', name: '랙1', assetTypeId: 'typeRack' }],
  cables: [
    {
      id: 'c1',
      categoryId: 'catFiber',
      name: 'OPGW',
      totalLength: 10000 /* cm = 100m */,
      sourceAssetId: 'a',
      targetAssetId: 'b',
    },
  ],
};

describe('calculateConstructionReport — DB 규칙 기반', () => {
  it('케이블 install → 노무 0.04/m * 100m = 4.0h (통신외선공)', () => {
    const r = calculateConstructionReport(before, after, ruleCtx);
    expect(r.labor.find((l) => l.laborType === '통신외선공')?.hours).toBeCloseTo(4.0);
  });

  it('설비 install → 노무 2.0h (랙 포함)', () => {
    const r = calculateConstructionReport(before, after, ruleCtx);
    expect(r.labor.find((l) => l.workName.includes('랙'))?.hours).toBeCloseTo(2.0);
  });

  it('부속자재 없음 — BOM 항목에 isAccessory 필드 자체가 없거나 false', () => {
    const r = calculateConstructionReport(before, after, ruleCtx);
    expect(r.bom.every((b) => !('isAccessory' in b) || (b as any).isAccessory === false)).toBe(true);
  });

  it('BOM에 케이블 자재(OPGW, m) 포함', () => {
    const r = calculateConstructionReport(before, after, ruleCtx);
    expect(r.bom.some((b) => b.name === 'OPGW' && b.unit === 'm')).toBe(true);
  });

  it('totalLength 는 cm 단위 → BOM 수량은 m 단위(100)', () => {
    const r = calculateConstructionReport(before, after, ruleCtx);
    const opgw = r.bom.find((b) => b.name === 'OPGW');
    expect(opgw?.quantity).toBeCloseTo(100);
  });
});

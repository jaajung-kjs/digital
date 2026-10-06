import { MASTER_CABLE_TYPES, MASTER_EQUIPMENT_TYPES, MASTER_RACK_TYPES } from '@twin/core';
import { describe, expect, it } from 'vitest';
import { buildJikhalPayload } from './jikhal.js';
import { OPGW, STATIONS, seatedPlates } from './jikhalGangwon.js';

let n = 0;
const input = () => ({
  substationIds: Object.fromEntries(STATIONS.map((s) => [s.key, `sub-${s.key}`])) as Record<(typeof STATIONS)[number]['key'], string>,
  rackTypeIds: Object.fromEntries(MASTER_RACK_TYPES.map((t) => [t.key, `rt-${t.key}`])),
  equipmentTypeIds: Object.fromEntries(MASTER_EQUIPMENT_TYPES.map((t) => [t.key, `et-${t.key}`])),
  cableTypeIds: Object.fromEntries(MASTER_CABLE_TYPES.map((t) => [t.key, `ct-${t.key}`])),
  newId: () => `id-${++n}`,
});

describe('buildJikhalPayload — 광선로', () => {
  it('OPGW 쌍마다 광선로 하나, 두 끝은 각 국의 OFD 와 판 자리', () => {
    const p = buildJikhalPayload(input());
    expect(p.fiberLines!.creates).toHaveLength(OPGW.length);
    const ofdIds = new Set(p.equipment!.creates!.filter((e) => e.name === 'OFD').map((e) => e.id));
    for (const l of p.fiberLines!.creates!) {
      expect(ofdIds.has(l.a.equipmentId!)).toBe(true);
      expect(ofdIds.has(l.b.equipmentId!)).toBe(true);
      expect(l.cableTypeId).toBe('ct-OPGW');
    }
  });

  it('판 번호는 OFD 안의 자리 차례다(선번장 판 번호가 아니라 세운 판의 차례)', () => {
    const p = buildJikhalPayload(input());
    const seg = OPGW.find((s) => s.a === 'bukchuncheon' && s.aSlot === 2)!;
    const line = p.fiberLines!.creates!.find((l) => l.a.substationId === 'sub-bukchuncheon' && l.b.substationId === `sub-${seg.b}`
      && l.a.panel === seatedPlates('bukchuncheon').findIndex((x) => x.slot === 2) + 1);
    expect(line).toBeTruthy();
  });

  it('코어 수는 판의 성단 심수다', () => {
    const p = buildJikhalPayload(input());
    for (const l of p.fiberLines!.creates!) expect([4, 8, 12, 24, 48]).toContain(l.coreCount);
  });

  it('잰 값이 있는 코어마다 그 끝·날짜로 측정이 하나씩', () => {
    const p = buildJikhalPayload(input());
    const ms = p.coreMeasurements!.creates!;
    expect(ms.length).toBeGreaterThan(100);
    for (const x of ms) {
      expect(['A', 'B']).toContain(x.side);
      expect([x.loss1310, x.dist1310, x.loss1550, x.dist1550].some((v) => v != null)).toBe(true);
    }
  });

  it('국마다 3층과 OFD 랙·OFD 설비가 하나씩', () => {
    const p = buildJikhalPayload(input());
    expect(p.floors!.creates).toHaveLength(STATIONS.length);
    expect(p.racks!.creates!.filter((r) => r.rackTypeId === 'rt-RACK-OFD')).toHaveLength(STATIONS.length);
  });
});

import { describe, expect, it } from 'vitest';
import { isLineMedium, isLinkMedium } from '../model/vocab.js';
import { MASTER_CABLE_TYPES, MASTER_CATEGORIES, MASTER_EQUIPMENT_TYPES, MASTER_RACK_TYPES, SEED_PICKS } from './master.js';

const uniq = (xs: string[]) => new Set(xs).size === xs.length;

describe('마스터 시드', () => {
  it('키는 목록마다 유일하다', () => {
    expect(uniq(MASTER_CATEGORIES.map((c) => c.key))).toBe(true);
    expect(uniq(MASTER_RACK_TYPES.map((t) => t.key))).toBe(true);
    expect(uniq(MASTER_EQUIPMENT_TYPES.map((t) => t.key))).toBe(true);
    expect(uniq(MASTER_CABLE_TYPES.map((t) => t.key))).toBe(true);
  });

  it('설비 종류의 분야는 분야 목록에 있다', () => {
    const cats = new Set(MASTER_CATEGORIES.map((c) => c.key));
    for (const t of MASTER_EQUIPMENT_TYPES) expect(cats.has(t.categoryKey), t.key).toBe(true);
  });

  it('케이블 종류는 매체 넷 중 하나다', () => {
    for (const t of MASTER_CABLE_TYPES) expect(isLinkMedium(t.medium) || isLineMedium(t.medium), t.key).toBe(true);
  });

  it('광 점퍼코드는 국 내 연결(통신)이고 OPGW 는 광선로다', () => {
    expect(isLinkMedium(MASTER_CABLE_TYPES.find((t) => t.key === 'FIBER-JUMPER')!.medium)).toBe(true);
    expect(isLineMedium(MASTER_CABLE_TYPES.find((t) => t.key === SEED_PICKS.opgwCableType)!.medium)).toBe(true);
  });

  it('시드가 고르는 종류는 목록에 있다', () => {
    expect(MASTER_RACK_TYPES.some((t) => t.key === SEED_PICKS.ofdRackType)).toBe(true);
    expect(MASTER_EQUIPMENT_TYPES.some((t) => t.key === SEED_PICKS.ofdEquipmentType)).toBe(true);
  });

  it('포트·부품 시절의 내부 부품 종류는 없다 — 세는 것은 장비 단위다', () => {
    const names = MASTER_EQUIPMENT_TYPES.map((t) => t.name);
    for (const part of ['UPS 정류기', 'UPS 인버터', 'IRCU(감시제어부)', 'OFD 슬롯', 'AC 전원']) {
      expect(names).not.toContain(part);
    }
  });
});

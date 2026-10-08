import { describe, expect, it } from 'vitest';
import { designItems, type DesignInput, type DEquipment, type DLine, type DLink, type DRack, type LaborType } from './designItems.js';
import { materialCostOf } from './computeReport.js';

const rackType: LaborType = { id: 'rt', name: '19인치 랙', laborCode: '통신내선공', unitPrice: 1_000_000, installManDays: 2, removeManDays: 1, relocateManDays: 3 };
const eqType: LaborType = { id: 'et', name: 'L3 스위치', laborCode: '통신설비공', unitPrice: 5_000_000, installManDays: 0.5, removeManDays: 0.25, relocateManDays: 0.4 };
const utp: LaborType = { id: 'utp', name: 'UTP', laborCode: '통신내선공', unitPrice: 100, installManDays: 0.01, removeManDays: 0.005, relocateManDays: null };
const smf: LaborType = { id: 'smf', name: '광케이블 24C', laborCode: '통신외선공', unitPrice: 3_000, installManDays: 0.002, removeManDays: 0.001, relocateManDays: null };

const names: Record<string, string> = { S1: '춘천', S2: '화천', S10: '가평' };

const rack = (id: string, o: Partial<DRack> = {}): DRack => ({ id, name: id, substationId: 'S1', rackTypeId: 'rt', floorId: 'F1', x: 0, y: 0, ...o });
const eq = (id: string, o: Partial<DEquipment> = {}): DEquipment => ({ id, name: id, substationId: 'S1', rackId: 'r1', typeId: 'et', ...o });
const link = (id: string, o: Partial<DLink> = {}): DLink => ({ id, substationId: 'S1', cableTypeId: 'utp', lengthM: 10, label: `${id}A ↔ ${id}B`, ...o });
const line = (id: string, o: Partial<DLine> = {}): DLine => ({ id, name: null, cableTypeId: 'smf', lengthKm: 1, aSubstationId: 'S1', bSubstationId: 'S2', ...o });

type Side = DesignInput['before'];
const empty = (): Side => ({ racks: [], equipment: [], links: [], fiberLines: [] });
function run(before: Partial<Side>, after: Partial<Side>) {
  return designItems({
    before: { ...empty(), ...before },
    after: { ...empty(), ...after },
    rackTypes: [rackType],
    equipmentTypes: [eqType],
    cableTypes: [utp, smf],
    substationName: (id) => names[id] ?? id,
  });
}

describe('designItems — 랙', () => {
  it('신설·철거', () => {
    const items = run({ racks: [rack('old')] }, { racks: [rack('new')] });
    expect(items.map((i) => [i.kind, i.name])).toEqual([['rack-install', 'new'], ['rack-remove', 'old']]);
    expect(items[0]).toMatchObject({ typeName: '19인치 랙', laborCode: '통신내선공', qty: 1, unit: '대', manDays: 2, substationIds: ['S1'] });
    expect(items[1]!.manDays).toBe(1);
  });

  it('좌표만 바뀌어도 이설 1건', () => {
    const items = run({ racks: [rack('r1')] }, { racks: [rack('r1', { x: 5 })] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'rack-relocate', manDays: 3, substationIds: ['S1'] });
  });

  it('층이나 국이 바뀌어도 이설 — 국이 바뀌면 두 국에 걸린다', () => {
    expect(run({ racks: [rack('r1')] }, { racks: [rack('r1', { floorId: 'F2' })] }).map((i) => i.kind)).toEqual(['rack-relocate']);
    const moved = run({ racks: [rack('r1')] }, { racks: [rack('r1', { substationId: 'S2' })] });
    expect(moved[0]).toMatchObject({ kind: 'rack-relocate', substationIds: ['S1', 'S2'], primarySubstationId: 'S1' });
  });

  it('이름만 바뀐 랙은 산출하지 않는다', () => {
    expect(run({ racks: [rack('r1')] }, { racks: [rack('r1', { name: '새 이름' })] })).toEqual([]);
  });

  it('랙째 옮기면 랙 이설 1건 — 안의 설비는 이설로 세지 않는다', () => {
    const items = run(
      { racks: [rack('r1')], equipment: [eq('e1'), eq('e2')] },
      { racks: [rack('r1', { x: 10, y: 20 })], equipment: [eq('e1'), eq('e2')] },
    );
    expect(items.map((i) => i.kind)).toEqual(['rack-relocate']);
  });

  it('rack-install 은 재료비를 산다', () => {
    const [item] = run({}, { racks: [rack('r1')] });
    expect(item!.unitPrice).toBe(1_000_000);
    expect(materialCostOf(item!)).toBe(1_000_000);
  });
});

describe('designItems — 설비', () => {
  it('다른 랙으로 옮기면 설비 이설 1건', () => {
    const items = run(
      { racks: [rack('r1'), rack('r2')], equipment: [eq('e1')] },
      { racks: [rack('r1'), rack('r2')], equipment: [eq('e1', { rackId: 'r2' })] },
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'equipment-relocate', name: 'e1', typeName: 'L3 스위치', manDays: 0.4, unit: '대' });
  });

  it('설비 삭제 + 펼친 연결 삭제 = 설비 철거 1 + 케이블 철거 n', () => {
    const items = run(
      { equipment: [eq('e1'), eq('e2')], links: [link('k1'), link('k2'), link('k3')] },
      { equipment: [eq('e2')], links: [link('k3')] },
    );
    expect(items.map((i) => [i.kind, i.name])).toEqual([
      ['equipment-remove', 'e1'],
      ['cable-remove', 'k1A ↔ k1B'],
      ['cable-remove', 'k2A ↔ k2B'],
    ]);
    expect(items[1]).toMatchObject({ qty: 10, unit: 'm', manDays: 0.05, typeName: 'UTP' });
    expect(materialCostOf(items[1]!)).toBe(0);
  });

  it('품목을 못 찾으면 「품목 미지정」 줄로 남는다(공량 0)', () => {
    const [item] = run({}, { equipment: [eq('e1', { typeId: 'nope' })] });
    expect(item).toMatchObject({ kind: 'equipment-install', name: 'e1', qty: 1, manDays: 0, laborCode: null, unitPrice: null, note: '품목 미지정' });
  });
});

describe('designItems — 연결·광선로', () => {
  it('두 국 광선로 신설 = 광케이블 m(긍장 km×1000) + 양 끝 점퍼 2', () => {
    const items = run({}, {
      fiberLines: [line('L1', { lengthKm: 12.5 })],
      links: [
        link('j1', { substationId: 'S1', cableTypeId: 'smf', lengthM: 3, label: 'FDF ↔ 송광치' }),
        link('j2', { substationId: 'S2', cableTypeId: 'smf', lengthM: 5, label: 'FDF ↔ 수광치' }),
      ],
    });
    expect(items.map((i) => [i.kind, i.name, i.qty, i.substationIds])).toEqual([
      ['cable-install', 'FDF ↔ 송광치', 3, ['S1']],
      ['cable-install', 'FDF ↔ 수광치', 5, ['S2']],
      ['cable-install', '춘천–화천', 12500, ['S1', 'S2']],
    ]);
    expect(items[2]).toMatchObject({ typeName: '광케이블 24C', manDays: 25, unit: 'm', primarySubstationId: 'S1' });
    expect(items[0]!.primarySubstationId).toBe('S1');
    expect(items[1]!.primarySubstationId).toBe('S2');
    expect(items.map((i) => i.target)).toEqual(['link', 'link', 'line']);
    expect(materialCostOf(items[2]!)).toBe(12500 * 3_000);
  });

  it('선로명이 있으면 그 이름', () => {
    expect(run({}, { fiberLines: [line('L1', { name: '춘화선' })] })[0]!.name).toBe('춘화선');
  });

  it('긍장 null → 「길이 미입력」 줄(수량 0)', () => {
    const [item] = run({}, { fiberLines: [line('L1', { lengthKm: null })] });
    expect(item).toMatchObject({ kind: 'cable-install', qty: 0, manDays: 0, note: '길이 미입력' });
    expect(materialCostOf(item!)).toBe(0);
  });

  it('케이블 품목 없음 → 「품목 미지정」 줄 — 길이는 수량으로 남고 공량 0·단가 없음', () => {
    const [item] = run({ links: [link('k1', { cableTypeId: null })] }, {});
    expect(item).toMatchObject({ kind: 'cable-remove', name: 'k1A ↔ k1B', typeName: '—', qty: 10, unit: 'm', manDays: 0, laborCode: null, unitPrice: null, note: '품목 미지정' });
    const [noLen] = run({}, { links: [link('k2', { cableTypeId: null, lengthM: null })] });
    expect(noLen).toMatchObject({ qty: 0, manDays: 0, note: '품목 미지정' });
    const [line9] = run({}, { fiberLines: [line('L9', { cableTypeId: 'nope', lengthKm: 1.5 })] });
    expect(line9).toMatchObject({ qty: 1500, manDays: 0, unitPrice: null, note: '품목 미지정' });
    expect(materialCostOf(line9!)).toBe(0);
  });

  it('광선로 철거', () => {
    const items = run({ fiberLines: [line('L1', { lengthKm: 2 })] }, {});
    expect(items[0]).toMatchObject({ kind: 'cable-remove', qty: 2000, manDays: 2 });
  });
});

describe('designItems — 최종 차이', () => {
  it('만들었다 지운 것은 0 줄', () => {
    expect(run({}, {})).toEqual([]);
  });

  it('길이·품목만 바뀐 연결, 긍장만 바뀐 광선로는 0 줄', () => {
    expect(run(
      { links: [link('k1')], fiberLines: [line('L1')] },
      { links: [link('k1', { lengthM: 99, cableTypeId: 'smf' })], fiberLines: [line('L1', { lengthKm: 7 })] },
    )).toEqual([]);
  });
});

describe('designItems — 정렬', () => {
  const before: Side = {
    racks: [rack('rx', { name: '랙 9' }), rack('rm', { name: '랙 1', x: 1 })],
    equipment: [eq('ex', { name: '설비 2' }), eq('em', { name: '설비 1' })],
    links: [link('kx', { label: 'X' })],
    fiberLines: [line('Lx', { name: '구선' })],
  };
  const after: Side = {
    racks: [rack('rm', { name: '랙 1', x: 2 }), rack('rb', { name: '랙 10', substationId: 'S10' }), rack('ra', { name: '랙 2' }), rack('rc', { name: '랙 2' })],
    equipment: [eq('em', { name: '설비 1', rackId: 'rb' }), eq('en', { name: '설비 10' }), eq('eo', { name: '설비 9' })],
    links: [link('kn', { label: 'B' }), link('ko', { label: 'A', substationId: 'S2' })],
    fiberLines: [line('Ln', { name: '신선' })],
  };

  it('구분 → 신설·철거·이설 → 국 이름 → 이름(자연 순서) → id', () => {
    expect(run(before, after).map((i) => `${i.kind}:${i.name}`)).toEqual([
      'rack-install:랙 10', // 가평
      'rack-install:랙 2', // 춘천 ra
      'rack-install:랙 2', // 춘천 rc
      'rack-remove:랙 9',
      'rack-relocate:랙 1',
      'equipment-install:설비 9',
      'equipment-install:설비 10',
      'equipment-remove:설비 2',
      'equipment-relocate:설비 1',
      'cable-install:B',
      'cable-install:A', // 화천
      'cable-remove:X',
      'cable-install:신선',
      'cable-remove:구선',
    ]);
  });

  it('입력 차례를 섞어도 같은 결과', () => {
    const base = run(before, after);
    const shuffle = <T,>(xs: T[], seed: number): T[] => {
      const out = [...xs];
      let s = seed;
      for (let i = out.length - 1; i > 0; i--) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const j = s % (i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    };
    const mix = (x: Side, seed: number): Side => ({
      racks: shuffle(x.racks, seed), equipment: shuffle(x.equipment, seed + 1),
      links: shuffle(x.links, seed + 2), fiberLines: shuffle(x.fiberLines, seed + 3),
    });
    for (let seed = 1; seed <= 20; seed++) {
      expect(run(mix(before, seed), mix(after, seed * 7))).toEqual(base);
    }
  });
});

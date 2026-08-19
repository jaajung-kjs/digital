import { describe, expect, it } from 'vitest';
import { emptyOverlay } from '../store/overlay';
import { buildReportItems, estimateInput } from '../reportSelectors';
import type { ReportItem } from '@twin/core';

const labor = { laborCode: '통신내선공', installManDays: 2, removeManDays: 1, relocateManDays: 3 };
const rackType = { id: 't-rack', key: 'SW', name: 'L3 스위치', categoryId: 'c', sortOrder: 1, ...labor, portTemplates: [] };
const fiberCat = 'cat-f';
/* 품셈은 **종류**가 갖는다 — 같은 광이라도 OPGW 가공과 실내 점퍼 결선은 품이 다르다.
   그룹은 이름·색뿐이고, 산출 내역의 「종류」 열도 그룹이 아니라 종류 이름을 적는다. */
const groups = [{
  id: 'g-f', key: 'fiber', name: '광', color: '#0f0', sortOrder: 1,
  categories: [{ id: fiberCat, name: '광케이블', sortOrder: 1, laborCode: '통신외선공', installManDays: 0.04, removeManDays: 0.02 }],
}];

const mkAsset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't-rack', substationId: 's', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, assemblyId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const mkCable = (id: string, extra: object = {}) => ({
  id, name: null, substationId: 's', aPortId: 'pa', bPortId: 'pb', categoryId: fiberCat,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});
const overlays = (o: object) => ({
  assets: emptyOverlay(), cables: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), ...o,
});

describe('buildReportItems', () => {
  it('신설/철거/이설 + 케이블 공량', () => {
    const savedAsset = mkAsset('a1', '기존 스위치');
    const savedCable = mkCable('c1', { specParams: { lengthM: 50 } });
    const items = buildReportItems({
      saved: { assets: [savedAsset] as never, cables: [savedCable] as never },
      overlays: overlays({
        assets: { creates: { n1: mkAsset('n1', '신규 스위치') }, updates: { a1: { floorId: 'f2', x: 1, y: 2 } }, deletes: [] },
        cables: { creates: {}, updates: {}, deletes: ['c1'] },
      }) as never,
      types: [rackType] as never,
      assemblies: [] as never,
      cableGroups: groups as never,
    });
    const kinds = items.map((i) => i.kind).sort();
    expect(kinds).toEqual(['asset-install', 'asset-relocate', 'cable-remove']);
    expect(items.find((i) => i.kind === 'asset-install')).toMatchObject({ name: '신규 스위치', manDays: 2 });
    expect(items.find((i) => i.kind === 'asset-relocate')).toMatchObject({ name: '기존 스위치', manDays: 3 });
    expect(items.find((i) => i.kind === 'cable-remove')).toMatchObject({ qty: 50, manDays: 1, typeName: '광케이블' });
  });

  it('이름만 변경 update는 미포함, 종류 미지정 케이블은 note', () => {
    const items = buildReportItems({
      saved: { assets: [mkAsset('a1', '랙')] as never, cables: [] as never },
      overlays: overlays({
        assets: { creates: {}, updates: { a1: { name: '개명' } }, deletes: [] },
        cables: { creates: { nc: mkCable('nc', { categoryId: null }) }, updates: {}, deletes: [] },
      }) as never,
      types: [rackType] as never,
      assemblies: [] as never,
      cableGroups: groups as never,
    });
    expect(items.some((i) => i.kind === 'asset-relocate')).toBe(false);
    expect(items.find((i) => i.kind === 'cable-install')).toMatchObject({ manDays: 0, note: '품목 미지정' });
  });

  it('철거: saved에서 타입·labor 해소', () => {
    const items = buildReportItems({
      saved: { assets: [mkAsset('a1', '철거랙')] as never, cables: [] as never },
      overlays: overlays({ assets: { creates: {}, updates: {}, deletes: ['a1'] } }) as never,
      types: [rackType] as never,
      assemblies: [] as never,
      cableGroups: groups as never,
    });
    expect(items[0]).toMatchObject({ kind: 'asset-remove', name: '철거랙', manDays: 1 });
  });
});

/**
 * 「1식」 공량 — 작업의 **단위**가 무엇인가.
 *
 * 설비를 통째로 놓거나 걷으면 단위는 그 설비 하나다(「송광치 1식 설치」). 이미 놓인 1식에서
 * L3 스위치 하나만 걷어내면 단위는 그 장비다. 어느 쪽인지는 **변경 집합이 그대로 말한다** —
 * 뿌리 설비가 같이 왔는가. 따로 표시할 것도, 사용자에게 물을 것도 없다.
 */
describe('1식 공량', () => {
  const optSet = {
    id: 'asm-1', key: 'OPT-SET', name: '송변전광단말장치', categoryId: 'c',
    sortOrder: 1, items: [],
    laborCode: '통신내선공', installManDays: 40, removeManDays: 20, relocateManDays: 30,
  };
  /** 1식 공량을 안 적어 둔 설비 품목 — 안에 든 자산의 공량을 합쳐 센다. */
  const bare = { ...optSet, id: 'asm-2', key: 'BARE', name: '무명설비', laborCode: null, installManDays: null, removeManDays: null, relocateManDays: null };

  const 설비 = (id: string, name: string, asmId: string) =>
    mkAsset(id, name, { typeId: null, assemblyId: asmId, floorId: 'f1' });
  const 장비 = (id: string, name: string, parent: string) =>
    mkAsset(id, name, { parentAssetId: parent, col: 0, row: 0 });

  const build = (o: object, saved: object[] = []) =>
    buildReportItems({
      saved: { assets: saved as never, cables: [] as never },
      overlays: overlays(o) as never,
      types: [rackType] as never,
      assemblies: [optSet, bare] as never,
      cableGroups: groups as never,
    });

  it('1식으로 놓으면 1식 공량 한 건 — 안의 장비는 따로 세지 않는다', () => {
    const items = build({
      assets: {
        creates: { e1: 설비('e1', '송광치 A', 'asm-1'), p1: 장비('p1', 'L3 스위치', 'e1'), p2: 장비('p2', '광단말', 'e1') },
        updates: {}, deletes: [],
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'asset-install', name: '송광치 A', typeName: '송변전광단말장치 1식', manDays: 40 });
  });

  it('완성된 1식에서 L3 스위치만 철거하면 그 장비 공량만', () => {
    const saved = [설비('e1', '송광치 A', 'asm-1'), 장비('p1', 'L3 스위치', 'e1')];
    const items = build({ assets: { creates: {}, updates: {}, deletes: ['p1'] } }, saved);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'asset-remove', name: 'L3 스위치', typeName: 'L3 스위치', manDays: 1 });
  });

  it('1식을 통째로 걷으면 1식 철거 공량 — 함께 지워지는 장비는 세지 않는다', () => {
    const saved = [설비('e1', '송광치 A', 'asm-1'), 장비('p1', 'L3 스위치', 'e1')];
    const items = build({ assets: { creates: {}, updates: {}, deletes: ['e1', 'p1'] } }, saved);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'asset-remove', typeName: '송변전광단말장치 1식', manDays: 20 });
  });

  it('1식을 옮기면 1식 이설 공량', () => {
    const saved = [설비('e1', '송광치 A', 'asm-1')];
    const items = build({ assets: { creates: {}, updates: { e1: { x: 10, y: 20 } }, deletes: [] } }, saved);
    expect(items[0]).toMatchObject({ kind: 'asset-relocate', typeName: '송변전광단말장치 1식', manDays: 30 });
  });

  /* null 은 「안 적었다」 — 그때만 장비 합으로 물러선다. 0 은 「품이 안 든다」라 다르다. */
  it('1식 공량을 안 적어 두면 장비들이 각자 낸다', () => {
    const items = build({
      assets: {
        creates: { e1: 설비('e1', '무명 A', 'asm-2'), p1: 장비('p1', 'L3 스위치', 'e1') },
        updates: {}, deletes: [],
      },
    });
    expect(items.map((i) => [i.name, i.manDays])).toEqual([['L3 스위치', 2]]);
  });

  /* 작업 종류마다 따로 본다 — 1식 설치 공량은 표준이 있어도 철거는 장비별로 잡는 일이 흔하다. */
  it('신설만 1식으로 적어 두면 철거는 장비 합으로 센다', () => {
    const half = { ...optSet, id: 'asm-3', name: '반쪽', removeManDays: null };
    const saved = [mkAsset('e1', '반쪽 A', { typeId: null, assemblyId: 'asm-3', floorId: 'f1' }), 장비('p1', 'L3 스위치', 'e1')];
    const items = buildReportItems({
      saved: { assets: saved as never, cables: [] as never },
      overlays: overlays({ assets: { creates: {}, updates: {}, deletes: ['e1', 'p1'] } }) as never,
      types: [rackType] as never,
      assemblies: [half] as never,
      cableGroups: groups as never,
    });
    expect(items.map((i) => [i.name, i.manDays])).toEqual([['L3 스위치', 1]]);
  });
});

/**
 * 1식 공량이 없을 때 「장비 합」으로 물러서는 길.
 *
 * 놓고 걷을 때는 자손도 함께 변경 집합에 오지만 **옮길 때는 뿌리만 온다** — 그래서 변경
 * 집합만 보면 이설이 산출 내역에서 통째로 사라졌다(실제로 그랬다). 자손은 **그 설비**에서 찾는다.
 */
describe('1식 공량이 없을 때의 폴백', () => {
  const bare = {
    id: 'asm-b', key: 'BARE', name: '무명설비', categoryId: 'c',
    sortOrder: 1, items: [],
    laborCode: null, installManDays: null, removeManDays: null, relocateManDays: null,
  };
  const 설비 = mkAsset('e1', '무명 A', { typeId: null, assemblyId: 'asm-b', floorId: 'f1' });
  const 장비A = mkAsset('p1', 'L3 스위치 1', { parentAssetId: 'e1', col: 0, row: 0 });
  const 장비B = mkAsset('p2', 'L3 스위치 2', { parentAssetId: 'e1', col: 0, row: 1 });

  const build = (o: object, saved: object[]) =>
    buildReportItems({
      saved: { assets: saved as never, cables: [] as never },
      overlays: overlays(o) as never,
      types: [rackType] as never,
      assemblies: [bare] as never,
      cableGroups: groups as never,
    });

  it('옮기면 안의 장비들이 각자 이설 공량을 낸다 — 뿌리만 왔어도', () => {
    const items = build(
      { assets: { creates: {}, updates: { e1: { x: 10, y: 20 } }, deletes: [] } },
      [설비, 장비A, 장비B],
    );
    expect(items.map((i) => [i.name, i.manDays])).toEqual([['L3 스위치 1', 3], ['L3 스위치 2', 3]]);
  });

  /* 놓고 걷을 때는 자손도 함께 오므로, 두 번 세지 않는지가 관건이다. */
  it('걷으면 자손을 한 번만 센다', () => {
    const items = build(
      { assets: { creates: {}, updates: {}, deletes: ['e1', 'p1', 'p2'] } },
      [설비, 장비A, 장비B],
    );
    expect(items.map((i) => [i.name, i.manDays])).toEqual([['L3 스위치 1', 1], ['L3 스위치 2', 1]]);
  });

  it('놓으면 자손을 한 번만 센다', () => {
    const items = build(
      { assets: { creates: { e1: 설비, p1: 장비A, p2: 장비B }, updates: {}, deletes: [] } },
      [],
    );
    expect(items.map((i) => [i.name, i.manDays])).toEqual([['L3 스위치 1', 2], ['L3 스위치 2', 2]]);
  });
});

/**
 * 물량 → 직접공사비 — **카탈로그와 기준정보가 만나는 자리**.
 *
 * 단가나 노임이 아직 없는 줄은 0 으로 센다. 금액이 조용히 부풀면 산출 내역를 믿을 수 없다.
 */
describe('estimateInput', () => {
  const wage: Record<string, number> = { '1086': 284880, '1088': 408942 };
  const wageOf = (code: string | null) => (code == null ? null : (wage[code] ?? null));

  const item = (over: Partial<ReportItem>): ReportItem => ({
    kind: 'asset-install',
    name: 'x',
    typeName: 't',
    laborCode: null,
    qty: 1,
    unit: '대',
    manDays: 0,
    unitPrice: null,
    ...over,
  });

  it('수량 × 자재단가, 품 × 노임단가를 각각 더한다', () => {
    const out = estimateInput(
      [
        item({ qty: 2, unitPrice: 1_700_000, manDays: 1.0, laborCode: '1086' }),
        item({ kind: 'cable-install', unit: 'm', qty: 100, unitPrice: 3200, manDays: 6, laborCode: '1088' }),
      ],
      wageOf,
    );
    expect(out.materialCost).toBe(2 * 1_700_000 + 100 * 3200);
    expect(out.directLaborCost).toBeCloseTo(1.0 * 284880 + 6 * 408942, 4);
  });

  it('단가·노임이 없는 줄은 0 으로 센다', () => {
    const out = estimateInput(
      [
        item({ qty: 5, unitPrice: null, manDays: 3, laborCode: null }), // 둘 다 없음
        item({ qty: 1, unitPrice: null, manDays: 2, laborCode: '9999' }), // 판에 없는 직종
      ],
      wageOf,
    );
    expect(out).toEqual({ materialCost: 0, directLaborCost: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import { emptyOverlay } from '../store/overlay';
import { buildReportItems } from '../reportSelectors';

const labor = { laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 3 };
const rackType = { id: 't-rack', key: 'RACK', name: '랙', categoryId: 'c', sortOrder: 1, isActive: true, placeable: true, defaultWidth: null, defaultHeight: null, ...labor, fieldDefs: [], containerSpecs: [], portTemplates: [], linkRules: [] };
const fiberCat = 'cat-f';
const groups = [{ id: 'g-f', key: 'fiber', name: '광', color: '#0f0', laborType: '통신외선공', installHoursPerM: 0.04, removeHoursPerM: 0.02, sortOrder: 1, categories: [{ id: fiberCat, name: '광케이블', sortOrder: 1 }] }];

const mkAsset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't-rack', substationId: 's', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, col: null, row: null, colSpan: null, rowSpan: null,
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
    const savedAsset = mkAsset('a1', '기존랙');
    const savedCable = mkCable('c1', { specParams: { lengthM: 50 } });
    const items = buildReportItems({
      saved: { assets: [savedAsset] as never, cables: [savedCable] as never },
      overlays: overlays({
        assets: { creates: { n1: mkAsset('n1', '신규랙') }, updates: { a1: { floorId: 'f2', x: 1, y: 2 } }, deletes: [] },
        cables: { creates: {}, updates: {}, deletes: ['c1'] },
      }) as never,
      types: [rackType] as never,
      cableGroups: groups as never,
    });
    const kinds = items.map((i) => i.kind).sort();
    expect(kinds).toEqual(['asset-install', 'asset-relocate', 'cable-remove']);
    expect(items.find((i) => i.kind === 'asset-install')).toMatchObject({ name: '신규랙', hours: 2 });
    expect(items.find((i) => i.kind === 'asset-relocate')).toMatchObject({ name: '기존랙', hours: 3 });
    expect(items.find((i) => i.kind === 'cable-remove')).toMatchObject({ qty: 50, hours: 1, typeName: '광' });
  });

  it('이름만 변경 update는 미포함, 종류 미지정 케이블은 note', () => {
    const items = buildReportItems({
      saved: { assets: [mkAsset('a1', '랙')] as never, cables: [] as never },
      overlays: overlays({
        assets: { creates: {}, updates: { a1: { name: '개명' } }, deletes: [] },
        cables: { creates: { nc: mkCable('nc', { categoryId: null }) }, updates: {}, deletes: [] },
      }) as never,
      types: [rackType] as never,
      cableGroups: groups as never,
    });
    expect(items.some((i) => i.kind === 'asset-relocate')).toBe(false);
    expect(items.find((i) => i.kind === 'cable-install')).toMatchObject({ hours: 0, note: '종류 미지정' });
  });

  it('철거: saved에서 타입·labor 해소', () => {
    const items = buildReportItems({
      saved: { assets: [mkAsset('a1', '철거랙')] as never, cables: [] as never },
      overlays: overlays({ assets: { creates: {}, updates: {}, deletes: ['a1'] } }) as never,
      types: [rackType] as never,
      cableGroups: groups as never,
    });
    expect(items[0]).toMatchObject({ kind: 'asset-remove', name: '철거랙', hours: 1 });
  });
});

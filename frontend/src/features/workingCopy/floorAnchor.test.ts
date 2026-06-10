import { describe, it, expect } from 'vitest';
import { isFloorPlaced, floorAnchor, anchorPosition, assetsByIdMap, floorTargetFor, cableOnFloor } from './floorAnchor';
import type { Asset } from '../../types/asset';

function asset(p: Partial<Asset> & { id: string }): Asset {
  return {
    id: p.id,
    substationId: 's1',
    assetTypeId: 'at1',
    assetType: { id: 'at1', code: 'X', name: 'X', group: null, displayColor: null, fieldTemplate: null },
    name: p.id,
    parentAssetId: p.parentAssetId ?? null,
    floorId: p.floorId ?? null,
    roomText: null,
    attributes: null,
    installDate: null,
    warrantyUntil: null,
    replaceDue: null,
    manager: null,
    description: null,
    status: null,
    sortOrder: 0,
    updatedAt: '',
    positionX: p.positionX ?? null,
    positionY: p.positionY ?? null,
    width2d: p.width2d ?? null,
    height2d: p.height2d ?? null,
    slotIndex: p.slotIndex ?? null,
    slotSpan: p.slotSpan ?? null,
  } as Asset;
}

// rack(placed) → module(child, no coords); dist(placed) → circuit(child); orphan; cycle.
const rack = asset({ id: 'rack', floorId: 'f1', positionX: 100, positionY: 200, width2d: 40, height2d: 60 });
const module = asset({ id: 'mod', parentAssetId: 'rack', slotIndex: 2 });
const dist = asset({ id: 'dist', floorId: 'f1', positionX: 10, positionY: 20, width2d: 30, height2d: 30 });
const circuit = asset({ id: 'circ', parentAssetId: 'dist' });
const orphan = asset({ id: 'orphan', parentAssetId: null });
// cycle: a → b → a (neither placed)
const cycA = asset({ id: 'cycA', parentAssetId: 'cycB' });
const cycB = asset({ id: 'cycB', parentAssetId: 'cycA' });

const map = assetsByIdMap([rack, module, dist, circuit, orphan, cycA, cycB]);

describe('isFloorPlaced', () => {
  it('placed = floorId + coords + size', () => {
    expect(isFloorPlaced(rack)).toBe(true);
    expect(isFloorPlaced(module)).toBe(false); // no coords
    expect(isFloorPlaced(null)).toBe(false);
    expect(isFloorPlaced(asset({ id: 'noSize', floorId: 'f1', positionX: 1, positionY: 1 }))).toBe(false);
  });
});

describe('floorAnchor', () => {
  it('placed self → self', () => {
    expect(floorAnchor('rack', map)?.id).toBe('rack');
  });
  it('module → parent rack', () => {
    expect(floorAnchor('mod', map)?.id).toBe('rack');
  });
  it('circuit → parent dist', () => {
    expect(floorAnchor('circ', map)?.id).toBe('dist');
  });
  it('orphan (no placed ancestor) → null', () => {
    expect(floorAnchor('orphan', map)).toBeNull();
  });
  it('cycle guard → null (no infinite loop)', () => {
    expect(floorAnchor('cycA', map)).toBeNull();
  });
  it('unknown id → null', () => {
    expect(floorAnchor('nope', map)).toBeNull();
    expect(floorAnchor(null, map)).toBeNull();
  });
});

describe('anchorPosition', () => {
  it('center of placed anchor', () => {
    expect(anchorPosition('rack', map)).toEqual({ x: 120, y: 230 });
  });
  it('module resolves to rack center', () => {
    expect(anchorPosition('mod', map)).toEqual({ x: 120, y: 230 });
  });
  it('circuit resolves to dist center', () => {
    expect(anchorPosition('circ', map)).toEqual({ x: 25, y: 35 });
  });
  it('orphan → null', () => {
    expect(anchorPosition('orphan', map)).toBeNull();
  });
});

describe('floorTargetFor (단일 choke-point: 선택→도면 rect)', () => {
  const list = [rack, module, dist, circuit, orphan, cycA, cycB];

  it('placed self → 자신의 rect', () => {
    expect(floorTargetFor('rack', list)).toEqual({ x: 100, y: 200, width: 40, height: 60 });
  });
  it('module → 부모 랙 rect (포커스/하이라이트가 랙에 걸림)', () => {
    expect(floorTargetFor('mod', list)).toEqual({ x: 100, y: 200, width: 40, height: 60 });
  });
  it('circuit → 부모 분전반 rect', () => {
    expect(floorTargetFor('circ', list)).toEqual({ x: 10, y: 20, width: 30, height: 30 });
  });
  it('orphan(미배치 조상) → null', () => {
    expect(floorTargetFor('orphan', list)).toBeNull();
  });
  it('cycle → null', () => {
    expect(floorTargetFor('cycA', list)).toBeNull();
  });
  it('unknown / null id → null', () => {
    expect(floorTargetFor('nope', list)).toBeNull();
    expect(floorTargetFor(null, list)).toBeNull();
  });

  it('깊은 중첩(포트→모듈→랙)도 랙 rect 로 해소', () => {
    const port = asset({ id: 'port', parentAssetId: 'mod' });
    expect(floorTargetFor('port', [...list, port])).toEqual({ x: 100, y: 200, width: 40, height: 60 });
  });
});

describe('cableOnFloor (단계4a: 단일 endpoint assetId + floorAnchor 멤버십, 레거시 nested 폴백 제거)', () => {
  // 분전반(panel, placed) → feeder → branch — 통합 노드 모델. branch endpoint 는
  // branch→feeder→panel 으로 해소된다.
  const panel = asset({ id: 'panel', floorId: 'f1', positionX: 1, positionY: 1, width2d: 10, height2d: 10 });
  const feeder = asset({ id: 'feeder', parentAssetId: 'panel' });
  const branch = asset({ id: 'branch', parentAssetId: 'feeder' });
  const cmap = assetsByIdMap([rack, module, dist, circuit, panel, feeder, branch]);

  it('eq/mod endpoint(assetId) — 자신/랙으로 해소되어 f1 멤버', () => {
    expect(cableOnFloor({ sourceAssetId: 'rack', targetAssetId: 'mod' }, 'f1', cmap)).toBe(true);
  });
  it('시드 분기 케이블 — targetAssetId=branch → feeder → panel(f1) 멤버', () => {
    expect(cableOnFloor({ sourceAssetId: 'rack', targetAssetId: 'branch' }, 'f1', cmap)).toBe(true);
  });
  it('다른 층은 제외 — 어느 endpoint 도 f2 에 닿지 않음', () => {
    expect(cableOnFloor({ sourceAssetId: 'rack', targetAssetId: 'branch' }, 'f2', cmap)).toBe(false);
  });
  it('assetId 없는 endpoint(레거시 nested 만) → 미해소 → 비멤버(폴백 제거됨)', () => {
    expect(cableOnFloor({ sourceAssetId: null, targetAssetId: null }, 'f1', cmap)).toBe(false);
  });
  it('orphan/unknown endpoint → 미해소 → 비멤버', () => {
    expect(cableOnFloor({ sourceAssetId: 'nope', targetAssetId: 'orphan' }, 'f1', cmap)).toBe(false);
  });
});

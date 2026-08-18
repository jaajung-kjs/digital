import { describe, expect, it } from 'vitest';
import type { V2AssetType } from '../types';
import { makeNewAsset } from '../newAsset';

const mkType = (id: string, key: string, categoryId: string): V2AssetType => ({
  id, key, name: key, categoryId, sortOrder: 1, assetCount: 0,
  defaultWidth: null, defaultHeight: null, laborCode: null, installManDays: 0, removeManDays: 0, relocateManDays: 0,
  portTemplates: [],
});

/* 무엇을 담을 수 있는가는 이제 판정할 것이 없다 — 설비 종류를 짜는 사람이 정한다.
   자리가 타입을 걸러내던 수용 규칙(accepts)은 개념째 걷었다. */
/* 자산은 반드시 어딘가에 놓인다 — 자리 없는 자산을 만드는 길은 없앴다. */
const GRID = { kind: 'grid', parentAssetId: 'rack', col: 0, row: 0, colSpan: 1, rowSpan: 1 } as const;

/* `freeCells` 는 규칙이 사는 곳(core)에서 잰다 — 여기서 다시 재던 것은 재수출을 타고
   들어온 같은 함수였다. */
describe('makeNewAsset', () => {
  it('uuid id + 기본값 + 격자 배치 반영', () => {
    const a = makeNewAsset({ type: mkType('t1', 'PITR', 'c-comm'), name: '신규', substationId: 'ss', placement: { kind: 'grid', parentAssetId: 'rack', col: 0, row: 3, colSpan: 1, rowSpan: 1 } });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).toMatchObject({ name: '신규', typeId: 't1', status: 'normal', parentAssetId: 'rack', col: 0, row: 3 });
  });
  it('floor placement 반영', () => {
    const a = makeNewAsset({ type: mkType('t1', 'GROUNDING', 'c-struct'), name: '접지', substationId: 'ss',
      placement: { kind: 'floor', floorId: 'f1', x: 10, y: 20, width: 60, height: 80 } });
    expect(a).toMatchObject({ floorId: 'f1', x: 10, y: 20, width: 60, height: 80, parentAssetId: null });
  });
});

/**
 * 워킹카피는 「저장하면 이렇게 된다」 — **포트도 그 그림에 들어간다**.
 *
 * 예전에는 포트를 서버가 커밋 때만 만들어서, 저장하기 전에는 상세 패널의 포트 탭이 사라지고
 * 선번장·계통에도 안 나타나고 케이블을 이을 수도 없었다. 설비를 놓고 케이블을 이어 한 번에
 * 저장하는 길이 막혀 있었다(저장부터 해야 했다).
 */
describe('새 자산의 포트', () => {
  const slotType = mkType('t-slot', 'OFD-SLOT', 'c-comm');
  slotType.portTemplates = [
    { id: 'p1', group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', sortOrder: 0, positions: 24 },
    { id: 'p2', group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '장비 {n}', sortOrder: 1, positions: 1 },
  ];

  it('놓는 순간 명세대로 포트가 생긴다', () => {
    const a = makeNewAsset({ type: slotType, name: '슬롯 1', substationId: 'ss', placement: GRID });
    expect(a.ports).toHaveLength(25);
    expect(a.ports.filter((p) => p.group === 'CORE')).toHaveLength(24);
    // 다심 인입은 포트 **하나**가 심선 수를 나른다 — 심선마다 펴지 않는다.
    expect(a.ports.find((p) => p.group === 'TRUNK')).toMatchObject({ positions: 24, name: 'OPGW' });
  });

  it('포트마다 id 가 붙는다 — 저장 전에 케이블을 이을 수 있어야 한다', () => {
    const a = makeNewAsset({ type: slotType, name: '슬롯 1', substationId: 'ss', placement: GRID });
    const ids = new Set(a.ports.map((p) => p.id));
    expect(ids.size).toBe(a.ports.length);
    expect(a.ports.every((p) => p.assetId === a.id)).toBe(true);
  });

  it('포트가 없는 종류는 빈 채로 둔다', () => {
    const a = makeNewAsset({ type: mkType('t2', 'HVAC', 'c-comm'), name: '공조', substationId: 'ss', placement: GRID });
    expect(a.ports).toEqual([]);
  });
});

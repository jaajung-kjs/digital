import { describe, expect, it } from 'vitest';
import type { V2AssetType } from '../types';
import { freeCells, makeNewAsset } from '../newAsset';

const mkType = (id: string, key: string, categoryId: string): V2AssetType => ({
  id, key, name: key, categoryId, sortOrder: 1, assetCount: 0,
  defaultWidth: null, defaultHeight: null, laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
  portTemplates: [],
});

/* 무엇을 담을 수 있는가는 이제 판정할 것이 없다 — 설비 종류를 짜는 사람이 정한다.
   자리가 타입을 걸러내던 수용 규칙(accepts)은 개념째 걷었다. */
describe('freeCells', () => {
  it('점유(span 포함) 제외한 빈 자리', () => {
    expect(freeCells({ cols: 1, rows: 6 }, [{ col: 0, row: 0, colSpan: 1, rowSpan: 2 }, { col: 0, row: 4, colSpan: 1, rowSpan: 1 }]))
      .toEqual([{ col: 0, row: 2 }, { col: 0, row: 3 }, { col: 0, row: 5 }]);
  });

  /* 가로·세로 둘 다 겹쳐야 겹친 것이다 — 2열 격자의 옆 칸은 남의 자리가 아니다. */
  it('여러 열이면 행 우선으로 나열한다', () => {
    expect(freeCells({ cols: 2, rows: 2 }, [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }]))
      .toEqual([{ col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }]);
  });
});

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

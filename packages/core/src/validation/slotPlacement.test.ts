import { describe, expect, it } from 'vitest';
import type { AssetTypeSpec } from '../catalog/types.js';
import { freeSlots, isAccepted, validateSlotPlacement } from './slotPlacement.js';

const rack: AssetTypeSpec = {
  key: 'RACK',
  name: '랙',
  categoryKey: '구조',
  sortOrder: 1,
  placement: { placeable: true, defaultWidth: 60, defaultHeight: 80 },
  labor: { laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 2 },
  containers: [
    { key: 'main', name: '슬롯', cols: 1, rows: 12, allowSpan: true, accepts: { categoryKeys: ['통신', '전원'] } },
  ],
  ports: [],
};

const base = {
  parentType: rack,
  containerKey: 'main',
  child: { typeKey: 'PITR-5000', categoryKey: '통신' },
  col: 0,
  row: 0,
  colSpan: 1,
  rowSpan: 1,
  occupants: [],
};

/** 분전반 조서처럼 좌우 2열짜리 격자 — 번호는 1·2가 첫 행이다. */
const panel: AssetTypeSpec = {
  ...rack,
  containers: [{ key: 'main', name: '회로', cols: 2, rows: 3, allowSpan: false, accepts: {} }],
};

describe('validateSlotPlacement', () => {
  it('유효한 배치는 null', () => {
    expect(validateSlotPlacement(base)).toBeNull();
  });

  it('없는 컨테이너 key → container-not-found', () => {
    expect(validateSlotPlacement({ ...base, containerKey: 'nope' })).toBe('container-not-found');
  });

  it('수용 조건 불일치 → not-accepted', () => {
    expect(
      validateSlotPlacement({ ...base, child: { typeKey: 'HVAC', categoryKey: '공조' } }),
    ).toBe('not-accepted');
  });

  it('typeKeys 로도 수용된다 (OR)', () => {
    const ofdLike = {
      ...rack,
      containers: [{ key: 'main', name: '슬롯', cols: 1, rows: null, allowSpan: false, accepts: { typeKeys: ['OFD-SLOT'] } }],
    };
    expect(
      validateSlotPlacement({
        ...base,
        parentType: ofdLike,
        child: { typeKey: 'OFD-SLOT', categoryKey: '통신' },
        col: null,
        row: null,
      }),
    ).toBeNull();
  });

  it('accepts 빈 객체 = 모두 수용', () => {
    const anyRack = {
      ...rack,
      containers: [{ key: 'main', name: '슬롯', cols: 1, rows: 12, allowSpan: true, accepts: {} }],
    };
    expect(
      validateSlotPlacement({ ...base, parentType: anyRack, child: { typeKey: 'X', categoryKey: 'Y' } }),
    ).toBeNull();
  });

  it('span 0 → out-of-range (span 가드)', () => {
    expect(validateSlotPlacement({ ...base, rowSpan: 0 })).toBe('out-of-range');
    expect(validateSlotPlacement({ ...base, colSpan: 0 })).toBe('out-of-range');
  });

  it('격자 밖 → out-of-range', () => {
    expect(validateSlotPlacement({ ...base, row: 11, rowSpan: 2 })).toBe('out-of-range');
    expect(validateSlotPlacement({ ...base, row: -1 })).toBe('out-of-range');
    // 1열짜리 랙에는 두 번째 열이 없다.
    expect(validateSlotPlacement({ ...base, col: 1 })).toBe('out-of-range');
  });

  it('격자 컨테이너에 자리(col/row) 없음 → out-of-range', () => {
    expect(validateSlotPlacement({ ...base, col: null })).toBe('out-of-range');
    expect(validateSlotPlacement({ ...base, row: null })).toBe('out-of-range');
  });

  it('span 금지 컨테이너에서 span>1 → span-not-allowed', () => {
    const noSpan = {
      ...rack,
      containers: [{ key: 'main', name: '슬롯', cols: 1, rows: 12, allowSpan: false, accepts: {} }],
    };
    expect(validateSlotPlacement({ ...base, parentType: noSpan, rowSpan: 2 })).toBe('span-not-allowed');
  });

  it('기존 점유와 겹침 → overlap', () => {
    const occ = [{ assetId: 'other', col: 0, row: 1, colSpan: 1, rowSpan: 2 }];
    expect(validateSlotPlacement({ ...base, row: 2, occupants: occ })).toBe('overlap');
    expect(validateSlotPlacement({ ...base, row: 3, occupants: occ })).toBeNull();
  });

  /* 가로·세로 **둘 다** 겹쳐야 겹친 것이다 — 1차원 모델을 그대로 옮기면 같은 행의 옆 칸이
     겹친 것으로 잘못 판정된다. */
  it('같은 행이라도 열이 다르면 겹치지 않는다', () => {
    const occ = [{ assetId: 'other', col: 0, row: 1, colSpan: 1, rowSpan: 1 }];
    expect(validateSlotPlacement({ ...base, parentType: panel, col: 1, row: 1, occupants: occ })).toBeNull();
    expect(validateSlotPlacement({ ...base, parentType: panel, col: 0, row: 1, occupants: occ })).toBe('overlap');
  });

  it('자유형 컨테이너(rows null)는 위치 검증 없이 수용만 본다', () => {
    const free = {
      ...rack,
      containers: [{ key: 'main', name: '목록', cols: 1, rows: null, allowSpan: false, accepts: {} }],
    };
    expect(validateSlotPlacement({ ...base, parentType: free, col: null, row: null })).toBeNull();
  });
});

describe('freeSlots', () => {
  const cell = (col: number, row: number) => ({ col, row });

  it('점유(span 포함) 제외한 빈 칸', () => {
    const spec = { cols: 1, rows: 6 };
    expect(
      freeSlots(spec, [
        { col: 0, row: 0, colSpan: 1, rowSpan: 2 },
        { col: 0, row: 4, colSpan: 1, rowSpan: 1 },
      ]),
    ).toEqual([cell(0, 2), cell(0, 3), cell(0, 5)]);
  });

  it('span null(=1)인 점유자도 1칸만 차지', () => {
    const spec = { cols: 1, rows: 4 };
    expect(freeSlots(spec, [{ col: 0, row: 1, colSpan: null, rowSpan: null }])).toEqual([
      cell(0, 0), cell(0, 2), cell(0, 3),
    ]);
  });

  it('자리 없는 점유자는 무시(미배치 형제)', () => {
    const spec = { cols: 1, rows: 3 };
    expect(freeSlots(spec, [{ col: null, row: null, colSpan: 2, rowSpan: 2 }])).toEqual([
      cell(0, 0), cell(0, 1), cell(0, 2),
    ]);
  });

  it('자유형 컨테이너(rows null) → 항상 빈 배열', () => {
    const spec = { cols: 1, rows: null };
    expect(freeSlots(spec, [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }])).toEqual([]);
    expect(freeSlots(spec, [])).toEqual([]);
  });

  /* 행 우선으로 훑는다 — 자리 번호와 같은 순서라야 고르는 목록이 1·2·3… 으로 읽힌다. */
  it('여러 열이면 행 우선으로 훑는다', () => {
    expect(freeSlots({ cols: 2, rows: 2 }, [])).toEqual([cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1)]);
  });

  it('span>1 점유가 경계 칸까지 정확히 가린다 (구간 겹침 경계)', () => {
    const spec = { cols: 1, rows: 5 };
    // 점유 [2,4) → 행 2,3 점유. 인접한 1과 4는 자유.
    expect(freeSlots(spec, [{ col: 0, row: 2, colSpan: 1, rowSpan: 2 }])).toEqual([
      cell(0, 0), cell(0, 1), cell(0, 4),
    ]);
  });
});

describe('isAccepted', () => {
  it('빈 규칙 전체 수용, categoryKeys/typeKeys OR', () => {
    expect(isAccepted({}, { typeKey: 'X', categoryKey: 'Y' })).toBe(true);
    expect(isAccepted({ categoryKeys: ['통신'] }, { typeKey: 'X', categoryKey: '통신' })).toBe(true);
    expect(isAccepted({ categoryKeys: ['통신'] }, { typeKey: 'X', categoryKey: '구조' })).toBe(false);
    expect(isAccepted({ typeKeys: ['X'] }, { typeKey: 'X', categoryKey: '구조' })).toBe(true);
  });
});

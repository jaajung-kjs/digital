import { describe, expect, it } from 'vitest';
import type { AssetTypeSpec } from '../catalog/types.js';
import { validateSlotPlacement } from './slotPlacement.js';

const rack: AssetTypeSpec = {
  key: 'RACK',
  name: '랙',
  categoryKey: '구조',
  sortOrder: 1,
  placement: { placeable: true, defaultWidth: 60, defaultHeight: 80 },
  labor: { laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 2 },
  fields: [],
  containers: [
    { key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신', '전원'] } },
  ],
  ports: [],
  links: [],
};

const base = {
  parentType: rack,
  containerKey: 'main',
  child: { typeKey: 'PITR-5000', categoryKey: '통신' },
  slotIndex: 0,
  slotSpan: 1,
  occupants: [],
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
      containers: [{ key: 'main', name: '슬롯', slotCount: null, allowSpan: false, accepts: { typeKeys: ['OFD-SLOT'] } }],
    };
    expect(
      validateSlotPlacement({
        ...base,
        parentType: ofdLike,
        child: { typeKey: 'OFD-SLOT', categoryKey: '통신' },
        slotIndex: null,
      }),
    ).toBeNull();
  });

  it('accepts 빈 객체 = 모두 수용', () => {
    const anyRack = {
      ...rack,
      containers: [{ key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: {} }],
    };
    expect(
      validateSlotPlacement({ ...base, parentType: anyRack, child: { typeKey: 'X', categoryKey: 'Y' } }),
    ).toBeNull();
  });

  it('범위 밖 → out-of-range (slotIndex + span > slotCount)', () => {
    expect(validateSlotPlacement({ ...base, slotIndex: 11, slotSpan: 2 })).toBe('out-of-range');
    expect(validateSlotPlacement({ ...base, slotIndex: -1 })).toBe('out-of-range');
  });

  it('고정 슬롯 컨테이너에 slotIndex null → out-of-range', () => {
    expect(validateSlotPlacement({ ...base, slotIndex: null })).toBe('out-of-range');
  });

  it('span 금지 컨테이너에서 span>1 → span-not-allowed', () => {
    const noSpan = {
      ...rack,
      containers: [{ key: 'main', name: '슬롯', slotCount: 12, allowSpan: false, accepts: {} }],
    };
    expect(validateSlotPlacement({ ...base, parentType: noSpan, slotSpan: 2 })).toBe('span-not-allowed');
  });

  it('기존 점유와 겹침 → overlap', () => {
    const occ = [{ assetId: 'other', slotIndex: 1, slotSpan: 2 }];
    expect(validateSlotPlacement({ ...base, slotIndex: 2, occupants: occ })).toBe('overlap');
    expect(validateSlotPlacement({ ...base, slotIndex: 3, occupants: occ })).toBeNull();
  });

  it('자유형 컨테이너(slotCount null)는 위치 검증 없이 수용만 본다', () => {
    const free = {
      ...rack,
      containers: [{ key: 'main', name: '목록', slotCount: null, allowSpan: false, accepts: {} }],
    };
    expect(validateSlotPlacement({ ...base, parentType: free, slotIndex: null })).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { planSlotNames, type SlotRow } from './slotNames.js';

const row = (o: Partial<SlotRow>): SlotRow => ({
  id: 'x', ofdId: 'ofd', ownSub: '춘천S/S', twinId: 't', twinSub: 'sub-bc', twinSubName: '북춘천S/S',
  cores: 24, slotIndex: null, ...o,
});

describe('planSlotNames', () => {
  it('같은 OFD·같은 대국 형제는 slotIndex→id 순으로 -1,-2', () => {
    const out = planSlotNames([
      row({ id: 'b', slotIndex: 2 }),
      row({ id: 'a', slotIndex: 1 }),
    ]);
    expect(out.find((r) => r.id === 'a')!.name).toBe('춘천S/S - 북춘천S/S -1 #24');
    expect(out.find((r) => r.id === 'b')!.name).toBe('춘천S/S - 북춘천S/S -2 #24');
  });
  it('대국 다르면 각자 -1', () => {
    const out = planSlotNames([
      row({ id: 'a', twinSub: 'sub-bc', twinSubName: '북춘천S/S' }),
      row({ id: 'b', twinSub: 'sub-xx', twinSubName: '세종S/S' }),
    ]);
    expect(out.find((r) => r.id === 'a')!.name).toBe('춘천S/S - 북춘천S/S -1 #24');
    expect(out.find((r) => r.id === 'b')!.name).toBe('춘천S/S - 세종S/S -1 #24');
  });
  it('코어 0 이면 # 생략', () => {
    expect(planSlotNames([row({ cores: 0 })])[0].name).toBe('춘천S/S - 북춘천S/S -1');
  });
});

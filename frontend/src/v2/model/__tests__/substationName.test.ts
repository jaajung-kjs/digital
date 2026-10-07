import { describe, expect, it } from 'vitest';
import { emptyOverlay, stageCreate, stageDelete } from '../../store/overlay';
import { substationName } from '../store/effective';
import { workingCopyStore } from '../store/workingCopy';
import type { FiberLine } from '../types';

const line = (id: string, b: string, bName: string): FiberLine => ({
  id, cableTypeId: 'c', coreCount: 2, name: null, lengthKm: null, segments: [],
  aSubstationId: 'S1', aEquipmentId: null, aPanel: null, aStartNo: 1,
  bSubstationId: b, bEquipmentId: null, bPanel: null, bStartNo: 1,
  aSubstationName: '북춘천S/S', bSubstationName: bName, updatedAt: 'v',
});

describe('substationName — 저장 바가 적을 국 이름', () => {
  it('들른 국은 그 국 행, 들르지 않은 국은 광선로의 끝 이름 — 지우기로 한 광선로·새 광선로 포함, 모르면 null', () => {
    const base = workingCopyStore.getState();
    const s = {
      saved: { ...base.saved, substations: { S1: { id: 'S1', name: '북춘천S/S' } }, fiberLines: [line('L1', 'S2', '(구)춘천S/S')] },
      overlays: { ...base.overlays, fiberLines: stageCreate(stageDelete(emptyOverlay<FiberLine>(), 'L1'), 'L2', line('L2', 'S3', '남춘천S/S')) },
    };
    expect(substationName(s, 'S1')).toBe('북춘천S/S');
    expect(substationName(s, 'S2')).toBe('(구)춘천S/S');
    expect(substationName(s, 'S3')).toBe('남춘천S/S');
    expect(substationName(s, 'S9')).toBeNull();
  });
});

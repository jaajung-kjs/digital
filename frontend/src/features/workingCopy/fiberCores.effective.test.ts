import { describe, it, expect, beforeEach } from 'vitest';
import { useSubstationWorkingCopy } from './substationStore';

describe('workingCopy fiberCores 컬렉션', () => {
  beforeEach(() => useSubstationWorkingCopy.getState().reset());

  it('put/patch/remove 로 fiberCores overlay 가 dirty 에 참여한다', () => {
    const s = useSubstationWorkingCopy.getState();
    expect(s.dirtyCount()).toBe(0);
    s.put('fiberCores', { id: 'temp-1', fiberPathId: 'fp1', coreNumber: 5, purpose: '통합단말' });
    expect(useSubstationWorkingCopy.getState().dirtyCount()).toBe(1);
    useSubstationWorkingCopy.getState().remove('fiberCores', 'temp-1');
    expect(useSubstationWorkingCopy.getState().dirtyCount()).toBe(0);
  });
});

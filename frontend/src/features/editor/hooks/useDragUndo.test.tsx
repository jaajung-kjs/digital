import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { api } from '../../../utils/api';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';

const ofd = {
  id: 'o1', name: 'OFD', substationId: 's1', floorId: 'f1',
  assetType: { role: 'ofd' }, positionX: 5, positionY: 5,
  parentAssetId: null, slotIndex: null, updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  (api.get as any).mockResolvedValue({
    data: { data: { assets: [ofd], cables: [] } },
  });
});

/**
 * UX#1 regression: a multi-frame drag must collapse into a SINGLE undo step
 * that reverts to the pre-drag position. This mirrors useCanvasEvents'
 * mousemove→stageAssetUpdate loop wrapped by pause()/resume().
 */
describe('drag → single undo step', () => {
  function simulateDrag(frames: number[]) {
    const wc = useSubstationWorkingCopy.getState();
    const t = useSubstationWorkingCopy.temporal.getState();
    let recorded = false;
    for (const x of frames) {
      wc.stageAssetUpdate('o1', { positionX: x });
      if (!recorded) {
        recorded = true;
        useSubstationWorkingCopy.temporal.getState().pause();
      }
    }
    if (recorded) useSubstationWorkingCopy.temporal.getState().resume();
    void t;
  }

  it('20-frame drag → exactly 1 new past state, one undo reverts to origin', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const before = useSubstationWorkingCopy.temporal.getState().pastStates.length;

    simulateDrag([6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40]);

    const past = useSubstationWorkingCopy.temporal.getState();
    expect(past.pastStates.length - before).toBe(1); // whole drag = 1 history entry
    expect(useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === 'o1')!.positionX).toBe(40);

    useSubstationWorkingCopy.temporal.getState().undo();
    expect(useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === 'o1')!.positionX).toBe(5); // back to origin
  });

  it('two separate drags → two undo steps', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    simulateDrag([6, 8, 10]);          // drag 1 → x=10
    simulateDrag([12, 16, 20]);        // drag 2 → x=20
    expect(useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === 'o1')!.positionX).toBe(20);

    useSubstationWorkingCopy.temporal.getState().undo(); // undo drag 2 → x=10
    expect(useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === 'o1')!.positionX).toBe(10);
    useSubstationWorkingCopy.temporal.getState().undo(); // undo drag 1 → x=5
    expect(useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === 'o1')!.positionX).toBe(5);
  });
});

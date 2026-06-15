import { describe, it, expect, vi, beforeEach } from 'vitest';
const { stageCableCreate, cancelCableDrawing, setSelectedCableId, showToast } = vi.hoisted(() => ({ stageCableCreate: vi.fn(), cancelCableDrawing: vi.fn(), setSelectedCableId: vi.fn(), showToast: vi.fn() }));
vi.mock('../workingCopy/substationStore', () => ({ useSubstationWorkingCopy: { getState: () => ({ stageCableCreate }) } }));
vi.mock('./stores/editorStore', () => ({ useEditorStore: { getState: () => ({ cancelCableDrawing, setSelectedCableId }) } }));
vi.mock('./stores/toastStore', () => ({ useToastStore: { getState: () => ({ showToast }) } }));
vi.mock('../../utils/idHelpers', () => ({ generateTempId: () => 'tmp1' }));
import { commitCable } from './cableConnection';
import { useInteractionStore } from './stores/interactionStore';
beforeEach(() => { vi.clearAllMocks(); useInteractionStore.getState().cancel(); });
describe('commitCable', () => {
  it('ready → stageCableCreate + 종료 + 토스트', () => {
    const s = useInteractionStore.getState();
    s.cableActivate({ category: { id: 'cat', code: 'CBL-XLPE', name: 'XLPE', displayColor: '#f00' } });
    s.cableSetSource({ containerAssetId: 'distA', position: { x: 0, y: 0 }, innerAssetId: 'feedA', role: 'OUT', number: 3 });
    s.cableSetTarget({ containerAssetId: 'eqB', position: { x: 10, y: 0 } });
    commitCable();
    expect(stageCableCreate).toHaveBeenCalledTimes(1);
    expect(stageCableCreate.mock.calls[0][0]).toMatchObject({ sourceAssetId: 'feedA', targetAssetId: 'eqB', categoryId: 'cat', sourceRole: 'OUT', number: 3 });
    expect(cancelCableDrawing).toHaveBeenCalled(); expect(showToast).toHaveBeenCalled();
  });
  it('ready 아니면 no-op', () => { useInteractionStore.getState().cableActivate(); commitCable(); expect(stageCableCreate).not.toHaveBeenCalled(); });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
const { stageCableCreate, cancelCableDrawing, setSelectedCableId, showToast, setTool, setPreselectedCableDisplayGroup } = vi.hoisted(() => ({ stageCableCreate: vi.fn(), cancelCableDrawing: vi.fn(), setSelectedCableId: vi.fn(), showToast: vi.fn(), setTool: vi.fn(), setPreselectedCableDisplayGroup: vi.fn() }));
vi.mock('../workingCopy/substationStore', () => ({ useSubstationWorkingCopy: { getState: () => ({ stageCableCreate }) } }));
vi.mock('./stores/editorStore', () => ({ useEditorStore: { getState: () => ({ cancelCableDrawing, setSelectedCableId, setTool, setPreselectedCableDisplayGroup }) } }));
vi.mock('./stores/toastStore', () => ({ useToastStore: { getState: () => ({ showToast }) } }));
vi.mock('../../utils/idHelpers', () => ({ generateTempId: () => 'tmp1' }));
import { commitCable, startCableConnection } from './cableConnection';
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
describe('startCableConnection', () => {
  it('source 주입 → setTool(cable) + cableDrawing(selectingType, source 보존)', () => {
    startCableConnection({ source: { containerAssetId: 'distA', position: { x: 0, y: 0 }, innerAssetId: 'feedA', role: 'OUT' } });
    expect(setTool).toHaveBeenCalledWith('cable');
    const m = useInteractionStore.getState().mode;
    expect(m.kind).toBe('cableDrawing');
    if (m.kind !== 'cableDrawing') throw new Error('expected cableDrawing');
    // category 없으므로 종류 선택 대기. source 는 보존.
    expect(m.data.phase).toBe('selectingType');
    expect(m.data.source?.innerAssetId).toBe('feedA');
  });
  it('group 주입 → setPreselectedCableDisplayGroup(group)', () => {
    startCableConnection({ group: '광' });
    expect(setPreselectedCableDisplayGroup).toHaveBeenCalledWith('광');
  });
  it('opts 없음 → setPreselectedCableDisplayGroup(null)', () => {
    startCableConnection();
    expect(setTool).toHaveBeenCalledWith('cable');
    expect(setPreselectedCableDisplayGroup).toHaveBeenCalledWith(null);
  });
});

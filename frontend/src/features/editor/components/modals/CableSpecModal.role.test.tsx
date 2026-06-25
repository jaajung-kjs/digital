import { describe, it, expect, vi, beforeEach } from 'vitest';

// 전원계통 방향성 — 1.4 이후 IN/OUT(역할)은 모달이 아니라 endpoint(EndpointRef.role)
// 에서 결정된다(피커가 distributor/conduit 끝점에 role 을 실어 보낸다). commitCable
// 가 그 role 을 그대로 stageCableCreate 에 싣는지 검증한다.
//
// 추가(P6): conduit(슬롯) 끝점 → role=OUT·number=코어번호. fiberPathId 는 P7 에서 제거됨.

const { stageCableCreate, cancelCableDrawing, setSelectedCableId, showToast } = vi.hoisted(() => ({
  stageCableCreate: vi.fn(),
  cancelCableDrawing: vi.fn(),
  setSelectedCableId: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock('../../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: { getState: () => ({ stageCableCreate }) },
}));
vi.mock('../../stores/editorStore', () => ({
  useEditorStore: { getState: () => ({ cancelCableDrawing, setSelectedCableId }) },
}));
vi.mock('../../stores/toastStore', () => ({
  useToastStore: { getState: () => ({ showToast }) },
}));
vi.mock('../../../../utils/idHelpers', () => ({ generateTempId: () => 'tmp-role' }));

import { commitCable } from '../../cableConnection';
import { useInteractionStore } from '../../stores/interactionStore';

describe('distributor 끝점 IN/OUT 지정', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInteractionStore.getState().cancel();
  });

  it('distributor target 끝점에 role=OUT 이 실리면 targetRole=OUT, sourceRole=null', () => {
    const ix = useInteractionStore.getState();
    ix.cableActivate({ category: { id: 'cat-pw', name: '전력' } });
    ix.cableSetSource({ containerAssetId: 'rack-1', position: { x: 0, y: 0 } });
    // distributor 끝점(피더) → 피커가 role='OUT' 을 실어 보낸다.
    ix.cableSetTarget({ containerAssetId: 'panel-1', position: { x: 10, y: 10 }, innerAssetId: 'F1', role: 'OUT' });

    commitCable();

    expect(stageCableCreate).toHaveBeenCalledTimes(1);
    expect(stageCableCreate).toHaveBeenCalledWith(
      expect.objectContaining({ targetRole: 'OUT', sourceRole: null }),
    );
  });
});

describe('conduit(슬롯) 끝점 OUT 코어 케이블(P6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInteractionStore.getState().cancel();
  });

  it('설비→슬롯(conduit) 드로잉 — slot 끝 role=OUT, number=코어번호, fiberPathId/fiberPortNumber 없음(P7), source role null', () => {
    const ix = useInteractionStore.getState();
    ix.cableActivate({ category: { id: 'cat-pw', name: '전력' } });
    ix.cableSetSource({ containerAssetId: 'eq-1', position: { x: 0, y: 0 } });
    // OFD 드롭 흐름: containerAssetId = OFD equipment id, slotId/coreNumber/role 은
    // EndpointRef 채널. endpointAssetId() 가 slotId 를 endpoint 로 해소.
    ix.cableSetTarget({ containerAssetId: 'ofd-1', position: { x: 10, y: 10 }, slotId: 'slot-1', coreNumber: 3, role: 'OUT' });

    commitCable();

    expect(stageCableCreate).toHaveBeenCalledTimes(1);
    const arg = stageCableCreate.mock.calls[0][0] as Record<string, unknown>;

    // endpoint: source = 설비, target = 슬롯(conduit).
    expect(arg.sourceAssetId).toBe('eq-1');
    expect(arg.targetAssetId).toBe('slot-1');

    // 슬롯 끝 role = OUT, 설비 끝 role = null.
    expect(arg.targetRole).toBe('OUT');
    expect(arg.sourceRole).toBeNull();

    // 코어 번호가 number 필드에 실린다.
    expect(arg.number).toBe(3);

    // 신모델: fiberPathId / fiberPortNumber 는 케이블 payload 에 없음(P7 제거).
    expect(arg.fiberPathId).toBeUndefined();
    expect(arg.fiberPortNumber).toBeUndefined();
  });
});

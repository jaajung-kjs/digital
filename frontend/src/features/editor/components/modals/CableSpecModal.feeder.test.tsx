import { describe, it, expect, vi, beforeEach } from 'vitest';

// 전원 계통(FEEDER) asset 으로 그린 케이블이 단일 targetAssetId = 피더 asset id
// 를 갖는지 검증한다. 1.4 이후 모달은 종류만 고르고, 출발/도착 endpoint 와 생성은
// 피커 + commitCable 가 담당한다. 피커가 고른 feeder id 는 EndpointRef.innerAssetId
// 채널로 흐르고, commitCable 가 endpointAssetId() 로 단일 assetId 로 stage 한다.
// (CB = 피더로 가는 출력 케이블 — 별도 분기 노드 없음.)

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
vi.mock('../../../../utils/idHelpers', () => ({ generateTempId: () => 'tmp-feeder' }));

import { commitCable } from '../../cableConnection';
import { useInteractionStore } from '../../stores/interactionStore';

const FEEDER_ID = 'F1';

describe('피더 케이블 endpoint = 피더 asset id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInteractionStore.getState().cancel();
  });

  it('통신랙 → 전원 계통(F1) 케이블 → targetAssetId = F1 (단일 assetId)', () => {
    const ix = useInteractionStore.getState();
    ix.cableActivate({ category: { id: 'cat-lan', code: 'LAN', name: 'UTP', displayColor: '#3b82f6' } });
    // source = 통신랙(설비).
    ix.cableSetSource({ containerAssetId: 'rack-1', position: { x: 0, y: 0 } });
    // target = 피더 asset (picker 가 innerAssetId 채널로 feeder id 전달).
    ix.cableSetTarget({ containerAssetId: 'panel-1', position: { x: 10, y: 10 }, innerAssetId: FEEDER_ID });

    commitCable();

    expect(stageCableCreate).toHaveBeenCalledTimes(1);
    const arg = stageCableCreate.mock.calls[0][0];
    // endpoint 는 단일 assetId 만. 피더 endpoint = feeder asset id.
    expect(arg.targetAssetId).toBe(FEEDER_ID);
    // source(설비)는 그대로 설비 id.
    expect(arg.sourceAssetId).toBe('rack-1');
    // nested source/target 는 staged shape 에서 제거됐다.
    expect(arg.source).toBeUndefined();
    expect(arg.target).toBeUndefined();
  });
});

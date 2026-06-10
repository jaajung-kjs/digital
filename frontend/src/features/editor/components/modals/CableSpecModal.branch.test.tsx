import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// 단계3b — 분기(BRANCH) asset 으로 그린 케이블이 단일 targetAssetId = 분기 asset id
// 를 갖는지 검증한다. CircuitPicker 가 고른 branch id 는 interaction store 의
// circuitId 채널로 흐르고, CableSpecModal 이 이를 단일 assetId 로 stage 한다.

// 카테고리(네트워크) 만 모킹. interaction/substation/editor/toast 스토어는 실제 사용.
vi.mock('../../../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({
    data: [{ id: 'cat-lan', code: 'LAN', name: 'UTP', displayColor: '#3b82f6', displayGroup: null, isActive: true }],
  }),
}));

import { CableSpecModalWrapper } from './CableSpecModal';
import { useInteractionStore } from '../../stores/interactionStore';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';

const BRANCH_ID = 'B1';

describe('CableSpecModal — 분기 케이블 endpoint = 분기 asset id', () => {
  beforeEach(() => {
    useInteractionStore.getState().cancel();
  });

  it('통신랙 → 분기(B1) 케이블 → targetAssetId = B1 (단일 assetId)', () => {
    const stageCableCreate = vi.fn();
    // 실제 substation store 의 stageCableCreate 를 spy 로 대체.
    useSubstationWorkingCopy.setState({ stageCableCreate } as never);

    // source = 통신랙(설비), target = 분기 asset (picker 가 circuitId 채널로 branch id 전달).
    const ix = useInteractionStore.getState();
    ix.cableSetSource('rack-1', { x: 0, y: 0 }, {});
    ix.cableSetTarget('panel-1', { x: 10, y: 10 }, { circuitId: BRANCH_ID });

    render(<CableSpecModalWrapper />);

    // 카테고리 선택 → 확인
    fireEvent.click(screen.getByText('UTP'));
    fireEvent.click(screen.getByText('확인'));

    expect(stageCableCreate).toHaveBeenCalledTimes(1);
    const arg = stageCableCreate.mock.calls[0][0];
    // 분기 endpoint 는 단일 targetAssetId = branch asset id (null 아님).
    expect(arg.targetAssetId).toBe(BRANCH_ID);
    // source(설비)는 그대로 설비 id.
    expect(arg.sourceAssetId).toBe('rack-1');
    // legacy nested circuitId 는 더 이상 사용 안 함 — null.
    expect(arg.target.circuitId).toBeNull();
  });
});

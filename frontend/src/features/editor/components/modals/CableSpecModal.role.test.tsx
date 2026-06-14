import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// 전원계통 방향성 — distributor(피더/충전기/UPS) 끝점으로 케이블을 그리면 그 끝에
// IN/OUT(입력/출력) 지정 UI 가 뜨고, 선택한 role 이 stageCableCreate 에 실린다.
//
// 추가(P6): conduit(슬롯) 끝점 → role=OUT 자동·number=코어번호·fiberPathId null.

// 카테고리(전원) 만 모킹.
vi.mock('../../../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({
    data: [{ id: 'cat-pw', code: 'PW', name: '전력', displayColor: '#ef4444', displayGroup: null, isActive: true }],
  }),
}));

// useEffectiveAssets 를 vi.fn() 으로 노출해 각 it 에서 mockReturnValue 로 제어.
const mockUseEffectiveAssets = vi.fn();
vi.mock('../../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => mockUseEffectiveAssets(),
}));

import { CableSpecModalWrapper } from './CableSpecModal';
import { useInteractionStore } from '../../stores/interactionStore';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';

describe('CableSpecModal — distributor 끝점 IN/OUT 지정', () => {
  beforeEach(() => {
    useInteractionStore.getState().cancel();
    // 기존 테스트 기본값: rack-1=일반, panel-1=distributor.
    mockUseEffectiveAssets.mockReturnValue([
      { id: 'rack-1', assetType: { connectionKind: null } },
      { id: 'panel-1', assetType: { connectionKind: 'distributor' } },
    ]);
  });

  it('distributor target 일 때 입력/출력 선택 UI 가 뜨고, 출력 선택 시 targetRole=OUT', () => {
    const stageCableCreate = vi.fn();
    useSubstationWorkingCopy.setState({ stageCableCreate } as never);

    const ix = useInteractionStore.getState();
    ix.cableSetSource('rack-1', { x: 0, y: 0 }, {});
    ix.cableSetTarget('panel-1', { x: 10, y: 10 }, {});

    render(<CableSpecModalWrapper />);

    // distributor 끝점이 있으므로 입력/출력 selector 가 렌더된다.
    expect(screen.getByText('입력')).toBeTruthy();
    expect(screen.getByText('출력')).toBeTruthy();

    // 카테고리 선택.
    fireEvent.click(screen.getByText('전력'));
    // 출력(OUT) 선택.
    fireEvent.click(screen.getByText('출력'));
    // 확인.
    fireEvent.click(screen.getByText('확인'));

    expect(stageCableCreate).toHaveBeenCalledTimes(1);
    expect(stageCableCreate).toHaveBeenCalledWith(
      expect.objectContaining({ targetRole: 'OUT', sourceRole: null }),
    );
  });
});

describe('CableSpecModal — conduit(슬롯) 끝점 OUT 코어 케이블(P6)', () => {
  beforeEach(() => {
    useInteractionStore.getState().cancel();
  });

  it('설비→슬롯(conduit) 드로잉 — slot 끝 role=OUT, number=코어번호, fiberPathId/fiberPortNumber null, source role null', () => {
    // 슬롯 자산을 conduit 으로 mock.
    mockUseEffectiveAssets.mockReturnValue([
      { id: 'eq-1', assetType: { connectionKind: null } },
      { id: 'slot-1', assetType: { connectionKind: 'conduit' } },
    ]);

    const stageCableCreate = vi.fn();
    useSubstationWorkingCopy.setState({ stageCableCreate } as never);

    // OFD 드롭 흐름: containerAssetId = OFD equipment id, slotId/coreNumber 는 extras 채널.
    // CableSpecModal 은 sourceAssetId = sourceSlotId ?? ... 로 슬롯을 endpoint 로 해소.
    const ix = useInteractionStore.getState();
    ix.cableSetSource('eq-1', { x: 0, y: 0 }, {});
    // cableSetTarget: containerAssetId = OFD id(ofd-1), slotId = 'slot-1', coreNumber = 3.
    ix.cableSetTarget('ofd-1', { x: 10, y: 10 }, { slotId: 'slot-1', coreNumber: 3 });

    render(<CableSpecModalWrapper />);

    // conduit 끝점이라도 distributor UI(입력/출력)는 뜨지 않아야 한다.
    expect(screen.queryByText('입력')).toBeNull();
    expect(screen.queryByText('출력')).toBeNull();

    // 카테고리 선택 → 확인.
    fireEvent.click(screen.getByText('전력'));
    fireEvent.click(screen.getByText('확인'));

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

    // 신모델: fiberPathId / fiberPortNumber 는 null.
    expect(arg.fiberPathId).toBeNull();
    expect(arg.fiberPortNumber).toBeNull();
  });
});

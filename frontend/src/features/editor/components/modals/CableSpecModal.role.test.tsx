import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// 전원계통 방향성 — distributor(피더/충전기/UPS) 끝점으로 케이블을 그리면 그 끝에
// IN/OUT(입력/출력) 지정 UI 가 뜨고, 선택한 role 이 stageCableCreate 에 실린다.

// 카테고리(전원) 만 모킹.
vi.mock('../../../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({
    data: [{ id: 'cat-pw', code: 'PW', name: '전력', displayColor: '#ef4444', displayGroup: null, isActive: true }],
  }),
}));

// 끝점 자산의 connectionKind 를 알아내기 위해 effective assets 를 모킹.
// target(panel-1) 이 distributor, source(rack-1) 는 일반 설비.
vi.mock('../../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => [
    { id: 'rack-1', assetType: { connectionKind: null } },
    { id: 'panel-1', assetType: { connectionKind: 'distributor' } },
  ],
}));

import { CableSpecModalWrapper } from './CableSpecModal';
import { useInteractionStore } from '../../stores/interactionStore';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';

describe('CableSpecModal — distributor 끝점 IN/OUT 지정', () => {
  beforeEach(() => {
    useInteractionStore.getState().cancel();
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

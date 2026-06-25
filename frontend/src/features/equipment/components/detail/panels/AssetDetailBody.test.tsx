import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// SSOT — 모든 진입점(평면도 더블클릭·현황·대장)이 공유하는 단일 상세 본문.
// kind='rack' 이면 인스펙터 + 랙 공간 섹션(PresetActionsBar/RackView)을 함께 렌더하는지,
// 편집이 통합 WC(stageAssetUpdate)로 staging 되는지 검증.

const stageAssetUpdate = vi.fn();

const asset = {
  id: 'e1', substationId: 's1', assetTypeId: 't1',
  assetType: { name: '랙', role: 'rack', fieldTemplate: [] },
  name: '랙01', installDate: null, manager: null, status: '운영중',
  description: '메모', warrantyUntil: null, replaceDue: null, floorId: 'f1', updatedAt: '',
} as never;

vi.mock('../../../../assets/hooks/useAsset', () => ({ useAsset: () => ({ data: undefined, isLoading: false }) }));
vi.mock('../../../../workspace/SelectionContext', () => ({ useSelection: () => ({ setSelectedAssetId: vi.fn() }) }));
vi.mock('../../../../workingCopy/substationStore', async (importOriginal) => ({
  // assetDescriptor 등 실제 export(useEffectiveAssets 가 사용)를 유지하면서
  // 훅만 선택자 스텁으로 대체. AssetInspector 가 useEffectiveAssets(상위 랙
  // breadcrumb 해석)로 saved/overlays 를 읽으므로 빈 컬렉션을 함께 제공한다.
  ...(await importOriginal<Record<string, unknown>>()),
  useSubstationWorkingCopy: (sel: (s: unknown) => unknown) =>
    sel({
      stageAssetUpdate,
      stageCableUpdate: vi.fn(),
      stageCableDelete: vi.fn(),
      // 연결 탭이 effective cables 를 읽으므로 모든 컬렉션 빈 상태로 제공.
      saved: { assets: [], cables: [] },
      overlays: {
        assets: { creates: {}, updates: {}, deletes: [] },
        cables: { creates: {}, updates: {}, deletes: [] },
      },
    }),
}));

// 랙 공간 섹션의 무거운 자식들은 가벼운 마커로 대체 — 본문이 공간 섹션을 끼워 넣는지만 검증.
vi.mock('../../../../rack/components/PresetActionsBar', () => ({ PresetActionsBar: () => <div>프리셋바</div> }));
vi.mock('../../../../editor/components/RackView', () => ({ RackView: () => <div>랙뷰그리드</div> }));

import { AssetDetailBody } from './AssetDetailBody';

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('AssetDetailBody — SSOT 단일 상세 본문', () => {
  it('RACK: 인스펙터(종류/상태/설명) + 랙 공간 섹션(프리셋바·랙뷰)을 함께 렌더', () => {
    wrap(<AssetDetailBody equipmentId="e1" kind="rack" asset={asset} />);
    // 인스펙터 필드
    expect(screen.getByText('종류')).toBeTruthy();
    expect(screen.getByText('상태')).toBeTruthy();
    expect(screen.getByText('설명')).toBeTruthy();
    // 공간 섹션 — 평면도와 동일한 랙 모듈 GUI
    expect(screen.getByText('내부 설비')).toBeTruthy();
    expect(screen.getByText('프리셋바')).toBeTruthy();
    expect(screen.getByText('랙뷰그리드')).toBeTruthy();
  });

  it('편집(이름) → stageAssetUpdate(통합 WC)', () => {
    stageAssetUpdate.mockClear();
    wrap(<AssetDetailBody equipmentId="e1" kind="rack" asset={asset} />);
    // 연필-인라인(#6): 평소 plain text → 연필 클릭 시 인풋 전환.
    fireEvent.click(screen.getByTitle('이름 수정'));
    const nameInput = screen.getByDisplayValue('랙01') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '랙02' } });
    fireEvent.blur(nameInput);
    expect(stageAssetUpdate).toHaveBeenCalledWith('e1', { name: '랙02' });
  });

  it('grounding: 공간 섹션 없음 — 인스펙터만', () => {
    wrap(<AssetDetailBody equipmentId="e1" kind="grounding" asset={asset} />);
    expect(screen.getByText('종류')).toBeTruthy();
    expect(screen.queryByText('내부 설비')).toBeNull();
  });

  it('랙 모듈(주입 asset + kind=null): 모듈 필드 + 공간 섹션(내부 설비) 없음', () => {
    const moduleAsset = {
      id: 'mod1', substationId: 's1', assetTypeId: 'cat1',
      assetType: { name: '광패치', role: 'device', fieldTemplate: [] },
      name: '모듈1', parentAssetId: 'e1', slotIndex: 0, slotSpan: 1,
 installDate: null, manager: null, status: '운영중',
      description: '', warrantyUntil: null, replaceDue: null, floorId: null, updatedAt: '',
    } as never;
    // 모듈은 leaf → kind=null. injected asset 으로 페치 없이 렌더.
    wrap(<AssetDetailBody equipmentId="mod1" kind={null} asset={moduleAsset} />);
    // 모듈 전용 RO 필드
    expect(screen.getByText('카테고리')).toBeTruthy();
    expect(screen.getByText('슬롯 위치')).toBeTruthy();
    // leaf — 내부설비/프리셋/랙뷰 공간 섹션 없음
    expect(screen.queryByText('내부 설비')).toBeNull();
    expect(screen.queryByText('프리셋바')).toBeNull();
    expect(screen.queryByText('랙뷰그리드')).toBeNull();
  });
});

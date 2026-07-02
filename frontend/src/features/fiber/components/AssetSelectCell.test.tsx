import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// ── 픽스처 ──────────────────────────────────────────────────────────────────
const SLOT = 'slotA';
const TWIN = 'slotB';
const SLOT_ASSET = { id: SLOT, name: '슬롯', parentAssetId: 'ofdA', substationId: 's1', assetType: { role: 'slot' } };
const opgw = { id: 'opgw', sourceAssetId: SLOT, targetAssetId: TWIN, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };
// 자국 OUT 패치(코어3): 설비 eqpL ── 슬롯 SLOT
const localOut3 = { id: 'c-l3', sourceAssetId: 'eqpL', targetAssetId: SLOT, sourceRole: null, targetRole: 'OUT', number: 3 };
// 대국 OUT 패치(코어3): 설비 eqpR ── 대국슬롯 TWIN
const remoteOut3 = { id: 'c-r3', sourceAssetId: 'eqpR', targetAssetId: TWIN, sourceRole: null, targetRole: 'OUT', number: 3 };

const A = (id: string, name: string, sub: string, parent: string | null, role: string | null = null) =>
  ({ id, name, substationId: sub, parentAssetId: parent, slotIndex: null, assetType: { role } });
const SLIM = [
  A('eqpL', '자국장비', 's1', null, 'device'),
  A('eqpR', '대국장비', 's2', null, 'device'),
  A(TWIN, '북춘천슬롯', 's2', 'ofdB', 'slot'),
  A('ofdA', 'OFD', 's1', null, 'ofd'),
];
const NAMES = new Map([['s1', '춘천'], ['s2', '북춘천']]);

const {
  mockPut, mockRemove, mockPatch, mockGetState,
  mockUseSearchAssets, mockUseAssetRefs, mockUseCableCategories, mockGenerateTempId, mockTouch,
} = vi.hoisted(() => ({
  mockPut: vi.fn(), mockRemove: vi.fn(), mockPatch: vi.fn(),
  mockGetState: vi.fn(),
  mockUseSearchAssets: vi.fn(),
  mockUseAssetRefs: vi.fn(),
  mockUseCableCategories: vi.fn(),
  mockGenerateTempId: vi.fn(),
  mockTouch: vi.fn(),
}));

vi.mock('../../trace/traceGraph', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../trace/traceGraph')>();
  return {
    ...orig,
    useTraceGraph: () => ({
      graph: orig.buildTraceGraph({ assets: SLIM as never[], cables: [opgw, localOut3, remoteOut3] as never[], substationNames: NAMES }),
      isLoading: false,
    }),
  };
});
vi.mock('../../assets/useSearchAssets', () => ({ useSearchAssets: mockUseSearchAssets }));
vi.mock('../../assets/useAssetRefs', () => ({ useAssetRefs: mockUseAssetRefs }));
vi.mock('../../cables/hooks/useCableCategories', () => ({ useCableCategories: mockUseCableCategories }));
vi.mock('../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: Object.assign(vi.fn(), { getState: mockGetState }),
}));
vi.mock('../../../utils/idHelpers', () => ({ generateTempId: mockGenerateTempId }));
// coreMeta.touchCoreInspect 은 별도 스토어 상호작용 → 여기선 no-op 로 격리(피커 동작만 검증).
vi.mock('../coreMeta', () => ({ touchCoreInspect: mockTouch, opgwIdOfSlot: () => 'opgw' }));

import { AssetSelectCell } from './AssetSelectCell';

function wrap(ui: ReactNode) { return render(<>{ui}</>); }
/** EditableField 읽기모드 → ✎ 클릭으로 편집(select) 진입 후 combobox 반환. */
function openSelect(ariaLabel: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: /수정/ }));
  return screen.getByRole('combobox', { name: ariaLabel });
}

beforeEach(() => {
  mockUseSearchAssets.mockReturnValue({ results: [], isLoading: false });
  mockUseAssetRefs.mockReturnValue(new Map());
  mockUseCableCategories.mockReturnValue({ data: [{ id: 'cat1', code: 'CBL-OPJ', name: '광점퍼코드' }] });
  mockGetState.mockReturnValue({ put: mockPut, remove: mockRemove, patch: mockPatch });
  mockGenerateTempId.mockReturnValue('tmp-new');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

// ── 표시(읽기 모드) ──────────────────────────────────────────────────────────
describe('AssetSelectCell — 표시', () => {
  it('자국 점유 코어 → 연결 설비명 표시', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="local" />);
    expect(screen.getByText('자국장비')).toBeInTheDocument();
  });
  it('빈 코어 → 대시(—)', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="local" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
  it('endpoint 가드: 대국 셀은 대국 설비(자국 아님)', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="remote" />);
    expect(screen.getByText('대국장비')).toBeInTheDocument();
    expect(screen.queryByText('자국장비')).toBeNull();
  });
});

// ── 자국 피커(선택 가능) ─────────────────────────────────────────────────────
describe('AssetSelectCell — 자국 피커', () => {
  beforeEach(() => {
    mockUseSearchAssets.mockReturnValue({ results: [{ id: 'devL2', name: '자국단말2', substationId: 's1', substationName: '춘천' }], isLoading: false });
  });
  it('자국도 편집 가능 — 빈 코어 선택 → 신규 자국 OUT 패치(slotId=자국슬롯)', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="local" />);
    fireEvent.change(openSelect(/자국설비/), { target: { value: 'devL2' } });
    expect(mockPut).toHaveBeenCalledWith('cables', expect.objectContaining({
      id: 'tmp-new', sourceAssetId: SLOT, targetAssetId: 'devL2', sourceRole: 'OUT', number: 5,
    }));
  });
});

// ── 대국 피커 ────────────────────────────────────────────────────────────────
describe('AssetSelectCell — 대국 피커', () => {
  const SEARCH = [{ id: 'dev2', name: '단말2', substationId: 's2', substationName: '북춘천' }];
  const TWIN_REF = new Map([['slotB', { id: 'slotB', name: '북춘천슬롯', substationId: 's2', substationName: '북춘천' }]]);
  beforeEach(() => {
    mockUseSearchAssets.mockReturnValue({ results: SEARCH, isLoading: false });
    mockUseAssetRefs.mockReturnValue(TWIN_REF);
  });

  it('빈 코어 선택 → 신규 대국 OUT 패치(slotId=대국슬롯)', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="remote" />);
    fireEvent.change(openSelect(/대국설비/), { target: { value: 'dev2' } });
    expect(mockPut).toHaveBeenCalledWith('cables', expect.objectContaining({
      id: 'tmp-new', sourceAssetId: TWIN, targetAssetId: 'dev2', sourceRole: 'OUT', number: 5,
    }));
  });

  it('기존 연결 변경 → 케이블 endpoint patch(제거·재생성 아님)', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="remote" />);
    fireEvent.change(openSelect(/대국설비/), { target: { value: 'dev2' } });
    // remoteOut3: source=eqpR(설비), target=TWIN(슬롯) → 설비 끝점=source 교체
    expect(mockPatch).toHaveBeenCalledWith('cables', 'c-r3', { sourceAssetId: 'dev2' });
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('기존 연결 해제(빈 값) + confirm → remove', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="remote" />);
    fireEvent.change(openSelect(/대국설비/), { target: { value: '' } });
    expect(window.confirm).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith('cables', 'c-r3');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('해제 confirm 취소 → remove 안 함', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="remote" />);
    fireEvent.change(openSelect(/대국설비/), { target: { value: '' } });
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

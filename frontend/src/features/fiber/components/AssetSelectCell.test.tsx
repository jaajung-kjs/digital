import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// ── 테스트 픽스처 ──────────────────────────────────────────────────────────────
const SLOT = 'slotA';
const TWIN = 'slotB';
const SLOT_ASSET = { id: SLOT, name: '슬롯', parentAssetId: 'ofdA', substationId: 's1', assetType: { role: 'slot' } };
const opgw = { id: 'opgw', sourceAssetId: SLOT, targetAssetId: TWIN, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };
const localOut3 = { id: 'c-l3', sourceAssetId: 'eqpL', targetAssetId: SLOT, sourceRole: null, targetRole: 'OUT', number: 3 };
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

// ── vi.hoisted — 새 훅 모의 함수(호이스팅 전 선언 필요) ─────────────────────
const {
  mockPut, mockRemove, mockGetState,
  mockUseSearchAssets, mockUseAssetRefs, mockUseCableCategories, mockGenerateTempId,
} = vi.hoisted(() => {
  const mockPut = vi.fn();
  const mockRemove = vi.fn();
  const mockGetState = vi.fn(() => ({ put: mockPut, remove: mockRemove }));
  const mockUseSearchAssets = vi.fn(() => ({ results: [], isLoading: false }));
  const mockUseAssetRefs = vi.fn(
    () => new Map<string, { id: string; name: string; substationId: string | null; substationName: string | null }>(),
  );
  const mockUseCableCategories = vi.fn(() => ({
    data: [{ id: 'cat1', name: '광점퍼코드', groupId: null, groupName: '광', groupColor: null, sortOrder: 7 }],
  }));
  const mockGenerateTempId = vi.fn(() => 'tmp-new');
  return { mockPut, mockRemove, mockGetState, mockUseSearchAssets, mockUseAssetRefs, mockUseCableCategories, mockGenerateTempId };
});

// ── vi.mock ────────────────────────────────────────────────────────────────────
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

vi.mock('../../assets/useSearchAssets', () => ({
  useSearchAssets: mockUseSearchAssets,
}));

vi.mock('../../assets/useAssetRefs', () => ({
  useAssetRefs: mockUseAssetRefs,
}));

vi.mock('../../cables/hooks/useCableCategories', () => ({
  useCableCategories: mockUseCableCategories,
}));

vi.mock('../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: Object.assign(vi.fn(), { getState: mockGetState }),
}));

vi.mock('../../../utils/idHelpers', () => ({
  generateTempId: mockGenerateTempId,
}));

import { AssetSelectCell } from './AssetSelectCell';

function wrap(ui: ReactNode) { return render(<>{ui}</>); }

// ── 기본 mock 구현 재적용 (mockReset:true 로 인해 beforeEach 에서 재설정 필요) ──
beforeEach(() => {
  mockUseSearchAssets.mockReturnValue({ results: [], isLoading: false });
  mockUseAssetRefs.mockReturnValue(new Map());
  mockUseCableCategories.mockReturnValue({
    data: [{ id: 'cat1', name: '광점퍼코드', groupId: null, groupName: '광', groupColor: null, sortOrder: 7 }],
  });
  mockGetState.mockReturnValue({ put: mockPut, remove: mockRemove });
  mockGenerateTempId.mockReturnValue('tmp-new');
});

// ── 기존 읽기전용 테스트 (자국 표시 + 대국 표시 확인) ─────────────────────────
describe('AssetSelectCell (읽기전용 자국)', () => {
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

// ── 신규: 대국 설비 검색-피커 + 패치 케이블 쓰기 ─────────────────────────────
describe('AssetSelectCell (대국 설비 피커)', () => {
  const SEARCH_RESULTS = [
    { id: 'dev2', name: '단말2', substationId: 's2', substationName: '북춘천' },
  ];
  const TWIN_REF = new Map([
    ['slotB', { id: 'slotB', name: '북춘천슬롯', substationId: 's2', substationName: '북춘천' }],
  ]);

  beforeEach(() => {
    // 상위 beforeEach 이후 재적용 — 피커 전용 값으로 오버라이드
    mockUseSearchAssets.mockReturnValue({ results: SEARCH_RESULTS, isLoading: false });
    mockUseAssetRefs.mockReturnValue(TWIN_REF);
  });

  it('대국 설비 후보 option 표시 (빈 코어)', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="remote" />);
    expect(screen.getByRole('option', { name: /단말2/ })).toBeInTheDocument();
  });

  it('대국 설비 선택 → 기존 패치 제거 + 신규 대국 OUT 패치 staged', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="remote" />);
    const select = screen.getByRole('combobox', { name: /대국설비 코어 3/ });
    fireEvent.change(select, { target: { value: 'dev2' } });
    // 기존 대국 패치 케이블 제거
    expect(mockRemove).toHaveBeenCalledWith('cables', 'c-r3');
    // 신규 대국 OUT 패치 staged — slotId=대국슬롯, assetId=선택 설비
    expect(mockPut).toHaveBeenCalledWith('cables', expect.objectContaining({
      id: 'tmp-new',
      sourceAssetId: TWIN,   // 대국 슬롯 = OUT source
      targetAssetId: 'dev2', // 선택된 대국 설비
      sourceRole: 'OUT',
      number: 3,
    }));
  });

  it('빈 코어(연결 없음) → 선택 취소 시 아무것도 호출 안 함', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="remote" />);
    const select = screen.getByRole('combobox', { name: /대국설비 코어 5/ });
    fireEvent.change(select, { target: { value: '' } });
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('기존 연결 해제(빈 값 선택) → remove만, put 없음', () => {
    wrap(<AssetSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="remote" />);
    const select = screen.getByRole('combobox', { name: /대국설비 코어 3/ });
    fireEvent.change(select, { target: { value: '' } });
    expect(mockRemove).toHaveBeenCalledWith('cables', 'c-r3');
    expect(mockPut).not.toHaveBeenCalled();
  });
});

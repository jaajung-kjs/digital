import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { setSelectedAssetId, setSelected, patch, effectiveCables } = vi.hoisted(() => ({
  setSelectedAssetId: vi.fn(),
  setSelected: vi.fn(),
  patch: vi.fn(),
  effectiveCables: vi.fn(() => [] as unknown[]),
}));

// 슬롯(role=slot) 자식이 있는 OFD 자산 + 슬롯 자산 + 빈 케이블 목록 기본 세팅.
const SLOT_ASSET = {
  id: 'slot1',
  name: '슬롯A',
  parentAssetId: 'ofd1',
  substationId: 's1',
  assetType: { role: 'slot' },
};
const OFD_ASSET = {
  id: 'ofd1',
  name: '원주OFD',
  substationId: 's1',
  assetType: { role: 'ofd' },
  parentAssetId: null,
};

// OPGW(IN-IN): 자국 slot1 ↔ 대국 twin 슬롯. twinSlotIdOf·fiberSlotLabel(#코어수) 근거.
const OPGW = {
  id: 'opgw1', sourceAssetId: 'slot1', targetAssetId: 'twin1',
  sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 },
};
// 코어2 자국측 OUT 케이블 — EquipmentSelectCell 가 연결 설비(a-near)를 표시.
const OUT2 = {
  id: 'c2', sourceAssetId: 'a-near', targetAssetId: 'slot1',
  sourceRole: null, targetRole: 'OUT', number: 2,
};
const FIBER_CABLES = [OPGW, OUT2];

// EquipmentSelectCell 는 useTraceGraph 그래프(effective)에서 후보·이름을 읽는다.
const SLIM = [
  { id: 'a-near', name: '송변전광단말', role: 'device', substationId: 's1', parentAssetId: null },
  { id: 'twin1', name: '홍천슬롯', role: 'slot', substationId: 's2', parentAssetId: 'ofd2' },
];
const CATS = [{ id: 'cat-opj', name: '광점퍼코드' }];

// EquipmentSelectCell + ConnectionRegisterGrid 는 이제 graph.cables(전역 SSOT)에서 읽는다.
vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => [OFD_ASSET, SLOT_ASSET],
}));
vi.mock('../../cables/hooks/useCableCategories', () => ({ useCableCategories: () => ({ data: CATS }) }));
vi.mock('../../trace/traceGraph', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../trace/traceGraph')>()), // 실제 equipmentInSubstation 등 유지
  useTraceGraph: () => ({
    graph: {
      nameById: new Map([['a-near', '송변전광단말'], ['twin1', '홍천슬롯']]),
      subNameById: new Map([['ofd1', '원주'], ['slot1', '원주']]),
      subById: new Map([['slot1', 's1'], ['twin1', 's2']]),
      parentById: new Map([['slot1', 'ofd1']]),
      assets: [],
      cables: FIBER_CABLES,
    },
    isLoading: false,
  }),
  remoteSlotSubstation: (_slotId: string, _graph: unknown) => '홍천',
}));
vi.mock('../slotRegister', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../slotRegister')>()),
  buildSlotCoreRows: (_slot: unknown, _cables: unknown, _graph: unknown) => [
    {
      coreNumber: 1, opgwId: 'opgw1', occupied: false,
      nearAssetId: null, farName: null,
      loss1310: null, dist1310: null, loss1550: null, dist1550: null, inspectDate: null,
    },
    {
      coreNumber: 2, opgwId: 'opgw1', occupied: true,
      nearAssetId: 'a-near', farName: '홍천단말',
      loss1310: null, dist1310: null, loss1550: null, dist1550: null, inspectDate: null,
    },
  ],
}));
vi.mock('../../workspace/selectionStore', () => {
  const st = { selectedAssetId: null, selectedCore: null, setSelectedAssetId, setSelected };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSelectionStore: hook };
});
vi.mock('../../pathTrace/stores/pathHighlightStore', () => {
  const st = { tracingCableId: null };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { usePathHighlightStore: hook };
});
vi.mock('../../workingCopy/substationStore', () => {
  const st = { patch, substationId: 's1', effectiveCables };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});
vi.mock('../../assets/components/StagedAssetDetailPanel', () => ({
  StagedAssetDetailPanel: () => null,
}));

import { FiberRegisterView } from './FiberRegisterView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['assets-slim'], SLIM);
  return render(
    <QueryClientProvider client={qc}>
      <FiberRegisterView substationId="s1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => { setSelectedAssetId.mockClear(); setSelected.mockClear(); patch.mockClear(); effectiveCables.mockReturnValue([]); });

describe('OfdFiberRegister', () => {
  it('섹션 헤더(fiberSlotLabel: 원주 - 홍천 #24)와 자국설비/대국설비 열을 렌더한다', () => {
    renderView();
    // 제목은 fiberSlotLabel 파생: 자국 - 대국 #코어수(OPGW specParams.cores).
    expect(screen.getByText('원주 - 홍천 #24')).toBeInTheDocument();
    // 읽기전용 자산명 열 → EquipmentSelectCell 드롭다운으로 교체.
    expect(screen.getByText('자국설비')).toBeInTheDocument();
    expect(screen.getByText('대국설비')).toBeInTheDocument();
  });

  it('점유 코어 자국설비 셀이 연결 설비명을 읽기전용으로 렌더한다', () => {
    renderView();
    // 코어2 자국측 OUT 케이블(a-near) → 읽기전용 설비명 표시(드롭다운 없음).
    expect(screen.getAllByText('송변전광단말').length).toBeGreaterThan(0);
    expect(screen.queryByTitle('자국설비 수정')).toBeNull();
  });

  it('점유 코어 행 클릭(코어 번호 셀) → onRowClick 으로 슬롯 포트 패널 + 해당 코어 활성화', () => {
    renderView();
    // 자국설비 셀은 이제 드롭다운이므로 행 선택은 비-드롭다운 셀(코어 번호 "2")로 검증.
    // UX#3: 코어 행 클릭 → setSelected(슬롯id, 코어번호) — 슬롯 포트 사이드패널로 이동.
    const coreCells = screen.getAllByText(/^2$/);
    fireEvent.click(coreCells[0]);
    expect(setSelected).toHaveBeenCalledWith('slot1', 2);
  });

  it('빈 코어 행 클릭 → 슬롯 포트 패널 + 빈 코어 활성화(점유 코어와 동일 동작)', () => {
    renderView();
    // UX#3: 빈 코어도 동일 — 슬롯id 로 이동하고 rowCore(코어번호)로 그 포트를 활성화한다.
    const coreCells = screen.getAllByText(/^1$/);
    fireEvent.click(coreCells[0]);
    expect(setSelected).toHaveBeenCalledWith('slot1', 1);
  });

  it('코어 손실1310 ✎ → 입력 → blur → OPGW.coreMeta 에 patch(설비 없는 빈 코어도 편집)', () => {
    effectiveCables.mockReturnValue([{ id: 'opgw1', specParams: { cores: 2 } }]);
    renderView();
    // 코어정보는 OPGW 소유 → 빈 코어(코어1)도 편집 가능. 손실1310 ✎ 가 코어마다 존재.
    const pencils = screen.getAllByRole('button', { name: /손실1310 수정/ });
    expect(pencils.length).toBe(2); // 두 코어 모두 편집 가능
    fireEvent.click(pencils[0]);    // 코어1(빈 코어)
    const input = screen.getByPlaceholderText('—');
    fireEvent.blur(input, { target: { value: '-6.43' } });
    // OPGW(opgw1) 의 coreMeta['1'].loss1310 에 머지 + 속성 변경이므로 점검일(inspectDate) 자동 갱신.
    expect(patch).toHaveBeenCalledWith('cables', 'opgw1', expect.objectContaining({
      specParams: expect.objectContaining({
        coreMeta: { '1': expect.objectContaining({ loss1310: '-6.43', inspectDate: expect.any(String) }) },
      }),
    }));
  });
});

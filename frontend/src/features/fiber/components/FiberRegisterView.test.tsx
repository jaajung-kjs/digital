import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { setSelectedAssetId, setSelected, patch, effectiveCables } = vi.hoisted(() => ({
  setSelectedAssetId: vi.fn(),
  setSelected: vi.fn(),
  patch: vi.fn(),
  effectiveCables: vi.fn(() => [] as unknown[]),
}));

// 슬롯(conduit) 자식이 있는 OFD 자산 + 슬롯 자산 + 빈 케이블 목록 기본 세팅.
const SLOT_ASSET = {
  id: 'slot1',
  name: '슬롯A',
  parentAssetId: 'ofd1',
  substationId: 's1',
  assetType: { connectionKind: 'conduit' },
};
const OFD_ASSET = {
  id: 'ofd1',
  name: '원주OFD',
  substationId: 's1',
  assetType: { placementKind: 'OFD', connectionKind: null },
  parentAssetId: null,
};

// OPGW(IN-IN): 자국 slot1 ↔ 대국 twin 슬롯. twinSlotIdOf·fiberSlotLabel(#코어수) 근거.
const OPGW = {
  id: 'opgw1', cableType: 'FIBER', sourceAssetId: 'slot1', targetAssetId: 'twin1',
  sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 },
};
// 코어2 자국측 OUT 케이블 — EquipmentSelectCell 가 연결 설비(a-near)를 표시.
const OUT2 = {
  id: 'c2', cableType: 'FIBER', sourceAssetId: 'a-near', targetAssetId: 'slot1',
  sourceRole: null, targetRole: 'OUT', number: 2,
};
const FIBER_CABLES = [OPGW, OUT2];

// EquipmentSelectCell 는 useTraceGraph 그래프(effective)에서 후보·이름을 읽는다.
const SLIM = [
  { id: 'a-near', name: '송변전광단말', code: 'EQP', substationId: 's1', parentAssetId: null, connectionKind: null },
  { id: 'twin1', name: '홍천슬롯', code: 'OFD-SLOT', substationId: 's2', parentAssetId: 'ofd2', connectionKind: 'conduit' },
];
const CATS = [{ id: 'cat-opj', code: 'CBL-OPJ', name: '광점퍼코드', displayColor: null }];

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
      codeById: new Map(),
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
      coreNumber: 1, cableId: null, occupied: false,
      nearAssetId: null, farName: null,
      loss1310: null, dist1310: null, loss1550: null, dist1550: null, inspectDate: null,
    },
    {
      coreNumber: 2, cableId: 'c2', occupied: true,
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

  it('점유 코어 자국설비 셀이 EquipmentSelectCell 드롭다운(연결 설비명 표시 + 수정 어포던스)을 렌더한다', () => {
    renderView();
    // 코어2 자국측 OUT 케이블(a-near) → display(읽기모드) + 옵션 라벨에 연결 설비명 표시.
    expect(screen.getAllByText('송변전광단말').length).toBeGreaterThan(0);
    // 자국/대국 모두 수정(✎) 어포던스 노출 — CBL-OPJ 카테고리 존재로 비활성 아님.
    expect(screen.getAllByTitle('자국설비 수정').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('대국설비 수정').length).toBeGreaterThan(0);
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

  it('점유 코어 손실1310 ✎ 클릭 → 입력 → blur → patch(cables, cableId, specParams 머지)', () => {
    effectiveCables.mockReturnValue([{ id: 'c2', specParams: { loss1310: null } }]);
    renderView();
    // 손실1310 ✎ 버튼은 DOM에 존재(opacity만 0) — 코어2(점유, cableId='c2')의 ✎ 버튼.
    // 코어1은 disabled(cableId 없음)이라 ✎ 없음 — 코어2의 ✎ 버튼이 유일.
    const pencilButton = screen.getByRole('button', { name: /손실1310 수정/ });
    fireEvent.click(pencilButton);
    // 편집모드: input 나타남
    const input = screen.getByPlaceholderText('—');
    fireEvent.blur(input, { target: { value: '-6.43' } });
    expect(patch).toHaveBeenCalledWith('cables', 'c2', expect.objectContaining({ specParams: expect.objectContaining({ loss1310: '-6.43' }) }));
  });
});

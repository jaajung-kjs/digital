import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// 분전반 회로 그리드 — 피더-전용 모델. 분전반(DIST)은 FEEDER 자식만 가지며
// (분기/BRANCH 없음), 케이블은 피더 asset 으로 직접 연결된다. 읽기는 통합 스토어
// effective assets, 쓰기는 stageAsset* staging. (seeded panel→F1/F2 형태)

const { stageAssetCreate, stageAssetDelete, setSelectedAssetId } = vi.hoisted(() => ({
  stageAssetCreate: vi.fn(),
  stageAssetDelete: vi.fn(),
  setSelectedAssetId: vi.fn(),
}));

const PANEL = 'panel-1';
function asset(p: { id: string; code: string; name: string; parent?: string | null; sort?: number; floorId?: string | null }) {
  return {
    id: p.id, substationId: 's1', assetTypeId: p.code,
    assetType: { id: p.code, code: p.code, name: p.code, group: null, displayColor: null, fieldTemplate: [], placementKind: p.code === 'DIST' ? 'DIST' : null },
    name: p.name, parentAssetId: p.parent ?? null, floorId: p.floorId ?? null, roomText: null, attributes: {},
    installDate: null, warrantyUntil: null, replaceDue: null, manager: null, description: null, status: null,
    sortOrder: p.sort ?? 0, updatedAt: '',
  };
}

const assets = [
  asset({ id: PANEL, code: 'DIST', name: '분전반', floorId: 'f1' }),
  asset({ id: 'F1', code: 'FEEDER', name: '테스트피더', parent: PANEL, sort: 0 }),
  asset({ id: 'F2', code: 'FEEDER', name: '두번째피더', parent: PANEL, sort: 1 }),
];
// 통신랙 → F1 케이블 (endpoint = feeder asset id) → F1 칸이 "연결됨".
const cables = [{ id: 'cab1', sourceAssetId: 'rack-1', targetAssetId: 'F1', source: {}, target: {} }];

const storeState = { stageAssetCreate, stageAssetDelete };
vi.mock('../../../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: (sel: (s: unknown) => unknown) => sel(storeState),
}));
vi.mock('../../../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => assets,
  useEffectiveCables: () => cables,
}));
vi.mock('../../../../assets/hooks/useAssetTypes', () => ({
  useAssetTypes: () => ({ data: [
    { id: 'ft', code: 'FEEDER', name: '피더', group: null, displayColor: null, fieldTemplate: null, placementKind: null },
  ] }),
}));
vi.mock('../../../../workspace/selectionStore', () => {
  const st = { selectedAssetId: null, setSelectedAssetId };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSelectionStore: hook };
});
vi.mock('../../../../../utils/idHelpers', () => ({ generateTempId: () => 'tmp-new' }));
// CB 미리보기 — 전역 graph.cables 로 피더 회로 파생. 여기선 회로 없음(빈 그래프)
// 이어도 카드가 렌더되면 충분하다. useQuery 의존(QueryClientProvider)을 피하려
// 훅을 모킹한다.
vi.mock('../../../../trace/traceGraph', () => ({
  useTraceGraph: () => ({ graph: { cables: [], nameById: new Map() }, isLoading: false }),
}));

import { DistributionCircuits } from './DistributionPanel';

describe('DistributionCircuits — FEEDER asset 그리드 (피더-전용)', () => {
  beforeEach(() => { stageAssetCreate.mockClear(); stageAssetDelete.mockClear(); setSelectedAssetId.mockClear(); });

  it('그리드가 분전반의 FEEDER 자식을 나열한다 (F1/F2)', () => {
    render(<DistributionCircuits equipmentId={PANEL} />);
    expect(screen.getByText('테스트피더')).toBeInTheDocument();
    expect(screen.getByText('두번째피더')).toBeInTheDocument();
  });

  it('연결된 피더(F1) 칸은 "연결됨" 타이틀 — 케이블 endpoint = feeder asset id', () => {
    render(<DistributionCircuits equipmentId={PANEL} />);
    expect(screen.getByText('테스트피더').closest('button')?.getAttribute('title')).toMatch(/연결됨/);
    expect(screen.getByText('두번째피더').closest('button')?.getAttribute('title')).toMatch(/미연결/);
  });

  it('피더 칸 클릭 → setSelectedAssetId(feeder id)', () => {
    render(<DistributionCircuits equipmentId={PANEL} />);
    fireEvent.click(screen.getByText('테스트피더'));
    expect(setSelectedAssetId).toHaveBeenCalledWith('F1');
  });

  it('＋ 전원 계통(새 이름) → FEEDER asset 하나만 stageAssetCreate (분기 없음)', () => {
    render(<DistributionCircuits equipmentId={PANEL} />);
    fireEvent.click(screen.getByText('＋ 전원 계통'));
    const input = screen.getByPlaceholderText(/DC 48V Main/);
    fireEvent.change(input, { target: { value: '신규계통' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(stageAssetCreate).toHaveBeenCalledTimes(1);
    expect(stageAssetCreate.mock.calls[0][0]).toMatchObject({ name: '신규계통', assetTypeId: 'ft', parentAssetId: PANEL });
  });

  it('계통 삭제 → 해당 FEEDER asset 만 stageAssetDelete (하위 cascade)', () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DistributionCircuits equipmentId={PANEL} />);
    fireEvent.click(screen.getAllByLabelText('계통 삭제')[0]);
    expect(stageAssetDelete).toHaveBeenCalledWith('F1');
    expect(stageAssetDelete).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

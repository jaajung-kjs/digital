import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// 단계3b — 분전반 회로 그리드가 distribution_circuits 가 아니라 FEEDER/BRANCH
// asset 을 읽고, CRUD 를 stageAsset* 로 staging 하는지 검증한다.
// (seeded panel→F1(테스트피더)→B1/B2 형태)

const stageAssetCreate = vi.fn();
const stageAssetDelete = vi.fn();
const startCircuitTrace = vi.fn();

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
  asset({ id: 'B1', code: 'BRANCH', name: 'L1', parent: 'F1', sort: 0 }),
  asset({ id: 'B2', code: 'BRANCH', name: 'L2', parent: 'F1', sort: 1 }),
];
// 통신랙 → B1 케이블 (endpoint = branch asset id) → B1 칸이 "연결됨".
const cables = [{ id: 'cab1', sourceAssetId: 'rack-1', targetAssetId: 'B1', source: {}, target: {} }];

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
    { id: 'bt', code: 'BRANCH', name: '분기', group: null, displayColor: null, fieldTemplate: null, placementKind: null },
  ] }),
}));
vi.mock('../../../../pathTrace/stores/pathHighlightStore', () => ({
  usePathHighlightStore: (sel: (s: unknown) => unknown) => sel({ startCircuitTrace }),
}));
vi.mock('../../../../../utils/idHelpers', () => ({ generateTempId: () => 'tmp-new' }));

import { DistributionCircuits } from './DistributionPanel';

describe('DistributionCircuits — FEEDER/BRANCH asset 그리드', () => {
  beforeEach(() => { stageAssetCreate.mockClear(); stageAssetDelete.mockClear(); startCircuitTrace.mockClear(); });

  it('그리드가 분전반의 FEEDER + 그 BRANCH asset 을 나열한다 (F1 → L1/L2)', () => {
    render(<DistributionCircuits equipmentId={PANEL} />);
    expect(screen.getByText('테스트피더')).toBeInTheDocument();
    expect(screen.getByText('L1')).toBeInTheDocument();
    expect(screen.getByText('L2')).toBeInTheDocument();
  });

  it('연결된 분기(B1) 칸은 "연결됨" 타이틀 — 케이블 endpoint = branch asset id', () => {
    render(<DistributionCircuits equipmentId={PANEL} />);
    expect(screen.getByText('L1').getAttribute('title')).toMatch(/연결됨/);
    expect(screen.getByText('L2').getAttribute('title')).toMatch(/미연결/);
  });

  it('＋ 분기 → BRANCH asset 을 stageAssetCreate (parentAssetId=피더, name=다음 L)', () => {
    render(<DistributionCircuits equipmentId={PANEL} />);
    fireEvent.click(screen.getByText('＋ 분기'));
    expect(stageAssetCreate).toHaveBeenCalledTimes(1);
    expect(stageAssetCreate.mock.calls[0][0]).toMatchObject({
      parentAssetId: 'F1', name: 'L3', assetTypeId: 'bt',
    });
  });

  it('분기 삭제 → stageAssetDelete(branch id)', () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DistributionCircuits equipmentId={PANEL} />);
    // L2 칸의 삭제 버튼 (분기 삭제 aria-label 두 개 중 두번째)
    const delButtons = screen.getAllByLabelText('분기 삭제');
    fireEvent.click(delButtons[1]);
    expect(stageAssetDelete).toHaveBeenCalledWith('B2');
    spy.mockRestore();
  });

  it('계통 삭제 → FEEDER asset 만 stageAssetDelete (하위 cascade)', () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DistributionCircuits equipmentId={PANEL} />);
    fireEvent.click(screen.getByLabelText('계통 삭제'));
    expect(stageAssetDelete).toHaveBeenCalledWith('F1');
    expect(stageAssetDelete).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('＋ 전원 계통(새 이름) → FEEDER + L1 BRANCH 둘 다 stageAssetCreate', () => {
    render(<DistributionCircuits equipmentId={PANEL} />);
    fireEvent.click(screen.getByText('＋ 전원 계통'));
    const input = screen.getByPlaceholderText(/DC 48V Main/);
    fireEvent.change(input, { target: { value: '신규계통' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(stageAssetCreate).toHaveBeenCalledTimes(2);
    expect(stageAssetCreate.mock.calls[0][0]).toMatchObject({ name: '신규계통', assetTypeId: 'ft', parentAssetId: PANEL });
    expect(stageAssetCreate.mock.calls[1][0]).toMatchObject({ name: 'L1', assetTypeId: 'bt' });
  });
});

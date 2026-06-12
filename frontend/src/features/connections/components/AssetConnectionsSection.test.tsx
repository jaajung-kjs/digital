import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// 연결 탭 = 읽기전용 경로중심 뷰. 종류별로 묶어 "상대명 → … → root명" 경로를 보여주고,
// 클릭 → 통합 trace store(startTrace), 활성 항목 재클릭 → clearHighlight, 외부 구간 있으면
// [상세] → openTopology. 인라인 편집(유형/라벨/삭제) UI 는 제거됐다.

const startTrace = vi.fn();
const clearHighlight = vi.fn();
const openTopology = vi.fn();

// asset 헬퍼 — floorAnchor 가 동작하도록 배치(좌표/크기/floorId) 자산을 만든다.
function asset(p: { id: string; name: string; kind?: string | null; floorId?: string | null }) {
  return {
    id: p.id, substationId: 's1', assetTypeId: 't',
    assetType: { id: 't', code: 't', name: p.kind ?? 't', group: null, displayColor: null, fieldTemplate: [], placementKind: p.kind ?? null },
    name: p.name, parentAssetId: null, floorId: p.floorId ?? null, roomText: null, attributes: {},
    positionX: 0, positionY: 0, width2d: 10, height2d: 10,
    installDate: null, warrantyUntil: null, replaceDue: null, manager: null, description: null, status: null,
    sortOrder: 0, updatedAt: '',
  };
}

// A(현재 자산, f1) — FIBER 케이블 → B(중계, f1) → OFD(root). + LAN 케이블 A→C.
const assets = [
  asset({ id: 'A', name: '장비A', floorId: 'f1' }),
  asset({ id: 'B', name: '장비B', floorId: 'f1' }),
  asset({ id: 'OFD1', name: '광단자함', kind: 'OFD', floorId: 'f2' }), // 다른 층 → 외부
  asset({ id: 'C', name: '장비C', floorId: 'f1' }),
];
const cables = [
  { id: 'fA', sourceAssetId: 'A', targetAssetId: 'B', cableType: 'FIBER' },
  { id: 'fB', sourceAssetId: 'B', targetAssetId: 'OFD1', cableType: 'FIBER' },
  { id: 'fA2', sourceAssetId: 'A', targetAssetId: 'OFD1', cableType: 'FIBER' }, // A→OFD 직결(다른 포트) — fA 와 같은 도착
  { id: 'lan', sourceAssetId: 'A', targetAssetId: 'C', cableType: 'LAN' },
];

let storeState: Record<string, unknown> = {};
function mockStore(over: Record<string, unknown> = {}) {
  storeState = {
    tracingCableId: null,
    highlightedNodeIds: new Set<string>(),
    active: false,
    startTrace, clearHighlight, openTopology,
    ...over,
  };
}

vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => assets,
  useEffectiveCables: () => cables,
}));
vi.mock('../../pathTrace/stores/pathHighlightStore', () => {
  const hook = (sel: (s: unknown) => unknown) => sel(storeState);
  (hook as unknown as { getState: () => unknown }).getState = () => storeState;
  return { usePathHighlightStore: hook };
});

import { AssetConnectionsSection } from './AssetConnectionsSection';
import { tracePathToRoot } from '../tracePathToRoot';

const conns = [
  { id: 'fA', source: { assetId: 'A', name: '장비A' }, target: { assetId: 'B', name: '장비B' }, cableType: 'FIBER', label: null, totalLength: 540 },
  { id: 'lan', source: { assetId: 'A', name: '장비A' }, target: { assetId: 'C', name: '장비C' }, cableType: 'LAN', label: null, totalLength: 200 },
] as any;

beforeEach(() => { startTrace.mockClear(); clearHighlight.mockClear(); openTopology.mockClear(); mockStore(); });

describe('tracePathToRoot', () => {
  it('FIBER 경로를 OFD(root)까지 추적 — A→B→OFD, root=OFD', () => {
    const r = tracePathToRoot('A', 'fA', cables, assets);
    expect(r.chain.map((n) => n.assetId)).toEqual(['B', 'OFD1']);
    expect(r.root).toEqual({ assetId: 'OFD1', name: '광단자함', kind: 'OFD' });
  });
  it('LAN 은 root 없이 자연 끝까지 — A→C, root=null', () => {
    const r = tracePathToRoot('A', 'lan', cables, assets);
    expect(r.chain.map((n) => n.assetId)).toEqual(['C']);
    expect(r.root).toBeNull();
  });
});

describe('AssetConnectionsSection — 읽기전용 경로 뷰', () => {
  it('종류별 그룹 + 경로 체인 + 길이 표시 (편집 UI 없음)', () => {
    render(<AssetConnectionsSection assetId="A" connections={conns} activeFloorId="f1" />);
    // 종류 헤더
    expect(screen.getByText('FIBER')).toBeInTheDocument();
    expect(screen.getByText('LAN')).toBeInTheDocument();
    // 경로 요약 "이자산 → … → root": 시작=이 자산, 도착=root/끝(강조), 중간은 … 로 생략.
    expect(screen.getAllByText('장비A').length).toBeGreaterThan(0); // 시작점(두 경로 모두)
    expect(screen.getByText('광단자함')).toBeInTheDocument(); // FIBER root(도착)
    expect(screen.getByText('장비C')).toBeInTheDocument();   // LAN 도착(자연 끝)
    expect(screen.queryByText('장비B')).toBeNull();          // 중간 노드는 안 보여줌(끝점만)
    // 인라인 편집 affordance 제거됨
    expect(screen.queryByLabelText('유형')).toBeNull();
    expect(screen.queryByLabelText('라벨')).toBeNull();
    expect(screen.queryByLabelText('연결 삭제')).toBeNull();
  });

  it('항목 클릭 → startTrace(cableId)', () => {
    render(<AssetConnectionsSection assetId="A" connections={conns} activeFloorId="f1" />);
    fireEvent.click(screen.getByText('광단자함'));
    expect(startTrace).toHaveBeenCalledWith('fA');
  });

  it('활성 항목 재클릭 → clearHighlight', () => {
    mockStore({ tracingCableId: 'fA', active: true });
    render(<AssetConnectionsSection assetId="A" connections={conns} activeFloorId="f1" />);
    fireEvent.click(screen.getByText('광단자함'));
    expect(clearHighlight).toHaveBeenCalled();
    expect(startTrace).not.toHaveBeenCalled();
  });

  it('외부 구간 있는 행(FIBER→OFD root, 다른 층)에 ↗ → 클릭 시 startTrace+openTopology', async () => {
    render(<AssetConnectionsSection assetId="A" connections={conns} activeFloorId="f1" />);
    const ext = screen.getByLabelText('외부망 토폴로지'); // FIBER 행에만(정적, 깜빡임 없음)
    fireEvent.click(ext);
    expect(startTrace).toHaveBeenCalledWith('fA');
    await Promise.resolve();
    expect(openTopology).toHaveBeenCalled();
  });

  it('외부 구간 없는 행(LAN, 같은 층)엔 ↗ 없음', () => {
    const lanOnly = conns.filter((c: { cableType: string }) => c.cableType === 'LAN');
    render(<AssetConnectionsSection assetId="A" connections={lanOnly} activeFloorId="f1" />);
    expect(screen.queryByLabelText('외부망 토폴로지')).toBeNull();
  });

  it('같은 시작→도착 경로(다른 케이블/포트)는 한 항목으로 묶음', () => {
    // A→B→OFD1 (fA) 와 A→OFD1 직결 (fA2) 은 둘 다 "장비A → OFD(광단자함)" → 한 항목.
    const dup = [
      { id: 'fA', source: { assetId: 'A', name: '장비A' }, target: { assetId: 'B', name: '장비B' }, cableType: 'FIBER', label: null, totalLength: 0 },
      { id: 'fA2', source: { assetId: 'A', name: '장비A' }, target: { assetId: 'OFD1', name: '광단자함' }, cableType: 'FIBER', label: null, totalLength: 0 },
    ] as any;
    render(<AssetConnectionsSection assetId="A" connections={dup} activeFloorId="f1" />);
    // 도착(광단자함) 항목은 하나만.
    expect(screen.getAllByText('광단자함')).toHaveLength(1);
  });

  it('연결 없음 → 빈 상태', () => {
    render(<AssetConnectionsSection assetId="A" connections={[]} activeFloorId="f1" />);
    expect(screen.getByText('연결 없음')).toBeInTheDocument();
  });
});

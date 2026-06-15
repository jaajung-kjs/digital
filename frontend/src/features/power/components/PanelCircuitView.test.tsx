import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { RegisterDescriptor } from '../../connections/registerGrid/registerTypes';

const { setSelectedAssetId, setSelected, assetsRef, cablesRef } = vi.hoisted(() => ({
  setSelectedAssetId: vi.fn(),
  setSelected: vi.fn(),
  assetsRef: { current: [] as unknown[] },
  cablesRef: { current: [] as unknown[] },
}));

vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => assetsRef.current,
}));
vi.mock('../../workspace/selectionStore', () => {
  const st = { selectedAssetId: null, selectedCore: null, setSelectedAssetId, setSelected };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSelectionStore: hook };
});
vi.mock('../../trace/traceGraph', () => ({
  useTraceGraph: () => ({ graph: { cables: cablesRef.current }, isLoading: false }),
}));
vi.mock('../../pathTrace/stores/pathHighlightStore', () => ({
  usePathHighlightStore: (sel: (s: unknown) => unknown) => sel({ tracingCableId: null }),
}));
vi.mock('../../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({ data: [] }),
}));

import { ConnectionRegisterGrid } from '../../connections/registerGrid/ConnectionRegisterGrid';
import { powerRegisterDescriptor } from '../powerRegisterDescriptor';

beforeEach(() => {
  setSelectedAssetId.mockClear();
  setSelected.mockClear();
  assetsRef.current = [
    { id: 'p1', name: '1번 분전반', substationId: 's1', parentAssetId: null, assetType: { code: 'DIST', placementKind: 'DIST', connectionKind: null } },
    { id: 'f1', name: '피더-A', substationId: 's1', parentAssetId: 'p1', assetType: { code: 'FEEDER', placementKind: null, connectionKind: 'distributor' } },
    { id: 'L1', name: '통합단말장치', substationId: 's1', parentAssetId: null, assetType: { code: 'TERM', placementKind: null, connectionKind: null } },
  ];
  cablesRef.current = [
    { id: 'c1', sourceAssetId: 'f1', targetAssetId: 'L1', sourceRole: 'OUT', targetRole: null, categoryName: 'F-CV 전력케이블', categoryId: 'cat-1', number: 7, specParams: { capacity: '30A', switchState: 'ON' } },
  ];
});

describe('PanelCircuitView', () => {
  it('피더 섹션 헤더 + CB 행(번호/부하/용량/SW)을 렌더한다', () => {
    render(<ConnectionRegisterGrid substationId="s1" descriptor={powerRegisterDescriptor} />);
    expect(screen.getByText('피더-A')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('통합단말장치')).toBeInTheDocument();
    expect(screen.getByText('30A')).toBeInTheDocument();
    expect(screen.getByText('ON')).toBeInTheDocument();
  });

  it('CB 행 클릭 → 피더 선택 + 해당 CB 코어(rowCore=cbNumber)', () => {
    render(<ConnectionRegisterGrid substationId="s1" descriptor={powerRegisterDescriptor} />);
    fireEvent.click(screen.getByText('통합단말장치'));
    // 계통(power)은 onRowClick→feeder.id, rowCore→cbNumber. 피더 분기패널이 해당 CB를 선택.
    expect(setSelected).toHaveBeenCalledWith('f1', 7);
  });

  it('IN 케이블이 있으면 입력 행(빨강 배지 + 공급원명)을 맨 위에 렌더한다', () => {
    assetsRef.current = [
      ...assetsRef.current,
      { id: 'TR', name: '주변압기', substationId: 's1', parentAssetId: null, assetType: { code: 'TR', placementKind: null, connectionKind: null } },
    ];
    cablesRef.current = [
      { id: 'in1', sourceAssetId: 'TR', targetAssetId: 'f1', sourceRole: null, targetRole: 'IN', categoryName: 'CV', categoryId: 'cat-9', number: null, specParams: { capacity: '50A', switchState: 'ON' } },
      ...cablesRef.current,
    ];
    render(<ConnectionRegisterGrid substationId="s1" descriptor={powerRegisterDescriptor} />);
    expect(screen.getByText('입력')).toBeInTheDocument();
    expect(screen.getByText('주변압기')).toBeInTheDocument();
    // 입력 행이 OUT(CB7) 행보다 위
    const tbody = screen.getByRole('table').querySelector('tbody')!;
    const rows = within(tbody).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('입력');
    expect(rows[0]).toHaveTextContent('주변압기');
  });

  it('분전반이 없으면 빈 상태 메시지', () => {
    assetsRef.current = [];
    cablesRef.current = [];
    render(<ConnectionRegisterGrid substationId="s1" descriptor={powerRegisterDescriptor} />);
    expect(screen.getByText('이 변전소에 분전반이 없습니다.')).toBeInTheDocument();
  });
});

// 정렬 통합 테스트 — 소형 인라인 descriptor 로 ConnectionRegisterGrid 헤더 클릭 → 섹션 행 재정렬 검증.
describe('ConnectionRegisterGrid 정렬 통합', () => {
  type SimpleRow = { id: string; name: string };
  const sortDescriptor: RegisterDescriptor<SimpleRow> = {
    emptyMessage: '없음',
    childKind: 'distributor',
    selectContainers: (assets) => assets.filter((a) => a.id === 'c1'),
    buildSection: (_child, _ctx) => ({
      key: 'sec1',
      title: '섹션',
      usedLabel: '2/2',
      rows: [
        { id: 'r2', name: '나다라' },
        { id: 'r1', name: '가나다' },
      ],
    }),
    rowKey: (r) => r.id,
    onRowClick: (r) => r.id,
    columns: [
      {
        label: '이름',
        sortKey: (r) => r.name,
        sortType: 'text',
        cell: (r) => <span>{r.name}</span>,
      },
    ],
  };

  beforeEach(() => {
    assetsRef.current = [
      { id: 'c1', name: '컨테이너', substationId: 's1', parentAssetId: null, assetType: { code: 'DIST', placementKind: 'DIST', connectionKind: null } },
      { id: 's1child', name: '섹션자식', substationId: 's1', parentAssetId: 'c1', assetType: { code: 'FEEDER', placementKind: null, connectionKind: 'distributor' } },
    ];
    cablesRef.current = [];
  });

  it('이름 헤더 클릭(asc) → 가나다 먼저, 두 번 클릭(desc) → 나다라 먼저', () => {
    render(<ConnectionRegisterGrid substationId="s1" descriptor={sortDescriptor} />);

    // 초기 순서: 나다라, 가나다 (descriptor 원순서)
    const tbody = screen.getByRole('table').querySelector('tbody')!;
    const initialRows = within(tbody).getAllByRole('row');
    expect(initialRows[0]).toHaveTextContent('나다라');
    expect(initialRows[1]).toHaveTextContent('가나다');

    // 1회 클릭 → asc: 가나다, 나다라
    fireEvent.click(screen.getByRole('button', { name: /이름 정렬/ }));
    const ascRows = within(tbody).getAllByRole('row');
    expect(ascRows[0]).toHaveTextContent('가나다');
    expect(ascRows[1]).toHaveTextContent('나다라');

    // 2회 클릭 → desc: 나다라, 가나다
    fireEvent.click(screen.getByRole('button', { name: /이름 정렬/ }));
    const descRows = within(tbody).getAllByRole('row');
    expect(descRows[0]).toHaveTextContent('나다라');
    expect(descRows[1]).toHaveTextContent('가나다');
  });
});

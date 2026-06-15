import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ── hoisted mocks ────────────────────────────────────────────────────────────
const { put, remove, setSelectedAssetId, generateTempId } = vi.hoisted(() => ({
  put: vi.fn(),
  remove: vi.fn(),
  setSelectedAssetId: vi.fn(),
  generateTempId: vi.fn(),
}));

// ── fixture data ─────────────────────────────────────────────────────────────
const OFD_ID = 'ofd1';
const SLOT_ID = 'slot1';
const REMOTE_OFD_ID = 'ofd2';
const OPGW_ID = 'opgw1';

const SLOT_ASSET = {
  id: SLOT_ID, name: '슬롯A', parentAssetId: OFD_ID, substationId: 's1',
  assetType: { connectionKind: 'conduit', code: 'OFD-SLOT' },
};
const OFD_ASSET = {
  id: OFD_ID, name: '원주OFD', substationId: 's1',
  assetType: { placementKind: 'OFD', connectionKind: null }, parentAssetId: null,
};

const OPGW_CABLE = {
  id: OPGW_ID,
  cableType: 'FIBER',
  sourceAssetId: SLOT_ID,
  targetAssetId: 'slot2',
  sourceRole: 'IN',
  targetRole: 'IN',
  specParams: { cores: 48 },
};

const SLIM_LOCAL = { id: OFD_ID, name: '원주OFD', code: 'OFD', substationId: 's1', substationName: '원주변전소', parentAssetId: null, connectionKind: null };
const SLIM_REMOTE = { id: REMOTE_OFD_ID, name: '홍천OFD', code: 'OFD', substationId: 's2', substationName: '홍천변전소', parentAssetId: null, connectionKind: null };

const OPGW_CAT = { id: 'cat-opgw', code: 'CBL-OPGW', name: 'OPGW', displayColor: null };

// ── vi.mock declarations ──────────────────────────────────────────────────────
vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => [OFD_ASSET, SLOT_ASSET],
  useEffectiveCables: () => [OPGW_CABLE],
}));

vi.mock('../../trace/traceGraph', () => ({
  useTraceGraph: () => ({
    graph: {
      subNameById: new Map([[OFD_ID, '원주변전소'], [SLOT_ID, '원주변전소']]),
      nameById: new Map(),
      assets: [],
      cables: [OPGW_CABLE],
    },
    isLoading: false,
  }),
  remoteSlotSubstation: (slotId: string) => (slotId === SLOT_ID ? '홍천변전소' : null),
}));

vi.mock('../../assets/useAssetTypeIdByCode', () => ({
  useAssetTypeIdByCode: () => 'type-ofd-slot',
}));

vi.mock('../../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({ data: [OPGW_CAT] }),
}));

vi.mock('../../workspace/selectionStore', () => {
  const st = { selectedAssetId: null as string | null, setSelectedAssetId };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSelectionStore: hook };
});

vi.mock('../../workingCopy/substationStore', () => {
  const st = { put, remove };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});

vi.mock('../../../utils/idHelpers', () => ({ generateTempId }));

// ── wrapper helper ────────────────────────────────────────────────────────────
function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // seed the slim query so useQuery returns data synchronously
  qc.setQueryData(['assets-slim'], [SLIM_LOCAL, SLIM_REMOTE]);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// ── import after mocks ────────────────────────────────────────────────────────
import { OfdSlotRail } from './OfdSlotRail';

beforeEach(() => {
  put.mockClear();
  remove.mockClear();
  setSelectedAssetId.mockClear();
  generateTempId
    .mockReturnValueOnce('tmp-slotA')
    .mockReturnValueOnce('tmp-slotB')
    .mockReturnValueOnce('tmp-opgw');
});

describe('OfdSlotRail', () => {
  it('슬롯 타일을 "출발-대국" 형식 제목으로 렌더한다', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    // subNameById.get(ofdId)='원주변전소', remoteSlotSubstation(slotId)='홍천변전소'
    expect(screen.getByText('원주변전소 - 홍천변전소')).toBeInTheDocument();
  });

  it('슬롯 타일에 코어 수(N코어) 자막을 표시한다', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    // OPGW_CABLE.specParams.cores = 48
    expect(screen.getByText('48코어')).toBeInTheDocument();
  });

  it('슬롯 타일 클릭 → setSelectedAssetId(slot.id)', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    fireEvent.click(screen.getByText('원주변전소 - 홍천변전소'));
    expect(setSelectedAssetId).toHaveBeenCalledWith(SLOT_ID);
  });

  it('빈 슬롯 클릭 → 팝오버에 "대국 OFD 선택" 이 나타난다', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    // 빈 슬롯이 최소 3개 렌더됨 — 첫 번째 클릭
    const emptySlots = screen.getAllByRole('button', { name: /빈 슬롯/ });
    expect(emptySlots.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(emptySlots[0]);
    expect(screen.getByRole('dialog', { name: '경로 추가' })).toBeInTheDocument();
    expect(screen.getByText('홍천변전소 대국')).toBeInTheDocument();
  });

  it('팝오버에서 48 코어 선택 후 대국 OFD 클릭 → put(assets) 2회 + put(cables) 1회', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);

    // 빈 슬롯 클릭으로 팝오버 열기
    const emptySlots = screen.getAllByRole('button', { name: /빈 슬롯/ });
    fireEvent.click(emptySlots[0]);

    // 48코어 선택
    fireEvent.click(screen.getByRole('button', { name: '48' }));

    // 대국 OFD 선택
    fireEvent.click(screen.getByText('홍천변전소 대국'));

    // 2 slot assets + 1 OPGW cable
    expect(put).toHaveBeenCalledTimes(3);
    const putCalls = put.mock.calls;
    expect(putCalls[0][0]).toBe('assets');
    expect(putCalls[1][0]).toBe('assets');
    expect(putCalls[2][0]).toBe('cables');
    // OPGW cable specParams.cores = 48
    expect(putCalls[2][1]).toMatchObject({ specParams: { cores: 48 } });
  });

  it('24 버튼을 클릭하면 cores=24 로 경로 생성한다', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    const emptySlots = screen.getAllByRole('button', { name: /빈 슬롯/ });
    fireEvent.click(emptySlots[0]);
    // 24 is the default; clicking it explicitly keeps cores=24
    fireEvent.click(screen.getByRole('button', { name: '24' }));
    fireEvent.click(screen.getByText('홍천변전소 대국'));

    const cableCall = put.mock.calls.find((c) => c[0] === 'cables');
    expect(cableCall?.[1]).toMatchObject({ specParams: { cores: 24 } });
  });

  it('좌측 번호 레일이 슬롯 수만큼 렌더된다 (N ≥ 4)', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    // 1 slot + 3 empty = N=4 minimum, but slots.length=1 so N=max(4, 1+3)=4
    // rail shows 1..4 — check "1" and "4" exist (aria-hidden, so use getAllByText)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1);
  });
});

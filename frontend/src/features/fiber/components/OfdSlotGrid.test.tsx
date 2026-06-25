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
  assetType: { code: 'OFD-SLOT', role: 'slot' },
};
const OFD_ASSET = {
  id: OFD_ID, name: '원주OFD', substationId: 's1',
  assetType: { role: 'ofd' }, parentAssetId: null,
};

const OPGW_CABLE = {
  id: OPGW_ID,
  sourceAssetId: SLOT_ID,
  targetAssetId: 'slot2',
  sourceRole: 'IN',
  targetRole: 'IN',
  specParams: { cores: 48 },
};

const SLIM_LOCAL = { id: OFD_ID, name: '원주OFD', code: 'OFD', substationId: 's1', substationName: '원주변전소', parentAssetId: null, role: 'ofd' };
const SLIM_REMOTE = { id: REMOTE_OFD_ID, name: '홍천OFD', code: 'OFD', substationId: 's2', substationName: '홍천변전소', parentAssetId: null, role: 'ofd' };

const OPGW_CAT = { id: 'cat-opgw', code: 'CBL-OPGW', name: 'OPGW', displayColor: null, groupId: 'g-fiber', groupName: '광', groupColor: '#22c55e', isActive: true };

// ── vi.mock declarations ──────────────────────────────────────────────────────
vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => [OFD_ASSET, SLOT_ASSET],
  useEffectiveCables: () => [OPGW_CABLE],
}));

vi.mock('../../trace/traceGraph', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../trace/traceGraph')>()), // 실제 ofdAssets 등 유지
  useTraceGraph: () => ({
    graph: {
      subNameById: new Map([[OFD_ID, '원주변전소'], [SLOT_ID, '원주변전소'], [REMOTE_OFD_ID, '홍천변전소']]),
      nameById: new Map([[OFD_ID, '원주OFD'], [REMOTE_OFD_ID, '홍천OFD']]),
      subById: new Map([[OFD_ID, 's1'], [REMOTE_OFD_ID, 's2']]),
      roleById: new Map([[OFD_ID, 'ofd'], [REMOTE_OFD_ID, 'ofd']]),
      parentById: new Map([[SLOT_ID, OFD_ID]]),
      // ofdAssets 가 열거하는 OFD 자산(자국+대국) — slim+staged 병합 그래프 단일 SSOT.
      assets: [{ id: OFD_ID, role: 'ofd' }, { id: REMOTE_OFD_ID, role: 'ofd' }],
      cables: [OPGW_CABLE],
    },
    isLoading: false,
  }),
  remoteSlotSubstation: (slotId: string) => (slotId === SLOT_ID ? '홍천변전소' : null),
}));

vi.mock('../../assets/useAssetTypeIdByRole', () => ({
  useAssetTypeIdByRole: () => 'type-ofd-slot',
}));

vi.mock('../../cables/hooks/useCableGroups', () => ({
  useCableGroups: () => ({ data: [{ id: 'g-fiber', name: '광', color: '#22c55e' }] }),
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
  it('슬롯 타일을 "출발-대국 #포트수" 형식 제목으로 렌더한다', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    // subNameById.get(ofdId)='원주변전소', remoteSlotSubstation(slotId)='홍천변전소',
    // OPGW_CABLE.specParams.cores=48 → 타이틀에 "#48" 인라인.
    expect(screen.getByText('원주변전소 - 홍천변전소 #48')).toBeInTheDocument();
  });

  it('코어 수를 별도 자막(N코어)으로 표시하지 않는다', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    expect(screen.queryByText('48코어')).not.toBeInTheDocument();
  });

  it('슬롯 타일 클릭 → setSelectedAssetId(slot.id)', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    fireEvent.click(screen.getByText('원주변전소 - 홍천변전소 #48'));
    expect(setSelectedAssetId).toHaveBeenCalledWith(SLOT_ID);
  });

  it('빈 슬롯 클릭 → 팝오버에 "대국 OFD 선택" 이 나타난다', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    // slotCount=12, 점유=1 → 빈 슬롯 11개
    const emptySlots = screen.getAllByRole('button', { name: /빈 슬롯/ });
    expect(emptySlots.length).toBe(11);
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

    // 종류 선택(그룹→이름)
    fireEvent.change(screen.getByLabelText('그룹'), { target: { value: 'g-fiber' } });
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'cat-opgw' } });

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
    fireEvent.change(screen.getByLabelText('그룹'), { target: { value: 'g-fiber' } });
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'cat-opgw' } });
    fireEvent.click(screen.getByText('홍천변전소 대국'));

    const cableCall = put.mock.calls.find((c) => c[0] === 'cables');
    expect(cableCall?.[1]).toMatchObject({ specParams: { cores: 24 } });
  });

  it('좌측 번호 레일이 12슬롯(랙과 동일)으로 렌더된다', () => {
    wrap(<OfdSlotRail ofdId={OFD_ID} />);
    // slotCount=12 고정 — 레일에 "1"부터 "12" 까지 렌더됨 (aria-hidden).
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
  });
});

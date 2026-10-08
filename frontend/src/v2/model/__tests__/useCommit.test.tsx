import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { Workingcopy } from '../types';

/* mockReset 이라 vi.fn 구현은 지워진다 — 일반 함수와 기록을 쓴다. */
let catalog: { data: unknown } = { data: undefined };
let putCalls = 0;
let refreshFails = false;
const wc: Workingcopy = {
  substation: { id: 'S1', name: 'S' }, floors: [], racks: [], equipment: [], links: [], fiberLines: [],
  farLinks: [], refEquipment: [], maintenanceLogs: [], inspectionLogs: [], photos: [],
};
let fetchCount = 0;
/** 새로 읽기를 붙잡아 둘 문 — 시험이 열기 전에는 응답이 오지 않는다. */
let refreshGate: Promise<void> | null = null;
/** 저장을 보내는 동안 일어날 일(다른 사용자 로그인 등). */
let duringPut: (() => void) | null = null;
vi.mock('../api', () => ({
  fetchWorkingcopy: async () => {
    fetchCount += 1;
    if (refreshFails && fetchCount > 1) throw new Error('down');
    if (fetchCount > 1 && refreshGate) await refreshGate;
    return structuredClone(wc);
  },
  putCommit: async () => { putCalls += 1; duringPut?.(); return {}; },
}));
vi.mock('../hooks', () => ({ useCatalog: () => catalog, CATALOG_KEY: ['c'], NODE_EQUIPMENT_KEY: ['n'], EQUIPMENT_CHANGES_KEY: ['h'] }));

import { useV2Notice } from '../../store/noticeStore';
import { useCommit } from '../store/useCommit';
import { workingCopyStore as store } from '../store/workingCopy';
import { effectiveRows } from '../store/effective';
import { useLiveSelection } from '../../pages/workspace/useLiveSelection';

let client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(async () => {
  catalog = { data: undefined }; putCalls = 0; refreshFails = false; fetchCount = 0; refreshGate = null; duringPut = null;
  wc.racks = []; wc.equipment = [];
  client = new QueryClient();
  useV2Notice.setState({ error: null, success: null });
  store.getState().reset();
  await store.getState().ensureLoaded('S1');
  store.getState().create('racks', { id: 'r2', substationId: 'S1', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
});

describe('useCommit', () => {
  it('품목을 못 불러왔으면 흠은 비고 저장은 보내지 않는다', async () => {
    const { result } = renderHook(() => useCommit(), { wrapper });
    expect(result.current.issues).toEqual([]);
    expect(result.current.ready).toBe(false);
    await act(async () => { await result.current.commit(); });
    expect(putCalls).toBe(0);
    expect(result.current.error).toBe('품목을 불러오는 중입니다');
  });

  it('저장은 됐는데 새로 읽기가 실패해도 변경안은 비워진다 — 다시 저장해 겹치지 않는다', async () => {
    catalog = { data: { cableTypes: [] } };
    refreshFails = true;
    const { result } = renderHook(() => useCommit(), { wrapper });
    await act(async () => { await result.current.commit(); });
    expect(putCalls).toBe(1);
    expect(store.getState().dirtyCount()).toBe(0);
    expect(result.current.error).toBeNull();
    expect(useV2Notice.getState().error).toContain('저장했지만');
  });

  it('저장 뒤 광 계통도 범위 데이터(network)를 낡은 것으로 표시한다 — 들르지 않은 국의 저장분도 다시 읽게', async () => {
    catalog = { data: { cableTypes: [] } };
    client.setQueryData(['v2', 'network', 'HQ'], { substations: [] });
    const { result } = renderHook(() => useCommit(), { wrapper });
    expect(client.getQueryState(['v2', 'network', 'HQ'])?.isInvalidated).toBe(false);
    await act(async () => { await result.current.commit(); });
    expect(client.getQueryState(['v2', 'network', 'HQ'])?.isInvalidated).toBe(true);
  });

  it('저장 뒤 설비 변경 이력을 낡은 것으로 표시한다 — 방금 저장한 것이 이력 탭에 보이게', async () => {
    catalog = { data: { cableTypes: [] } };
    client.setQueryData(['h', 'e1'], { pages: [], pageParams: [] });
    const { result } = renderHook(() => useCommit(), { wrapper });
    await act(async () => { await result.current.commit(); });
    expect(client.getQueryState(['h', 'e1'])?.isInvalidated).toBe(true);
  });

  it('새로 만든 설비를 저장해도 선택이 풀리지 않는다 — 새로 읽는 동안에도 그 행이 있다', async () => {
    catalog = { data: { cableTypes: [] } };
    const eq = {
      id: 'e9', substationId: 'S1', rackId: 'r2', name: '새 설비', typeId: 'et', status: 'normal' as const, model: null, maker: null, madeOn: null,
      serial: null, installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: '',
    };
    store.getState().create('equipment', eq);
    const selectEquipment = vi.fn();
    const selectRack = vi.fn();
    const route = { eqId: 'e9', rackId: null, selectEquipment, selectRack };
    const { result } = renderHook(() => ({ commit: useCommit(), sel: useLiveSelection(route, 'S1', true) }), { wrapper });
    expect(result.current.sel.eqId).toBe('e9');
    /* 서버는 저장을 받았다 — 새로 읽기는 문이 열릴 때까지 붙잡힌다. */
    wc.racks = [{ id: 'r2', substationId: 'S1', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: 'v1' }];
    wc.equipment = [{ ...eq, updatedAt: 'v1', circuits: [] }];
    let open!: () => void;
    refreshGate = new Promise((r) => { open = r; });
    let done!: Promise<void>;
    act(() => { done = result.current.commit.commit(); });
    await vi.waitFor(() => expect(fetchCount).toBe(2));
    /* 새로 읽는 틈 — 만든 설비는 아직 오버레이에 있다(먼저 비우지 않는다). */
    expect(effectiveRows(store.getState(), 'equipment').some((e) => e.id === 'e9')).toBe(true);
    expect(result.current.sel.eqId).toBe('e9');
    await act(async () => { open(); await done; });
    expect(store.getState().dirtyCount()).toBe(0);
    expect(store.getState().saved.equipment.map((e) => e.id)).toEqual(['e9']);
    expect(result.current.sel.eqId).toBe('e9');
    expect(selectEquipment).not.toHaveBeenCalled();
    expect(selectRack).not.toHaveBeenCalled();
  });

  it('보내는 동안 다른 사용자가 들어왔으면 저장 뒤 정리를 그 사람의 변경안에 하지 않는다', async () => {
    catalog = { data: { cableTypes: [] } };
    store.getState().claim('u1');
    duringPut = () => {
      store.getState().claim('u2');
      store.getState().create('racks', { id: 'rB', substationId: 'S1', name: 'B의 랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
    };
    const before = fetchCount;
    const { result } = renderHook(() => useCommit(), { wrapper });
    await act(async () => { await result.current.commit(); });
    expect(putCalls).toBe(1);
    expect(fetchCount).toBe(before);
    expect(Object.keys(store.getState().overlays.racks.creates)).toEqual(['rB']);
  });
});

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
vi.mock('../api', () => ({
  fetchWorkingcopy: async () => { fetchCount += 1; if (refreshFails && fetchCount > 1) throw new Error('down'); return structuredClone(wc); },
  putCommit: async () => { putCalls += 1; return {}; },
}));
vi.mock('../hooks', () => ({ useCatalog: () => catalog, CATALOG_KEY: ['c'], NODE_EQUIPMENT_KEY: ['n'] }));

import { useV2Notice } from '../../store/noticeStore';
import { useCommit } from '../store/useCommit';
import { workingCopyStore as store } from '../store/workingCopy';

let client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(async () => {
  catalog = { data: undefined }; putCalls = 0; refreshFails = false; fetchCount = 0;
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
});

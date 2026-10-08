import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workingcopy } from '../../../model/types';

vi.mock('../../../model/api', () => ({
  fetchWorkingcopy: async (id: string): Promise<Workingcopy> => ({
    substation: { id, name: '북춘천' }, floors: [], racks: [], equipment: [], links: [], fiberLines: [],
    farLinks: [], refEquipment: [], maintenanceLogs: [], inspectionLogs: [], photos: [],
  }),
  putCommit: async () => ({}),
}));

import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { useWorkspaceRoute } from '../../../useWorkspaceRoute';
import { useLiveSelection } from '../useLiveSelection';

function Probe() {
  const route = useWorkspaceRoute();
  const loaded = store.getState().loaded.includes('S1');
  const { eqId, rackId } = useLiveSelection(route, 'S1', loaded);
  const l = useLocation();
  return <div>{`rail:${eqId ?? rackId ?? '없음'} url:${l.search}`}</div>;
}

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/n/:nodeId" element={<Probe />} /></Routes>
  </MemoryRouter>,
);

const rack = { id: 'R9', substationId: 'S1', name: '새 랙', rackTypeId: 't', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' };

beforeEach(async () => {
  store.getState().reset();
  await store.getState().ensureLoaded('S1');
  store.temporal.getState().clear();
});

describe('사라진 선택은 놓는다 (실행 취소 · 변경 취소)', () => {
  it('만든 랙을 실행 취소하면 주소의 rack 이 걷히고 레일이 서지 않는다', async () => {
    store.getState().create('racks', rack);
    renderAt('/n/S1?view=power&rack=R9');
    expect(screen.getByText('rail:R9 url:?view=power&rack=R9')).toBeInTheDocument();
    act(() => store.temporal.getState().undo());
    expect(await screen.findByText('rail:없음 url:?view=power')).toBeInTheDocument();
  });

  it('만든 설비를 변경 취소하면 주소의 eq 가 걷힌다', async () => {
    store.getState().create('racks', rack);
    store.getState().create('equipment', { id: 'E9', substationId: 'S1', rackId: 'R9', name: '새 설비', typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: '' });
    renderAt('/n/S1?eq=E9');
    expect(screen.getByText('rail:E9 url:?eq=E9')).toBeInTheDocument();
    act(() => store.getState().revert());
    expect(await screen.findByText('rail:없음 url:')).toBeInTheDocument();
  });

  it('있는 것은 그대로 둔다', () => {
    store.getState().create('racks', rack);
    renderAt('/n/S1?rack=R9');
    expect(screen.getByText('rail:R9 url:?rack=R9')).toBeInTheDocument();
  });
});

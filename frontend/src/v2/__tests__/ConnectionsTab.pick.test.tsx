/**
 * 포트 판을 **고르는 모드**로 돌렸을 때 — 출발 포트가 어떻게 보이는가.
 *
 * 예전에는 고르는 동안 출발 포트를 판에서 **감췄다**. 그러면 「내가 어디서 출발했더라」를
 * 판에서 확인할 수 없고, 포트 하나가 빠져 번호가 건너뛰어 옆 포트를 출발로 착각한다.
 * 자리는 지키고 「출발」이라고 적는다 — 누를 수는 없다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { emptyOverlays, v2WorkingCopyStore } from '../store/workingCopyStore';
import { ConnectionsTab } from '../components/detail/ConnectionsTab';
import type { V2Asset } from '../types';

vi.mock('../hooks', () => ({
  useV2Catalog: () => ({ data: { cableGroups: [{ key: 'power', name: '전력', categories: [{ id: 'cat1', name: '저압' }] }], types: [], categories: [], assemblies: [] } }),
  useMediumColor: () => () => '#333333',
  useMediumLabel: () => (m: string) => m,
  useTypesById: () => new Map(),
  /* 위상 상자는 열리지 않아도 마운트된다 — 질의 공급자 없이도 서게 빈 결과를 돌려준다. */
  useReach: () => ({ data: null, isLoading: false }),
}));

const port = (id: string, index: number) =>
  ({ id, assetId: 'rack', group: 'A', index, name: `포트 ${index}`, direction: 'BI' as const, medium: 'power', positions: 1, fieldValues: {} });

const rack: V2Asset = {
  id: 'rack', name: '분전반', typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: 'f1', x: 0, y: 0, width: 50, height: 50,
  parentAssetId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [port('p1', 1), port('p2', 2), port('p3', 3)],
};

beforeEach(() => {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: { substation: { id: 'sub-1', name: '변전소', branchId: 'b', sortOrder: 1 }, floors: [], assets: [rack], maintenanceLogs: [], inspectionLogs: [], cables: [], photos: [] },
    overlays: emptyOverlays(),
    baseVersions: {},
  });
});

const pick = (onSelect = vi.fn()) => ({
  assetId: 'rack',
  medium: 'power',
  firstEndpoint: { portId: 'p1', label: '변전소 · 분전반#1' },
  error: null,
  onSelect,
  onCancel: vi.fn(),
});

const draw = (request: ReturnType<typeof pick> | null) =>
  render(
    <ConnectionsTab
      assetId="rack"
      focusPortId={null}
      onSelectAsset={vi.fn()}
      onTrace={vi.fn()}
      onClearTrace={vi.fn()}
      traceResult={null}
      cablePick={request}
    />,
  );

describe('고르는 모드의 출발 포트', () => {
  it('출발 포트는 판에 남고 「출발」이라고 적힌다', () => {
    draw(pick());
    const from = screen.getByRole('button', { name: /포트 1 출발 포트/ });
    expect(from).toBeInTheDocument();
    /* 누를 수는 없다 — 자기 자신에게는 잇지 않는다. */
    expect(from).toBeDisabled();
  });

  /* 나머지 포트는 그대로 고를 수 있다 — **같은 장비 안의 다른 포트**가 도착이 된다. */
  it('같은 장비의 다른 포트는 고를 수 있다', () => {
    const onSelect = vi.fn();
    draw(pick(onSelect));
    const other = screen.getByRole('button', { name: /포트 2 미연결/ });
    expect(other).not.toBeDisabled();
    other.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }));
  });

  /* 고르는 중이 아니면 「출발」 같은 것은 없다 — 평소 판 그대로다. */
  it('고르는 중이 아니면 표시가 없다', () => {
    draw(null);
    expect(screen.queryByRole('button', { name: /출발 포트/ })).toBeNull();
    expect(screen.getByRole('button', { name: /포트 1 미연결/ })).not.toBeDisabled();
  });
});

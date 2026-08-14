/**
 * FiberRegisterView — 배선(wiring) 테스트
 *
 * 셀렉터 단위 테스트만으로는 콜사이트가 배선을 빠뜨려도 통과하는 갭이 있었다
 * (R-3 리뷰 P1: buildFiberRows 인자 누락 → 프로덕션에서 meta 전부 비활성).
 * 이 테스트는 컴포넌트를 실제 렌더해, 다심 인입 선언이 **코어별** 값 입력까지
 * 관통하는지 단언한다 — 배선이 끊기면 실패한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { emptyOverlay } from '../store/overlay';
import { FiberRegisterView } from '../components/registers/FiberRegisterView';
import type { V2Asset, V2AssetType, V2Cable } from '../types';

const mockTypes: V2AssetType[] = [
  {
    id: 't', key: 'SLOT-X', name: '경로슬롯', categoryId: 'c', sortOrder: 1,
    assetCount: 0,
    laborCode: null, installManDays: 0, removeManDays: 0, relocateManDays: 0,
    containerSpecs: [],
    portTemplates: [
      { id: 'pt-a', group: 'CORE', count: 2, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', sortOrder: 1, positions: 1 },
      { id: 'pt-b', group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', sortOrder: 2, positions: 2 },
    ],
  },
];

vi.mock('../hooks', () => ({
  useV2Catalog: () => ({ data: { categories: [], types: mockTypes, cableGroups: [] } }),
  useTypesById: () => new Map(mockTypes.map((t) => [t.id, t])),
}));

const port = (
  id: string, assetId: string, group: string, index: number,
  extra: { medium?: string; name?: string; positions?: number; fieldValues?: Record<string, unknown> } = {},
) => ({
  id, assetId, group, index,
  name: extra.name ?? `광 ${index}`,
  direction: 'BI' as const,
  medium: extra.medium ?? 'fiber',
  positions: extra.positions ?? 1,
  fieldValues: extra.fieldValues ?? {},
});
const asset = (id: string, name: string, extra: Partial<V2Asset> = {}): V2Asset => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const cable = (id: string, a: string, b: string, extra: Partial<V2Cable> = {}): V2Cable => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

const ofd = asset('ofd', 'OFD-1');
/* 심선 값(손실)은 **인입 포트**에 코어 번호 아래 담긴다 — 케이블도, 심선별 포트도 아니다. */
const slot = asset('slot', '슬롯1', {
  parentAssetId: 'ofd',
  ports: [
    port('a1', 'slot', 'CORE', 1),
    port('a2', 'slot', 'CORE', 2),
    port('t1', 'slot', 'TRUNK', 1, {
      medium: 'fiber', name: 'OPGW', positions: 2,
      fieldValues: { 1: { lossDb: 0.3 }, 2: { lossDb: 0.9 } },
    }),
  ],
});

function setStore(assets: V2Asset[], cables: V2Cable[]) {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: { substation: null, floors: [], assets, maintenanceLogs: [], inspectionLogs: [], cables, photos: [] },
    overlays: { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), cables: emptyOverlay(), photos: emptyOverlay() },
    baseVersions: {},
  });
}

describe('FiberRegisterView 배선 — 다심 인입 선언이 코어별 값 입력까지 관통', () => {
  beforeEach(() => {
    setStore([], []);
  });

  it('길이는 인입 케이블에서, 손실은 인입 포트의 코어 번호에서 온다', () => {
    setStore([ofd, slot], [cable('c1', 't1', 'x', { specParams: { lengthM: 40 } })]);

    render(<FiberRegisterView
        substationId="sub-1"
        selectedAssetId={null}
        containerId={null}
        onPickContainer={vi.fn()}
        onSelectAsset={vi.fn()}
      />);

    // 길이는 케이블 한 가닥의 값 — 두 코어 행이 **같은** 40 을 본다(예전에는 심선마다 케이블이었다).
    expect(screen.getAllByDisplayValue('40')).toHaveLength(2);
    // 손실은 코어마다 다르다 — 같은 포트 하나에서 번호로 갈라져 나온다.
    expect(screen.getByDisplayValue('0.3')).toBeTruthy();
    expect(screen.getByDisplayValue('0.9')).toBeTruthy();
  });

  it('코어 손실을 고치면 그 코어 자리만 바뀐다 — 옆 코어 값은 그대로다', () => {
    setStore([ofd, slot], []);
    render(<FiberRegisterView
        substationId="sub-1"
        selectedAssetId={null}
        containerId={null}
        onPickContainer={vi.fn()}
        onSelectAsset={vi.fn()}
      />);

    const input = screen.getByDisplayValue('0.3');
    fireEvent.change(input, { target: { value: '1.4' } });
    fireEvent.blur(input);

    const staged = v2WorkingCopyStore.getState().effectiveAssets().find((a) => a.id === 'slot')!;
    const trunk = staged.ports.find((p) => p.id === 't1')!;
    expect(trunk.fieldValues).toEqual({ 1: { lossDb: 1.4 }, 2: { lossDb: 0.9 } });
  });

  /* 표의 단위는 자산이 아니라 심선이다. 자산 id 로 칠하면 그 슬롯의 24행이 한꺼번에
     물들어, 어느 심선을 눌렀는지가 화면에서 사라진다(실제로 그랬다). */
  it('행을 고르면 그 심선 한 줄만 선택된다', () => {
    setStore([ofd, slot], []);
    const onSelect = vi.fn();
    const { container } = render(
      <FiberRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={onSelect} />,
    );
    const dataRows = [...container.querySelectorAll('tbody tr')].filter((r) => r.querySelectorAll('td').length > 3);
    expect(dataRows).toHaveLength(2); // 코어 2가닥

    fireEvent.click(dataRows[0]!);
    const selected = dataRows.filter((r) => r.className.includes('bg-info-bg'));
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(dataRows[0]);
    // 패널은 그 심선의 **포트까지** 골라 준다 — 표의 줄과 판의 선택이 어긋나면 안 된다.
    expect(onSelect).toHaveBeenCalledWith('slot', 'a1');
  });

  /* 인입이 없는 자산은 선번장 대상이 아니다 — OTDR 로 잴 것이 없다. */
  it('단심 광 포트만 가진 자산은 선번장에 오르지 않는다', () => {
    const optTerm = asset('opt', '광단말-1', { parentAssetId: 'rack', ports: [port('o1', 'opt', 'CORE', 1)] });
    setStore([asset('rack', '통신랙 A'), optTerm], []);

    render(<FiberRegisterView
        substationId="sub-1"
        selectedAssetId={null}
        containerId={null}
        onPickContainer={vi.fn()}
        onSelectAsset={vi.fn()}
      />);
    expect(screen.getByText(/선번장에 표시할 광 자산이 없습니다/)).toBeTruthy();
  });
});

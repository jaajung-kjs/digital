/**
 * FloorPlanView — 상태 전이 + 스토어 스테이징 테스트 (W4-1)
 *
 * jsdom에서 canvas 렌더는 목(전역 setup.ts에서 getContext/ResizeObserver 이미 목킹됨)이라
 * 픽셀은 단언하지 않는다. 대신 REAL 컴포넌트 + REAL 워킹카피 스토어를 구동해
 * (i) 케이블 도구 FSM 전이와 스테이징, (ii) ESC 취소, (iii) 배치 팔레트 armed 전이만
 * 단언한다 — 로직을 테스트에서 재구현하지 않는다.
 *
 * getBoundingClientRect가 jsdom에서 항상 {top:0,left:0}을 반환하므로, viewport 초기값
 * (zoom:100, pan:0,0)에서 screenToWorld(clientX, clientY, ...) === {x:clientX, y:clientY} —
 * 즉 자산 좌표 = 클릭 clientX/clientY로 그대로 맞춰 좌표 변환을 재구현하지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { emptyOverlay } from '../store/overlay';
import { FloorPlanView } from '../components/floorplan/FloorPlanView';
import type { V2Asset, V2AssetType, V2Cable, V2Floor } from '../types';
import type { CablePickRequest } from '../cablePick';

/* useV2Catalog 만 목킹 — 도면에 놓이는 것은 **설비 종류**뿐이다(자산 종류에는 배치 개념이
   없다). 케이블 그룹 1개(카테고리 1개)도 공급한다. */
const mockTypes: V2AssetType[] = [
  {
    id: 't-panel', key: 'PANEL', name: '배전반', categoryId: 'c1', sortOrder: 1,
    assetCount: 0, laborCode: null, installManDays: 0, removeManDays: 0, relocateManDays: 0,
    portTemplates: [],
  },
];
const mockAssemblies = [
  {
    id: 'asm-panel', key: 'PANEL-SET', name: '배전반', categoryId: 'c1',
    gridCols: 1, gridRows: 1, sortOrder: 1,
    items: [{ id: 'it1', typeId: 't-panel', name: '배전반', col: 0, row: 0, colSpan: 1, rowSpan: 1, sortOrder: 0 }],
  },
];

vi.mock('../hooks', () => ({
  useV2Catalog: () => ({
    data: {
      categories: [{ id: 'c1', key: 'panel', name: '배전반류', sortOrder: 1 }],
      types: mockTypes,
      assemblies: mockAssemblies,
      cableGroups: [
        {
          id: 'g1', key: 'power', name: '전력', color: '#333333', laborCode: null,
          installManDays: 0, removeManDays: 0, sortOrder: 1,
          categories: [{ id: 'cat1', name: '저압', sortOrder: 1 }],
        },
      ],
    },
  }),
  // 포트 피커가 매체 키를 사람이 읽는 이름으로 바꿔 보여준다 — 모의에서는 키를 그대로 돌려준다.
  // 부품의 포트를 놓는 순간 만들려면 자산 종류가 필요하다(저장 전에도 포트가 보여야 한다).
  useTypesById: (types?: { id: string }[]) => new Map((types ?? []).map((t) => [t.id, t])),
  useMediumLabel: () => (key: string) => key,
  useMediumColor: () => () => null,
}));

const floor: V2Floor = { id: 'f1', name: '1층', sortOrder: 1, substationId: 'sub-1' };

const port = (id: string, assetId: string) =>
  ({ id, assetId, group: 'A', index: 1, name: `포트 ${id}`, direction: 'BI' as const, medium: 'power' });

const asset = (id: string, x: number, y: number, extra: Partial<V2Asset> = {}): V2Asset => ({
  id, name: `자산-${id}`, typeId: 't-panel', substationId: 'sub-1', status: 'normal',
  floorId: 'f1', x, y, width: 50, height: 50,
  parentAssetId: null, assemblyId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v1', ports: [port(`p-${id}`, id)], ...extra,
});

function setStore(assets: V2Asset[], cables: V2Cable[] = []) {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: {
      substation: { id: 'sub-1', name: '변전소', branchId: 'b1', sortOrder: 1 },
      floors: [floor], assets, maintenanceLogs: [], inspectionLogs: [], cables, photos: [],
    },
    overlays: { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), cables: emptyOverlay(), photos: emptyOverlay() },
    baseVersions: {},
  });
}

/**
 * 포트를 고르는 판은 이제 **상세 패널의 포트 탭**에 있다 — 평면도는 「이 자산에서 골라
 * 달라」는 요청을 내보내고 고른 결과를 콜백으로 받을 뿐이다(`cablePick.ts`).
 *
 * 그래서 테스트도 그 계약을 그대로 친다: 마지막 요청을 붙잡아 두고, 거기 실려 온
 * `onSelect` 에 포트를 넘겨 다음 전이를 일으킨다. 판을 여기서 다시 그리지 않는다.
 */
function renderFloorPlan(onSelectAsset: (id: string | null) => void = vi.fn()) {
  const pick: { current: CablePickRequest | null } = { current: null };
  const utils = render(
    <FloorPlanView
      substationId="sub-1"
      selectedAssetId={null}
      onSelectAsset={onSelectAsset}
      onPickPort={(req) => { pick.current = req; }}
    />,
  );
  return { ...utils, pick };
}

/** 지금 고르라고 온 자산에서 포트 하나를 고른다 — 판이 하던 일을 그대로. */
function choosePort(pick: { current: CablePickRequest | null }, portId: string) {
  const req = pick.current;
  if (!req) throw new Error('포트를 고르라는 요청이 오지 않았다');
  const target = v2WorkingCopyStore.getState().saved.assets
    .flatMap((a) => a.ports)
    .find((p) => p.id === portId);
  if (!target) throw new Error(`포트 ${portId} 없음`);
  // 판이 아니라 콜백으로 부르므로 React 밖의 호출이다 — act 로 감싸야 전이가 반영된다.
  act(() => req.onSelect(target as never));
}

describe('FloorPlanView — 케이블 도구 FSM', () => {
  beforeEach(() => {
    // asset-a: (0,0)-(50,50), asset-b: (200,0)-(250,50) — jsdom rect가 항상 0,0이므로
    // clientX/clientY == world 좌표 (viewport 초기값 zoom:100/pan:0,0)
    setStore([asset('a', 0, 0), asset('b', 200, 0)]);
  });

  it('arm → 종류 선택(자동) → 자산 클릭 → 포트 선택 → 두 번째 끝점 → 스테이지', () => {
    const { pick } = renderFloorPlan();

    // 케이블 도구 arm
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(screen.getByText('이을 자산을 클릭하세요')).toBeTruthy();

    // 첫 번째 자산(A) 클릭 → 그 자산에서 고르라는 요청
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    expect(pick.current?.assetId).toBe('a');
    choosePort(pick, 'p-a');

    // 첫 끝점 확정 → 안내가 반대쪽 자산 대기로 전환
    expect(screen.getByText(/반대쪽 자산을 클릭하세요/)).toBeTruthy();

    // 두 번째 자산(B) 클릭 → 그 자산에서 고르라는 요청
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 225, clientY: 25 });
    expect(pick.current?.assetId).toBe('b');
    choosePort(pick, 'p-b');

    // 스테이지 확인 — 워킹카피 스토어에 케이블 생성 오버레이가 쌓였는가
    const creates = Object.values(v2WorkingCopyStore.getState().overlays.cables.creates);
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ aPortId: 'p-a', bPortId: 'p-b', categoryId: 'cat1' });

    // 도구는 유지(연속 연결) — 다시 첫 끝점 대기 안내로 돌아온다
    expect(screen.getByText('이을 자산을 클릭하세요')).toBeTruthy();
  });

  it('ESC — 첫 끝점 확정 후에도 FSM을 idle로 되돌리고 아무것도 스테이지하지 않는다', () => {
    const { pick } = renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    choosePort(pick, 'p-a');
    expect(screen.getByText(/반대쪽 자산을 클릭하세요/)).toBeTruthy();

    fireEvent.keyDown(window, { code: 'Escape' });

    // armed 안내가 사라지고, 고르라는 요청도 걷힌다 (idle 복귀) — 부분 상태 잔존 없음
    expect(screen.queryByText(/반대쪽 자산을 클릭하세요/)).toBeNull();
    expect(screen.queryByText('이을 자산을 클릭하세요')).toBeNull();
    expect(pick.current).toBeNull();

    // 케이블 버튼이 더 이상 armed(primary) 표시가 아님 — 재클릭 시 다시 arm 되어야 함
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(screen.getByText('이을 자산을 클릭하세요')).toBeTruthy();

    // 아무것도 스테이지되지 않았다
    expect(Object.keys(v2WorkingCopyStore.getState().overlays.cables.creates)).toHaveLength(0);
  });
});

describe('FloorPlanView — 배치(armed/draw) 팔레트', () => {
  beforeEach(() => {
    setStore([]);
  });

  it('타입 arm → 힌트 표시 → ESC로 armed 해제(드래그 전)', () => {
    renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    expect(screen.getByText('드래그로 영역 지정 · ESC 취소')).toBeTruthy();

    fireEvent.keyDown(window, { code: 'Escape' });
    expect(screen.queryByText('드래그로 영역 지정 · ESC 취소')).toBeNull();
  });

  it('arm 후 드래그(mousedown→mousemove→mouseup)로 배치 모달이 열린다', () => {
    renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    const canvas = screen.getByTestId('floorplan-canvas');

    fireEvent.mouseDown(canvas, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 60, clientY: 60 });
    fireEvent.mouseUp(window, { clientX: 60, clientY: 60 });

    /* 물어볼 것은 **현장 이름 하나뿐**이다 — 무엇이 몇 개 들어가는지는 설비 종류가 이미 안다.
       예전에는 자산 종류를 다시 고르게 했는데, 그러면 대장에서 짜 둔 뜻이 없다. */
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: '설비 이름' })).toBeTruthy();
    expect(dialog.textContent).toContain('배전반');
  });

  it('드로우 mouseup 직후 합성 click 은 모달 뒤에서 선택을 바꾸지 않는다', () => {
    // 리뷰發 회귀핀: 가드가 armed 만 보면 modal 단계의 click 이 통과해
    // 열린 AddAssetModal 뒤에서 onSelectAsset 이 호출된다(구 ref 가드는 두 단계 모두 차단했음).
    setStore([asset('a', 0, 0)]); // 드래그 종료 지점과 겹치는 기존 자산
    const onSelectAsset = vi.fn();
    renderFloorPlan(onSelectAsset);

    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    const canvas = screen.getByTestId('floorplan-canvas');

    fireEvent.mouseDown(canvas, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 40 });
    fireEvent.mouseUp(window, { clientX: 40, clientY: 40 });
    expect(screen.getByRole('dialog')).toBeTruthy(); // modal 단계 진입

    // 브라우저가 mouseup 뒤 합성하는 click
    fireEvent.click(canvas, { clientX: 40, clientY: 40 });
    expect(onSelectAsset).not.toHaveBeenCalled();
  });

  it('너무 작은 드래그(MIN_DRAW 미만)는 모달을 열지 않는다', () => {
    renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    const canvas = screen.getByTestId('floorplan-canvas');

    fireEvent.mouseDown(canvas, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 3, clientY: 3 });
    fireEvent.mouseUp(window, { clientX: 3, clientY: 3 });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

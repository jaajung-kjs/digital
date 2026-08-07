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
import { render, screen, fireEvent, within } from '@testing-library/react';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { emptyOverlay } from '../store/overlay';
import { FloorPlanView } from '../components/FloorPlanView';
import type { V2Asset, V2AssetType, V2Cable, V2Floor } from '../types';

// useV2Catalog 만 목킹 — placeable 타입 1개 + 케이블 그룹 1개(카테고리 1개) 공급
const mockTypes: V2AssetType[] = [
  {
    id: 't-panel', key: 'PANEL', name: '배전반', categoryId: 'c1', sortOrder: 1, isActive: true,
    assetCount: 0, placeable: true, defaultWidth: 50, defaultHeight: 50,
    laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
    fieldDefs: [], containerSpecs: [], portTemplates: [], linkRules: [],
  },
];

vi.mock('../hooks', () => ({
  useV2Catalog: () => ({
    data: {
      categories: [{ id: 'c1', key: 'panel', name: '배전반류', sortOrder: 1 }],
      types: mockTypes,
      cableGroups: [
        {
          id: 'g1', key: 'power', name: '전력', color: '#333333', laborType: null,
          installHoursPerM: 0, removeHoursPerM: 0, sortOrder: 1,
          categories: [{ id: 'cat1', name: '저압', sortOrder: 1 }],
        },
      ],
    },
  }),
  // 포트 피커가 매체 키를 사람이 읽는 이름으로 바꿔 보여준다 — 모의에서는 키를 그대로 돌려준다.
  useMediumLabel: () => (key: string) => key,
  useMediumColor: () => () => null,
}));

const floor: V2Floor = { id: 'f1', name: '1층', sortOrder: 1, substationId: 'sub-1' };

const port = (id: string, assetId: string) =>
  ({ id, assetId, group: 'A', index: 1, name: `포트 ${id}`, direction: 'BI' as const, medium: 'power' });

const asset = (id: string, x: number, y: number, extra: Partial<V2Asset> = {}): V2Asset => ({
  id, name: `자산-${id}`, typeId: 't-panel', substationId: 'sub-1', status: 'normal',
  floorId: 'f1', x, y, width: 50, height: 50,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
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

function renderFloorPlan(onSelectAsset: (id: string | null) => void = vi.fn()) {
  return render(
    <FloorPlanView substationId="sub-1" selectedAssetId={null} onSelectAsset={onSelectAsset} />,
  );
}

describe('FloorPlanView — 케이블 도구 FSM', () => {
  beforeEach(() => {
    // asset-a: (0,0)-(50,50), asset-b: (200,0)-(250,50) — jsdom rect가 항상 0,0이므로
    // clientX/clientY == world 좌표 (viewport 초기값 zoom:100/pan:0,0)
    setStore([asset('a', 0, 0), asset('b', 200, 0)]);
  });

  it('arm → 종류 선택(자동) → 자산 클릭 → 포트 선택 → 두 번째 끝점 → 스테이지', () => {
    renderFloorPlan();

    // 케이블 도구 arm
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(screen.getByText('자산 클릭으로 포트 선택 · ESC 취소')).toBeTruthy();

    // 첫 번째 자산(A) 클릭 → 포트 피커
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    // 패널 머리줄과 그룹 카드 두 곳에 자산 이름이 나온다 — 열렸다는 사실만 확인한다.
    expect(screen.getAllByText('자산-a').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /포트 p-a/ }));

    // 첫 끝점 확정 → 힌트가 두 번째 자산 대기로 전환
    expect(screen.getByText('두 번째 자산 클릭 · ESC 취소')).toBeTruthy();

    // 두 번째 자산(B) 클릭 → 포트 피커
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 225, clientY: 25 });
    expect(screen.getAllByText('자산-b').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /포트 p-b/ }));

    // 스테이지 확인 — 워킹카피 스토어에 케이블 생성 오버레이가 쌓였는가
    const creates = Object.values(v2WorkingCopyStore.getState().overlays.cables.creates);
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ aPortId: 'p-a', bPortId: 'p-b', categoryId: 'cat1' });

    // 도구는 유지(연속 연결) — 다시 첫 끝점 대기 힌트로 돌아온다
    expect(screen.getByText('자산 클릭으로 포트 선택 · ESC 취소')).toBeTruthy();
  });

  it('ESC — 첫 끝점 확정 후에도 FSM을 idle로 되돌리고 아무것도 스테이지하지 않는다', () => {
    renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    fireEvent.click(screen.getByRole('button', { name: /포트 p-a/ }));
    expect(screen.getByText('두 번째 자산 클릭 · ESC 취소')).toBeTruthy();

    fireEvent.keyDown(window, { code: 'Escape' });

    // armed 힌트/피커가 전부 사라짐 (idle로 복귀) — 부분 상태 잔존 없음
    expect(screen.queryByText('두 번째 자산 클릭 · ESC 취소')).toBeNull();
    expect(screen.queryByText('자산 클릭으로 포트 선택 · ESC 취소')).toBeNull();
    expect(screen.queryAllByText('자산-a')).toHaveLength(0); // 포트 선택 패널 닫힘

    // 케이블 버튼이 더 이상 armed(primary) 표시가 아님 — 재클릭 시 다시 arm 되어야 함
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(screen.getByText('자산 클릭으로 포트 선택 · ESC 취소')).toBeTruthy();

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

    // AddAssetModal(role=dialog)이 열리고 팔레트에서 고른 타입이 미리 선택돼 있어야 한다
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    // 도구바의 타입 Select 에도 같은 값이 있으므로 모달 안으로 범위를 좁힌다.
    expect(within(dialog).getByDisplayValue('배전반')).toBeTruthy();
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

/**
 * RackPlanView — 실제 컴포넌트 + 실제 워킹카피 스토어.
 *
 * 캔버스는 jsdom 에 없으므로 이렇게 다룬다: `getContext`·`ResizeObserver` 는 전역
 * setup(`src/tests/setup.ts`)이 채우고, 픽셀은 단언하지 않는다. jsdom 의 `getBoundingClientRect`
 * 는 늘 (0,0) 이라 처음 뷰포트(100%, pan 0)에서 화면 좌표 = 도면 좌표다.
 *
 * 포인터 캡처는 jsdom 에 없다 — 브라우저에는 다 있으므로 환경에서 채운다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BackgroundDrawing } from '@twin/core';
import { effectiveRows } from '../../../model/store/effective';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { useV2AuthStore } from '../../../store/authStore';
import { RackPlanView } from '../RackPlanView';

vi.mock('../../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return { ...actual, parseBackground: vi.fn() };
});
import { parseBackground } from '../../../api';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({
    data: {
      categories: [], rackTypes: [], equipmentTypes: [], cableTypes: [],
      media: [{ key: 'power', name: '전원', color: '#f00', use: '' }],
      wageStandard: null, overheadStandard: null,
    },
  }),
}));

/* jsdom 에는 PointerEvent 도 없다 — 없으면 좌표·단추·pointerId 가 모두 빠진 맨 Event 가 온다. */
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
HTMLElement.prototype.hasPointerCapture = () => true;

const floor = { id: 'F1', substationId: 'S1', name: '1층', sortOrder: 1, backgroundDrawing: null, backgroundOpacity: 0.5, updatedAt: '' };
const waitingRack = { id: 'R3', substationId: 'S1', name: '통신랙 3', rackTypeId: 't', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' };

const placedRack = { ...waitingRack, id: 'R1', name: '통신랙 1', floorId: 'F1', x: 100, y: 100, width: 60, height: 60, facing: '아래' as const };

beforeEach(() => {
  store.getState().reset();
  useV2AuthStore.setState({ user: { id: 'u1', username: 'u', role: 'viewer' }, isAuthenticated: true } as never);
});

const view = () => render(<RackPlanView substationId="S1" selectedRackId={null} onSelectRack={() => {}} />);
const canvas = () => screen.getByTestId('rackplan-canvas');
const down = (x: number, y: number) => fireEvent.pointerDown(canvas(), { pointerId: 1, button: 0, clientX: x, clientY: y });
const move = (x: number, y: number) => fireEvent.pointerMove(canvas(), { pointerId: 1, button: 0, clientX: x, clientY: y });
const up = (x: number, y: number) => fireEvent.pointerUp(canvas(), { pointerId: 1, button: 0, clientX: x, clientY: y });
const rackR1 = () => effectiveRows(store.getState(), 'racks').find((r) => r.id === 'R1')!;

describe('RackPlanView', () => {
  it('층이 없는 국이면 「층 추가」 안내가 보인다', () => {
    render(<RackPlanView substationId="S1" selectedRackId={null} onSelectRack={() => {}} />);
    expect(screen.getByText('이 변전소에는 층이 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '층 추가' })).toBeInTheDocument();
  });

  it('놓을 랙이 없으면 캔버스 안내가 「현황에서 랙을 먼저 추가」 로 바뀐다', () => {
    store.getState().create('floors', floor);
    view();
    expect(screen.getByText('놓을 랙이 없습니다 — 현황에서 랙을 먼저 추가하세요')).toBeInTheDocument();
    expect(screen.queryByText(/위 「배치」/)).toBeNull();
  });

  it('놓인 랙이 없고 놓을 랙이 있으면 캔버스 가운데 안내가 선다', () => {
    store.getState().create('floors', floor);
    store.getState().create('racks', waitingRack);
    view();
    expect(screen.getByText('아직 놓인 랙이 없습니다 — 위 「배치」에서 랙을 골라 그려 놓으세요')).toBeInTheDocument();
  });

  it('놓인 랙이 있으면 안내가 없다', () => {
    store.getState().create('floors', floor);
    store.getState().create('racks', placedRack);
    view();
    expect(screen.queryByText(/아직 놓인 랙이 없습니다/)).toBeNull();
  });

  it('층 탭의 메뉴 단추는 글자로 「층 관리」 라 읽힌다', () => {
    store.getState().create('floors', floor);
    useV2AuthStore.setState({ user: { id: 'u1', username: 'a', role: 'admin' } } as never);
    view();
    expect(screen.getByRole('button', { name: '층 관리' })).toBeInTheDocument();
  });

  it('대기 랙을 골라 배치를 켜고 그리면 그 층에 놓인다', () => {
    store.getState().create('floors', floor);
    store.getState().create('racks', waitingRack);
    render(<RackPlanView substationId="S1" selectedRackId={null} onSelectRack={() => {}} />);

    fireEvent.change(screen.getByRole('combobox', { name: '배치할 랙' }), { target: { value: 'R3' } });
    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    const canvas = screen.getByTestId('rackplan-canvas');
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 1, button: 0, clientX: 60, clientY: 60 });
    fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, clientX: 60, clientY: 60 });

    const placed = store.getState().overlays.racks.creates.R3!;
    expect(placed.floorId).toBe('F1');
    expect(placed.width).toBeGreaterThan(0);
    expect(placed.height).toBeGreaterThan(0);
  });

  it('놓을 랙이 없으면 Select 자리에 「모든 랙이 놓였습니다」', () => {
    store.getState().create('floors', floor);
    store.getState().create('racks', placedRack);
    view();
    expect(screen.getByText('모든 랙이 놓였습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '배치' })).toBeNull();
  });

  it('그리다 Esc 를 누르면 그리던 것까지 걷힌다', () => {
    store.getState().create('floors', floor);
    store.getState().create('racks', waitingRack);
    view();
    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    down(10, 10);
    move(60, 60);
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    up(60, 60);
    expect(store.getState().overlays.racks.creates.R3!.floorId).toBeNull();
    expect(screen.getByRole('button', { name: '배치' })).not.toHaveClass('bg-primary');
  });

  it('놓인 랙을 누르면 고르고, 끌면 손을 뗄 때 한 번 옮긴다', () => {
    store.getState().create('floors', floor);
    store.getState().create('racks', placedRack);
    const onSelectRack = vi.fn();
    render(<RackPlanView substationId="S1" selectedRackId={null} onSelectRack={onSelectRack} />);

    down(120, 120);
    up(120, 120);
    expect(onSelectRack).toHaveBeenLastCalledWith('R1');

    down(120, 120);
    move(150, 140);
    move(170, 160);
    expect(rackR1().x).toBe(100); // 끄는 동안은 그리기만 한다
    up(170, 160);
    expect(rackR1()).toMatchObject({ x: 150, y: 140, floorId: 'F1' });
  });

  it('다른 포인터의 손은 이 손짓에 끼어들지 못한다', () => {
    store.getState().create('floors', floor);
    store.getState().create('racks', placedRack);
    view();
    down(120, 120);
    move(170, 160);
    fireEvent.pointerUp(canvas(), { pointerId: 2, button: 0, clientX: 300, clientY: 300 });
    up(170, 160);
    expect(rackR1()).toMatchObject({ x: 150, y: 140 });
  });

  it('고른 랙 — 정면을 돌리고, 도면에서 빼면 랙은 남고 대기로 돌아간다', () => {
    store.getState().create('floors', floor);
    store.getState().create('racks', placedRack);
    render(<RackPlanView substationId="S1" selectedRackId="R1" onSelectRack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /정면 돌리기/ }));
    expect(rackR1().facing).toBe('왼쪽');

    fireEvent.click(screen.getByRole('button', { name: '도면에서 빼기' }));
    expect(rackR1()).toMatchObject({ floorId: null, x: null, y: null, width: null, height: null });
    expect(screen.getByRole('combobox', { name: '배치할 랙' })).toHaveValue('R1');
  });
});

describe('RackPlanView — 크기 조절은 같은 손짓 규칙', () => {
  const handle = (key: string) => document.querySelector(`[data-handle="${key}"]`) as HTMLElement;
  const hDown = (x: number, y: number) => fireEvent.pointerDown(handle('br'), { pointerId: 1, button: 0, clientX: x, clientY: y });
  const hMove = (x: number, y: number) => fireEvent.pointerMove(handle('br'), { pointerId: 1, button: 0, clientX: x, clientY: y });
  const hUp = (x: number, y: number) => fireEvent.pointerUp(handle('br'), { pointerId: 1, button: 0, clientX: x, clientY: y });
  const history = () => store.temporal.getState().pastStates.length;

  beforeEach(() => {
    store.getState().create('floors', floor);
    store.getState().create('racks', placedRack);
    render(<RackPlanView substationId="S1" selectedRackId="R1" onSelectRack={() => {}} />);
  });

  it('손잡이를 끌어 놓으면 새 크기로 한 번 쓴다', () => {
    const before = history();
    hDown(160, 160);
    hMove(180, 170);
    hMove(200, 190);
    expect(rackR1().width).toBe(60); // 끄는 동안은 그리기만
    hUp(200, 190);
    expect(rackR1()).toMatchObject({ x: 100, y: 100, width: 100, height: 90 });
    expect(history()).toBe(before + 1);
  });

  it('크기를 바꾸다 Esc 를 누르면 아무것도 바뀌지 않는다', () => {
    const before = history();
    hDown(160, 160);
    hMove(200, 190);
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    hUp(200, 190);
    expect(rackR1()).toMatchObject({ width: 60, height: 60 });
    expect(history()).toBe(before);
  });

  it('창 밖에서 뗀 손은 놓은 것이 아니다', () => {
    const before = history();
    hDown(160, 160);
    hMove(200, 190);
    hUp(5000, 190);
    expect(rackR1()).toMatchObject({ width: 60, height: 60 });
    expect(history()).toBe(before);
  });
});

describe('RackPlanView — 층 따라가기', () => {
  it('고른 랙이 있어도 다른 층 탭을 누르면 그 층에 머문다', () => {
    store.getState().create('floors', floor);
    store.getState().create('floors', { ...floor, id: 'F2', name: '2층', sortOrder: 2 });
    store.getState().create('racks', placedRack);
    render(<RackPlanView substationId="S1" selectedRackId="R1" onSelectRack={() => {}} />);
    expect(screen.getByRole('tab', { name: '1층' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '2층' }));
    expect(screen.getByRole('tab', { name: '2층' })).toHaveAttribute('aria-selected', 'true');
  });
});

const drawing = (fileName: string): BackgroundDrawing => ({
  source: { fileName, importedAt: '2026-08-04T00:00:00.000Z', fileType: 'DWG' },
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  layers: [], paths: [], texts: [], filled: [],
});

describe('RackPlanView — 배경 도면', () => {
  beforeEach(() => {
    vi.mocked(parseBackground).mockReset();
    store.getState().create('floors', floor);
  });
  const menu = () => {
    fireEvent.click(screen.getByRole('button', { name: '도면' }));
    return within(screen.getByRole('menu'));
  };

  it('비관리자에게는 배경 도면 메뉴가 없다', () => {
    view();
    expect(screen.queryByRole('button', { name: '도면' })).toBeNull();
  });

  it('관리자가 파일을 고르면 읽어서 그 층에 얹는다 — 서버로 가는 것은 저장할 때다', async () => {
    useV2AuthStore.setState({ user: { id: 'u1', username: 'u', role: 'admin' } } as never);
    vi.mocked(parseBackground).mockResolvedValue(drawing('plan.dwg'));
    view();
    const input = screen.getByTestId('background-import-input') as HTMLInputElement;
    expect(input.accept).toBe('.dwg,.dxf,.dgn');
    fireEvent.change(input, { target: { files: [new File(['x'], 'plan.dwg')] } });
    await waitFor(() => expect(menu().getByText('배경 제거')).toBeTruthy());
    expect(store.getState().overlays.floors.creates.F1!.backgroundDrawing).toMatchObject({ source: { fileName: 'plan.dwg' } });
  });

  it('배경 농도는 트리 아래 자리에 서고, 바꾸면 층에 쌓인다', () => {
    const rail = document.createElement('div');
    document.body.appendChild(rail);
    act(() => store.getState().update('floors', 'F1', { backgroundDrawing: drawing('plan.dwg') }));
    render(<RackPlanView substationId="S1" selectedRackId={null} onSelectRack={() => {}} railTarget={rail} />);
    const slider = within(rail).getByRole('slider', { name: '배경 농도' });
    const before = store.temporal.getState().pastStates.length;
    fireEvent.change(slider, { target: { value: '70' } });
    fireEvent.change(slider, { target: { value: '80' } });
    expect(store.getState().overlays.floors.creates.F1!.backgroundOpacity).toBe(0.5); // 끄는 동안은 쓰지 않는다
    fireEvent.pointerUp(slider);
    expect(store.getState().overlays.floors.creates.F1!.backgroundOpacity).toBe(0.8);
    expect(store.temporal.getState().pastStates.length).toBe(before + 1);
    rail.remove();
  });
});

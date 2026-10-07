import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkEndRef } from '@twin/core';
import type { Network, NetworkLine } from '../../../model/networkApi';
import { emptyOverlays, workingCopyStore as store } from '../../../model/store/workingCopy';
import { OpticalMapView } from '../OpticalMapView';
import { curvePath } from '../OpticalMap';

/**
 * 광 계통도 — 국 넷(S4 는 범위 밖), 광선로 다섯(S1–S2 두 가닥).
 *   e1(S1) ─ L12 코어 1·2 주 ─ e2(S2)   e1 ─ L12 코어 3·4 예비 ─ e2   ← 같은 광선로 = 이중화 경고
 *   e2 ─ L23 ─ e3(S3)   e1 ─ L13 ─ e3   ← e1·e2·e3 링
 *   e3 ─ L34 ─ e4(S4, 범위 밖)
 * 실데이터(직할)는 주/예비 값이 아직 없어 모두 「주/예비 미지정」이므로 실선·점선·경고는 이 자료로 시험한다.
 */
const SUBS: [string, string, boolean][] = [['S1', '가국S/S', true], ['S2', '나국S/S', true], ['S3', '다국S/S', true], ['S4', '라국S/S', false]];
const nl = (id: string, name: string, a: string, b: string): NetworkLine => ({
  id, name, lengthKm: null, cableTypeId: 'opgw', coreCount: 24,
  aSubstationId: a, aEquipmentId: null, aPanel: null, aStartNo: 1,
  bSubstationId: b, bEquipmentId: null, bPanel: null, bStartNo: 1,
});
const LINES = [nl('L12', '가나1T/L', 'S1', 'S2'), nl('L12b', '가나2T/L', 'S1', 'S2'), nl('L23', '나다T/L', 'S2', 'S3'), nl('L13', '가다T/L', 'S1', 'S3'), nl('L34', '다라T/L', 'S3', 'S4')];
const sub = (l: string, side: 'A' | 'B') => { const x = LINES.find((y) => y.id === l)!; return side === 'A' ? x.aSubstationId : x.bSubstationId; };
const core = (lineId: string, no: number, side: 'A' | 'B'): LinkEndRef => ({ kind: 'core', lineId, no, side });
const eq = (equipmentId: string): LinkEndRef => ({ kind: 'equipment', equipmentId, label: null });
/** 설비 ea ─ 광선로 l 코어 no ─ 설비 eb. */
const via = (l: string, no: number, ea: string, eb: string): Network['links'] => [
  { id: `${l}-${no}-a`, substationId: sub(l, 'A'), a: eq(ea), b: core(l, no, 'A') },
  { id: `${l}-${no}-b`, substationId: sub(l, 'B'), a: core(l, no, 'B'), b: eq(eb) },
];
const ROLES: Record<string, 'main' | 'backup'> = { 'L12:1': 'main', 'L12:2': 'main', 'L12:3': 'backup', 'L12:4': 'backup' };
let server: Network;
function network(lines = LINES): Network {
  return {
    substations: SUBS.map(([id, name, inScope]) => ({ id, name, inScope })),
    lines,
    cores: lines.flatMap((l) => [1, 2, 3, 4].map((no) => ({ lineId: l.id, no, status: 'ok' as const, role: ROLES[`${l.id}:${no}`] ?? null }))),
    links: lines.length === 0 ? [] : [
      ...via('L12', 1, 'e1', 'e2'), ...via('L12', 2, 'e1', 'e2'), ...via('L12', 3, 'e1', 'e2'), ...via('L12', 4, 'e1', 'e2'),
      ...via('L23', 1, 'e2', 'e3'), ...via('L13', 1, 'e1', 'e3'), ...via('L34', 1, 'e3', 'e4'),
    ],
    equipment: [['e1', 'S1'], ['e2', 'S2'], ['e3', 'S3'], ['e4', 'S4']].map(([id, s]) => ({ id: id!, name: `광단말 ${id}`, substationId: s!, typeName: '광단말' })),
  };
}

/* jsdom 에는 PointerEvent 가 없다 — 없으면 pointerId·button 이 사라진 맨 Event 가 온다. 환경을 채운다. */
if (typeof window.PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PE;
}

vi.mock('../../../model/networkApi', () => ({
  useNetwork: () => ({ data: server, isError: false, refetch: () => {} }),
}));

let opened: string[] = [];
const renderMap = () => render(
  <OpticalMapView
    nodeId="BR"
    onOpenStation={(id) => opened.push(`station:${id}`)}
    onOpenLine={(s, b) => opened.push(`line:${s}:${b.lineId}:${b.side}`)}
  />,
);
const overlays = () => [...document.querySelectorAll('[data-overlay]')].map((e) => `${e.getAttribute('data-overlay')}:${e.getAttribute('data-role')}`).sort();
const bundleRow = (text: RegExp) => within(screen.getByTestId('bundle-list')).getAllByRole('button').find((b) => text.test(b.textContent ?? ''))!;

beforeEach(() => {
  server = network();
  opened = [];
  store.getState().reset();
  store.setState({ loaded: [], overlays: emptyOverlays() });
});

describe('광 계통도', () => {
  it('마디 = 국 넷, 간선 = 광선로 다섯 — 범위 밖 국은 흐리게', () => {
    renderMap();
    const map = screen.getByRole('group', { name: '광 계통도' });
    expect(within(map).getAllByRole('button', { name: /현황 보기$/ })).toHaveLength(4);
    expect(within(map).getAllByRole('button', { name: /선번장에서 보기$/ })).toHaveLength(5);
    expect(screen.getAllByTestId('map-line')).toHaveLength(5);
    expect(document.querySelector('[data-station="S4"]')).toHaveAttribute('data-in-scope', 'false');
    expect(document.querySelector('[data-station="S4"]')).toHaveClass('opacity-50');
    expect(document.querySelector('[data-station="S1"]')).toHaveAttribute('data-in-scope', 'true');
    /* 범례는 있는 것만 — 주회선 · 예비회선 · 주/예비 미지정 · 범위 밖 국. */
    expect(screen.getByTestId('map-legend')).toHaveTextContent(/주회선.*예비회선.*주\/예비 미지정.*범위 밖 국/);
    expect(overlays()).toEqual([]);
  });

  it('회선을 선택하면 지나는 광선로를 강조 — 주회선 실선, 예비회선 점선, 여럿 함께', () => {
    renderMap();
    fireEvent.click(bundleRow(/주회선/));
    expect(overlays()).toEqual(['L12:main']);
    expect(document.querySelector('[data-overlay="L12"][data-role="main"]')).not.toHaveAttribute('stroke-dasharray');
    fireEvent.click(bundleRow(/예비회선/));
    expect(overlays()).toEqual(['L12:backup', 'L12:main']);
    expect(document.querySelector('[data-overlay="L12"][data-role="backup"]')).toHaveAttribute('stroke-dasharray');
    fireEvent.click(bundleRow(/라국/));
    expect(overlays()).toEqual(['L12:backup', 'L12:main', 'L34:none']);
    /* 다시 누르면 놓는다. */
    fireEvent.click(bundleRow(/주회선/));
    expect(overlays()).toEqual(['L12:backup', 'L34:none']);
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
    expect(overlays()).toEqual([]);
  });

  it('링을 선택하면 그 링의 회선 전부 — 링 밖(다라) 광선로는 강조하지 않는다', () => {
    renderMap();
    const rows = within(screen.getByTestId('ring-list')).getAllByRole('button');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('가국 광단말 e1 · 나국 광단말 e2 · 다국 광단말 e3');
    expect(rows[0]).toHaveTextContent('회선 4');
    fireEvent.click(rows[0]!);
    expect(overlays()).toEqual(['L12:backup', 'L12:main', 'L13:none', 'L23:none']);
  });

  it('이중화 경고 — 설비 쌍 · 공유 광선로, 누르면 주·예비 둘 다와 공유 광선로를 강조', () => {
    renderMap();
    const rows = within(screen.getByTestId('warning-list')).getAllByRole('button');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('가국 광단말 e1 ↔ 나국 광단말 e2');
    expect(rows[0]).toHaveTextContent('주·예비회선이 같은 광선로를 지납니다 — 가나1T/L');
    fireEvent.click(rows[0]!);
    expect(overlays()).toEqual(['L12:backup', 'L12:main']);
    expect([...document.querySelectorAll('[data-warned]')].map((e) => e.getAttribute('data-warned'))).toEqual(['L12']);
  });

  it('회선 검색 — 설비·국 이름으로 거른다', () => {
    renderMap();
    expect(within(screen.getByTestId('bundle-list')).getAllByRole('button')).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('회선 검색'), { target: { value: '라국' } });
    expect(within(screen.getByTestId('bundle-list')).getAllByRole('button')).toHaveLength(1);
  });

  it('Tab 차례는 국(이름 순) 다음 광선로(이름 순)', () => {
    renderMap();
    const names = within(screen.getByRole('group', { name: '광 계통도' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      '가국S/S 현황 보기', '나국S/S 현황 보기', '다국S/S 현황 보기', '라국S/S (범위 밖) 현황 보기',
      '가나1T/L 선번장에서 보기', '가나2T/L 선번장에서 보기', '가다T/L 선번장에서 보기', '나다T/L 선번장에서 보기', '다라T/L 선번장에서 보기',
    ]);
  });

  it('주/예비가 하나도 지정되지 않으면 이중화 경고는 판정할 수 없다고 말한다 — 0 을 「이상 없음」으로 보이지 않는다', () => {
    for (const k of Object.keys(ROLES)) delete ROLES[k];
    try {
      server = network();
      renderMap();
      const list = screen.getByTestId('warning-list');
      expect(list).toHaveTextContent('주/예비가 지정된 회선이 없어 판정할 수 없습니다');
      expect(list).toHaveTextContent('선번장 코어에 주/예비를 지정하면 나타납니다');
      expect(within(screen.getByTestId('bundle-list')).getAllByRole('button')[0]).toHaveTextContent('주/예비 미지정');
    } finally {
      Object.assign(ROLES, { 'L12:1': 'main', 'L12:2': 'main', 'L12:3': 'backup', 'L12:4': 'backup' });
    }
  });

  it('국을 누르면 그 국 현황, 광선로를 누르면 범위 안 끝 국의 선번장 블록', () => {
    renderMap();
    fireEvent.keyDown(screen.getByRole('button', { name: '나국S/S 현황 보기' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: '다라T/L 선번장에서 보기' }), { key: 'Enter' });
    expect(opened).toEqual(['station:S2', 'line:S3:L34:A']);
  });

  it('누르기와 끌기는 한 손짓 — 문턱을 못 넘고 떼면 누르기, 넘으면 옮기기만', () => {
    renderMap();
    const box = screen.getByTestId('optical-map');
    const node = document.querySelector('[data-station-hit="S1"]')!;
    fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(box, { pointerId: 1, clientX: 11, clientY: 10 });
    expect(opened).toEqual(['station:S1']);
    fireEvent.pointerDown(node, { pointerId: 2, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(box, { pointerId: 2, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(box, { pointerId: 2, clientX: 60, clientY: 40 });
    expect(opened).toEqual(['station:S1']);
    /* 끝 신호를 못 받은 손짓은 다음 누름이 갈음한다 — 판이 막히지 않는다. */
    fireEvent.pointerDown(node, { pointerId: 3, button: 0, clientX: 10, clientY: 10 });
    const s2 = document.querySelector('[data-station-hit="S2"]')!;
    fireEvent.pointerDown(s2, { pointerId: 4, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(box, { pointerId: 4, clientX: 10, clientY: 10 });
    expect(opened).toEqual(['station:S1', 'station:S2']);
  });

  it('광선로가 없으면 빈 상태 한 줄', () => {
    server = network([]);
    renderMap();
    expect(screen.getByText('이 범위에 등록된 광선로가 없습니다')).toBeInTheDocument();
  });

  it('같은 국 쌍의 두 가닥은 서로 반대쪽으로 휜다 — A·B 가 바뀌어도 같은 쪽', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    expect(curvePath({ a: 'S1', b: 'S2', lane: 0, lanes: 1 }, a, b, 0)).toBe('M0 0 L100 0');
    const first = curvePath({ a: 'S1', b: 'S2', lane: 0, lanes: 2 }, a, b, 0);
    const second = curvePath({ a: 'S1', b: 'S2', lane: 1, lanes: 2 }, a, b, 0);
    expect(first).toBe('M0 0 Q50 -16 100 0');
    expect(second).toBe('M0 0 Q50 16 100 0');
    /* 같은 가닥을 B→A 로 적어도 벌림 방향은 국 id 순이 정한다. */
    expect(curvePath({ a: 'S2', b: 'S1', lane: 0, lanes: 2 }, b, a, 0)).toBe('M100 0 Q50 -16 0 0');
  });
});

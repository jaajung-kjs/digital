import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { NODE_VIEW_MODES, useWorkspaceRoute, viewFor, VIEW_MODES } from '../useWorkspaceRoute';

const at = (path: string) =>
  renderHook(() => useWorkspaceRoute(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={children} />
          <Route path="/n/:nodeId" element={children} />
        </Routes>
      </MemoryRouter>
    ),
  });

describe('useWorkspaceRoute', () => {
  it('주소가 보고 있는 자리를 그대로 말한다', () => {
    const { result } = at('/n/sub-1?view=평면도&eq=e1&rack=r1');
    expect(result.current).toMatchObject({ nodeId: 'sub-1', view: '평면도', eqId: 'e1', rackId: 'r1' });
  });

  it('없거나 모르는 판 이름은 첫 판으로 — 주소는 남이 손으로 고칠 수 있다', () => {
    expect(at('/n/sub-1').result.current.view).toBe('현황');
    expect(at('/n/sub-1?view=없는판').result.current.view).toBe('현황');
    expect(at('/n/sub-1?view=계통').result.current.view).toBe('현황');
    expect(at('/n/sub-1?view=설비 대장').result.current.view).toBe('현황');
    expect(at('/n/sub-1?view=설비 현황').result.current.view).toBe('현황');
  });

  it('지사·본부의 판은 현황 · 광 계통도 — 그 노드에 없는 판은 현황으로', () => {
    expect(NODE_VIEW_MODES).toEqual(['현황', '광 계통도']);
    expect(at('/n/br-1?view=광 계통도').result.current.view).toBe('광 계통도');
    expect(viewFor('광 계통도', false)).toBe('광 계통도');
    expect(viewFor('광 계통도', true)).toBe('현황');
    expect(viewFor('선번장', false)).toBe('현황');
    expect(viewFor('선번장', true)).toBe('선번장');
  });

  it('선번장 — 판 차례는 현황 · 선번장 · 전원 계통 · 평면도, 블록 초점은 line·side 가 쥔다', () => {
    expect(VIEW_MODES).toEqual(['현황', '선번장', '전원 계통', '평면도']);
    const { result } = at('/n/sub-1?view=선번장&line=L1&side=B');
    expect(result.current).toMatchObject({ view: '선번장', block: { lineId: 'L1', side: 'B' } });
    act(() => result.current.focusBlock(null));
    expect(result.current.block).toBeNull();
    act(() => result.current.focusBlock({ lineId: 'L2', side: 'A' }));
    expect(result.current.block).toEqual({ lineId: 'L2', side: 'A' });
    expect(at('/n/sub-1?line=L1&side=C').result.current.block).toBeNull();
  });

  it('슬롯에서 블록 열기 — 판·line·side 를 한 번에 쓰고, 고른 설비는 놓는다(12열 표가 우선)', () => {
    const { result } = at('/n/sub-1?view=현황&eq=e1');
    act(() => result.current.openBlock({ lineId: 'L3', side: 'A' }));
    expect(result.current).toMatchObject({ view: '선번장', block: { lineId: 'L3', side: 'A' }, eqId: null, rackId: null });
  });

  it('설비·랙을 고르고 놓는다', () => {
    const { result } = at('/n/sub-1?rack=r1');
    act(() => result.current.selectEquipment('e1'));
    act(() => result.current.selectEquipment(null));
    act(() => result.current.selectRack('r1'));
    act(() => result.current.selectEquipment(null));
    expect(result.current.eqId).toBeNull();
    expect(result.current.rackId).toBe('r1');
    act(() => result.current.selectRack('r2'));
    expect(result.current.rackId).toBe('r2');
  });

  it('판을 바꿔도 고른 설비는 그대로다 — 같은 자리를 다르게 보는 일이다', () => {
    const { result } = at('/n/sub-1?eq=e1');
    act(() => result.current.setView('평면도'));
    expect(result.current.view).toBe('평면도');
    expect(result.current.eqId).toBe('e1');
  });

  it('설비와 랙은 하나만 고른다 — 새로 고르면 다른 쪽은 놓인다', () => {
    const { result } = at('/n/sub-1?eq=e1');
    act(() => result.current.selectRack('r1'));
    expect(result.current).toMatchObject({ eqId: null, rackId: 'r1' });
    act(() => result.current.selectEquipment('e2'));
    expect(result.current).toMatchObject({ eqId: 'e2', rackId: null });
  });

  it('전원 계통 — 보기는 power(기본 대장), 블록은 supply 이고 고르면 그 설비도 상세로(eq)', () => {
    const { result } = at('/n/sub-1?view=전원 계통&rack=r1');
    expect(result.current).toMatchObject({ view: '전원 계통', power: 'ledger', supply: null });
    act(() => result.current.setPowerView('tree'));
    expect(result.current.power).toBe('tree');
    act(() => result.current.selectSupply('d1'));
    expect(result.current).toMatchObject({ supply: 'd1', eqId: 'd1', rackId: null, power: 'tree' });
    act(() => result.current.selectSupply(null));
    expect(result.current).toMatchObject({ supply: null, eqId: 'd1' });
    act(() => result.current.selectSupply('d1'));
    act(() => result.current.selectEquipment('x'));
    expect(result.current).toMatchObject({ supply: null, eqId: 'x' });
    expect(at('/n/sub-1?view=전원 계통&power=zzz').result.current.power).toBe('ledger');
  });

  it('전원 계통을 떠나면 그 판의 보기(power)·블록 초점(supply)은 주소에서 걷힌다 — 고른 설비는 그대로', () => {
    const { result } = at('/n/sub-1?view=전원 계통&power=tree&supply=d1&eq=d1');
    act(() => result.current.setView('현황'));
    expect(result.current).toMatchObject({ view: '현황', power: 'ledger', supply: null, eqId: 'd1' });
    act(() => result.current.setView('전원 계통'));
    expect(result.current).toMatchObject({ power: 'ledger', supply: null });
  });

  it('상세에서 전원 계통으로 — 판·대장·블록·설비를 한 번에 쓰고 기록을 남긴다(뒤로 가면 떠나 온 화면)', () => {
    const { result } = renderHook(() => ({ route: useWorkspaceRoute(), nav: useNavigate() }), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/n/sub-1?view=전원 계통&power=tree&rack=r1&line=L1&side=A']}>
          <Routes><Route path="/n/:nodeId" element={children} /></Routes>
        </MemoryRouter>
      ),
    });
    act(() => result.current.route.openSupply('d1'));
    expect(result.current.route).toMatchObject({ view: '전원 계통', power: 'ledger', supply: 'd1', eqId: 'd1', rackId: null, block: null });
    act(() => result.current.nav(-1));
    expect(result.current.route).toMatchObject({ power: 'tree', supply: null, eqId: null, rackId: 'r1' });
  });

  it('중계경로에서 다른 국·같은 국 블록으로(openBlockAt) — 둘 다 기록을 한 칸씩 쌓고, 뒤로 가면 한 칸씩 돌아온다', () => {
    const { result } = renderHook(() => ({ route: useWorkspaceRoute(), nav: useNavigate() }), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/n/sub-1?view=선번장&line=L1&side=A']}>
          <Routes><Route path="/n/:nodeId" element={children} /></Routes>
        </MemoryRouter>
      ),
    });
    /* 같은 국 — 주소만 바뀐다. */
    act(() => result.current.route.openBlockAt('sub-1', { lineId: 'L2', side: 'B' }));
    expect(result.current.route).toMatchObject({ nodeId: 'sub-1', view: '선번장', block: { lineId: 'L2', side: 'B' } });
    /* 다른 국 — 그 국 주소로 건너간다. */
    act(() => result.current.route.openBlockAt('sub-2', { lineId: 'L3', side: 'A' }));
    expect(result.current.route).toMatchObject({ nodeId: 'sub-2', view: '선번장', block: { lineId: 'L3', side: 'A' } });
    act(() => result.current.nav(-1));
    expect(result.current.route).toMatchObject({ nodeId: 'sub-1', block: { lineId: 'L2', side: 'B' } });
    act(() => result.current.nav(-1));
    expect(result.current.route).toMatchObject({ nodeId: 'sub-1', block: { lineId: 'L1', side: 'A' } });
  });
});

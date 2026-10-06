import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusView } from '../StatusView';

const rows = [
  { id: 'e1', substationId: 'S1', substationName: 'S', rackId: 'r1', rackName: '통신랙', typeName: 'L3 스위치', categoryName: '통신', name: 'L3 #1', status: 'normal', model: null, maker: null, installDate: null, lastInspectedAt: null },
  { id: 'e2', substationId: 'S1', substationName: 'S', rackId: 'r1', rackName: '통신랙', typeName: 'L3 스위치', categoryName: '통신', name: 'L3 #2', status: 'fault', model: null, maker: null, installDate: null, lastInspectedAt: null },
  { id: 'e3', substationId: 'S1', substationName: 'S', rackId: 'r2', rackName: 'UPS#1', typeName: 'UPS', categoryName: '전원', name: 'UPS', status: 'normal', model: null, maker: null, installDate: null, lastInspectedAt: null },
];
const racks = [{ id: 'r1', name: '통신랙', typeName: '19인치 통신랙' }, { id: 'r2', name: 'UPS#1', typeName: 'UPS반' }];

describe('StatusView', () => {
  it('품목별 — 품목마다 대수를 센다(랙은 세지 않는다)', () => {
    render(<StatusView rows={rows} racks={racks} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('L3 스위치').closest('tr')).toHaveTextContent('2');
    expect(screen.queryByText('19인치 통신랙')).toBeNull();
  });

  it('랙별 — 랙 아래 그 랙의 설비', () => {
    render(<StatusView rows={rows} racks={racks} selectedId={null} onSelect={vi.fn()} onSelectRack={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: '랙별' }));
    expect(screen.getByText('UPS#1')).toBeInTheDocument();
    expect(screen.getByText('L3 #1')).toBeInTheDocument();
  });

  it('설비 행을 누르면 그 설비를 고른다', () => {
    const onSelect = vi.fn();
    render(<StatusView rows={rows} racks={racks} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('radio', { name: '랙별' }));
    fireEvent.click(screen.getByText('L3 #2'));
    expect(onSelect).toHaveBeenCalledWith('e2');
  });
});

describe('StatusView 빈 화면·고아 설비', () => {
  it('노드 범위의 빈 표는 「설비 추가」를 권하지 않는다', () => {
    render(<StatusView rows={[]} nodeScope selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('설비가 없습니다')).toBeInTheDocument();
    expect(screen.queryByText(/설비 추가/)).toBeNull();
  });
  it('랙별 — 랙 목록에 없는 랙의 설비는 「랙 없음」 아래', () => {
    render(<StatusView rows={rows} racks={[racks[0]!]} selectedId={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: '랙별' }));
    expect(screen.getByText('랙 없음')).toBeInTheDocument();
    expect(screen.getAllByText('UPS').length).toBeGreaterThan(0);
  });
});

describe('StatusView 도구줄·표 정리', () => {
  it('상태 거르개는 Select 하나다 — 칩이 없고, 고장을 고르면 고장 행만', () => {
    render(<StatusView rows={rows} racks={racks} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /고장/ })).toBeNull();
    const select = screen.getByRole('combobox', { name: '상태' });
    expect(screen.getByRole('option', { name: '상태: 고장 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '상태: 예비 0' })).toBeInTheDocument(); // 0 도 보인다
    fireEvent.change(select, { target: { value: 'fault' } });
    fireEvent.click(screen.getByRole('button', { name: 'L3 스위치 펼치기' }));
    expect(screen.getByText('L3 #2')).toBeInTheDocument();
    expect(screen.queryByText('L3 #1')).toBeNull();
    expect(screen.queryByText('UPS')).toBeNull();
  });

  it('정상은 상태 칸을 비우고, 정상이 아닌 것만 이름을 단다', () => {
    render(<StatusView rows={rows} racks={racks} selectedId={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: '랙별' }));
    const ok = screen.getByText('L3 #1').closest('tr')!;
    const bad = screen.getByText('L3 #2').closest('tr')!;
    expect(ok.querySelectorAll('td')[2]!.textContent).toBe('');
    expect(ok).not.toHaveTextContent('정상');
    expect(bad.querySelectorAll('td')[2]).toHaveTextContent('고장');
  });

  it('값이 하나도 없는 열은 머리글째 없다 — 값이 생기면 나타난다', () => {
    const { rerender } = render(<StatusView rows={rows} racks={racks} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.queryByRole('columnheader', { name: '모델' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: '제조사' })).toBeNull();
    rerender(<StatusView rows={[{ ...rows[0]!, model: 'X-1' }, ...rows.slice(1)]} racks={racks} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: '모델' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '제조사' })).toBeNull();
  });

  it('일체형 — 랙에 같은 이름의 설비 하나뿐이면 랙별에서 행 하나, 누르면 그 설비', () => {
    const onSelect = vi.fn();
    const merged = [{ ...rows[2]!, name: 'UPS#1' }];
    render(<StatusView rows={merged} racks={[racks[1]!]} selectedId={null} onSelect={onSelect} onSelectRack={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: '랙별' }));
    expect(screen.getAllByText('UPS#1')).toHaveLength(1);
    const tr = screen.getByText('UPS#1').closest('tr')!;
    expect(tr).toHaveTextContent('UPS · UPS반');
    fireEvent.click(tr);
    expect(onSelect).toHaveBeenCalledWith('e3');
  });

  it('이름이 다르면 일체형이 아니다 — 랙 행 + 설비 행', () => {
    render(<StatusView rows={[rows[2]!]} racks={[racks[1]!]} selectedId={null} onSelect={vi.fn()} onSelectRack={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: '랙별' }));
    expect(screen.getByText('UPS#1')).toBeInTheDocument();
    expect(screen.getByText('UPS#1').closest('tbody')!.querySelectorAll('tr')).toHaveLength(2);
  });

  it('품목 행의 상태 칸은 정상 아닌 것이 있을 때만 채운다 — 「—」 를 쓰지 않는다', () => {
    render(<StatusView rows={rows} racks={racks} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('UPS').closest('tr')!.querySelectorAll('td')[2]!.textContent).toBe('');
    expect(screen.getByText('L3 스위치').closest('tr')!.querySelectorAll('td')[2]).toHaveTextContent('고장 1');
  });
});

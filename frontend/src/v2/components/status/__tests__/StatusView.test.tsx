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

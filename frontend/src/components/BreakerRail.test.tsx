import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BreakerRail } from './BreakerRail';
import type { FeederCircuit } from '../features/power/feederCircuits';

const mk = (n: number, over: Partial<FeederCircuit> = {}): FeederCircuit => ({
  cbNumber: n, occupied: false, cableId: null, loadAssetId: null, loadName: null,
  capacity: '', switchState: '', spec: '', categoryId: null, ...over,
});
const circuits: FeederCircuit[] = [
  mk(1, { occupied: true, cableId: 'c1', capacity: '20A', switchState: 'ON' }),
  mk(2, { occupied: true, cableId: 'c2', capacity: '20A', switchState: 'OFF' }),
  mk(3),
];

describe('BreakerRail', () => {
  it('점유 차단기는 번호 셀, 빈 자리는 추가(＋) 버튼', () => {
    render(<BreakerRail circuits={circuits} selectedCb={null} onSelect={() => {}} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: '차단기 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '차단기 3 추가' })).toBeInTheDocument();
  });
  it('개폐상태별 클래스 (ON=success 테두리, 빈=dashed 추가버튼)', () => {
    render(<BreakerRail circuits={circuits} selectedCb={null} onSelect={() => {}} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: '차단기 1' }).className).toContain('border-success');
    expect(screen.getByRole('button', { name: '차단기 3 추가' }).className).toContain('border-dashed');
  });
  it('점유 차단기 클릭 → onSelect(번호)', () => {
    const onSelect = vi.fn();
    render(<BreakerRail circuits={circuits} selectedCb={null} onSelect={onSelect} onToggle={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 2' }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
  it('빈 자리 추가(＋) 클릭 → onAddCb', () => {
    const onAddCb = vi.fn();
    render(<BreakerRail circuits={circuits} selectedCb={null} onSelect={() => {}} onToggle={() => {}} onAddCb={onAddCb} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 3 추가' }));
    expect(onAddCb).toHaveBeenCalled();
  });
  it('점유 차단기 토글 클릭 → onToggle(번호), 셀 클릭과 분리(stopPropagation)', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(<BreakerRail circuits={circuits} selectedCb={null} onSelect={onSelect} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 1 개폐' }));
    expect(onToggle).toHaveBeenCalledWith(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('점유 차단기 삭제 클릭 → onDeleteCb(번호, cableId), 셀 클릭과 분리', () => {
    const onSelect = vi.fn();
    const onDeleteCb = vi.fn();
    render(<BreakerRail circuits={circuits} selectedCb={null} onSelect={onSelect} onToggle={() => {}} onDeleteCb={onDeleteCb} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 1 삭제' }));
    expect(onDeleteCb).toHaveBeenCalledWith(1, 'c1');
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('선택된 차단기에 ring', () => {
    render(<BreakerRail circuits={circuits} selectedCb={1} onSelect={() => {}} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: '차단기 1' }).className).toContain('ring-primary');
  });
  it('dimOccupied → 점유 차단기만 흐리게(opacity-40), 빈 칸은 그대로', () => {
    render(<BreakerRail circuits={circuits} selectedCb={null} onSelect={() => {}} onToggle={() => {}} dimOccupied />);
    expect(screen.getByRole('button', { name: '차단기 1' }).className).toContain('opacity-40');
    expect(screen.getByRole('button', { name: '차단기 3 추가' }).className).not.toContain('opacity-40');
  });
});

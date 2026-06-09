import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubstationConnectionsTable } from './SubstationConnectionsView';

const conns = [
  { id: 'c1', source: { equipmentId: 'A', moduleId: null, name: '장비A' }, target: { equipmentId: 'B', moduleId: null, name: '장비B' }, cableType: 'LAN', label: 'L1', length: 3 },
  { id: 'c2', source: { equipmentId: 'C', moduleId: null, name: '장비C' }, target: { equipmentId: 'D', moduleId: null, name: '장비D' }, cableType: 'DC', label: null, length: null },
] as any;
const noop = { onDelete: vi.fn(), onUpdate: vi.fn(), onSelectAsset: vi.fn() };

describe('SubstationConnectionsTable', () => {
  it('전체 연결 렌더', () => {
    render(<SubstationConnectionsTable connections={conns} typeFilter="" {...noop} />);
    expect(screen.getByText('장비A')).toBeInTheDocument();
    expect(screen.getByText('장비D')).toBeInTheDocument();
  });
  it('유형 필터 적용', () => {
    render(<SubstationConnectionsTable connections={conns} typeFilter="LAN" {...noop} />);
    expect(screen.getByText('장비A')).toBeInTheDocument();
    expect(screen.queryByText('장비C')).not.toBeInTheDocument();
  });
  it('유형 변경 → onUpdate', () => {
    const onUpdate = vi.fn();
    render(<SubstationConnectionsTable connections={[conns[0]]} typeFilter="" {...noop} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText('유형'), { target: { value: 'DC' } });
    expect(onUpdate).toHaveBeenCalledWith('c1', { cableType: 'DC' });
  });
});

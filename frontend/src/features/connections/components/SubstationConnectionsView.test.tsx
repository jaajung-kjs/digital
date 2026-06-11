import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubstationConnectionsTable } from './SubstationConnectionsView';

const conns = [
  { id: 'c1', source: { assetId: 'A', name: '장비A' }, target: { assetId: 'B', name: '장비B' }, cableType: 'LAN', label: 'L1', totalLength: 1234 },
  { id: 'c2', source: { assetId: 'C', name: '장비C' }, target: { assetId: 'D', name: '장비D' }, cableType: 'DC', label: null, totalLength: null },
] as any;
const noop = { onDelete: vi.fn(), onUpdate: vi.fn(), onSelectAsset: vi.fn() };

describe('SubstationConnectionsTable', () => {
  it('전체 연결 렌더', () => {
    render(<SubstationConnectionsTable connections={conns} typeFilter="" {...noop} />);
    expect(screen.getByText('장비A')).toBeInTheDocument();
    expect(screen.getByText('장비D')).toBeInTheDocument();
  });
  it('길이를 cm→m 로 환산해 표시 (totalLength 1234cm → 12.3m), 없으면 -', () => {
    render(<SubstationConnectionsTable connections={conns} typeFilter="" {...noop} />);
    expect(screen.getByText('12.3m')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
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

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PortGrid } from './PortGrid';
import type { SlotPort } from '../features/fiber/slotPorts';

const ports: SlotPort[] = [
  { coreNumber: 1, state: 'empty', localCableId: null, remoteCableId: null, localAssetId: null, remoteAssetId: null },
  { coreNumber: 2, state: 'half', localCableId: 'c2', remoteCableId: null, localAssetId: 'e2', remoteAssetId: null },
  { coreNumber: 3, state: 'full', localCableId: 'c3', remoteCableId: 'r3', localAssetId: 'e3', remoteAssetId: 'r3e' },
];

describe('PortGrid', () => {
  it('포트 수만큼 번호 셀을 렌더한다', () => {
    render(<PortGrid ports={ports} selectedCore={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /포트 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /포트 3/ })).toBeInTheDocument();
  });

  it('상태별 배경색 클래스를 입힌다', () => {
    render(<PortGrid ports={ports} selectedCore={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /포트 2/ }).className).toContain('bg-warning-bg');
    expect(screen.getByRole('button', { name: /포트 3/ }).className).toContain('bg-success-bg');
  });

  it('선택된 포트에 ring 강조', () => {
    render(<PortGrid ports={ports} selectedCore={3} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /포트 3/ }).className).toContain('ring-primary');
  });

  it('포트 클릭 → onSelect(coreNumber)', () => {
    const onSelect = vi.fn();
    render(<PortGrid ports={ports} selectedCore={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /포트 2/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

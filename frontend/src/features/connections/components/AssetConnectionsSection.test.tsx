import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetConnectionsSection } from './AssetConnectionsSection';

const conns = [
  { id: 'c1', source: { assetId: 'A', name: '장비A' },
    target: { assetId: 'B', name: '장비B' }, cableType: 'LAN', label: 'L1', totalLength: 540 },
] as any;
const noop = { onDelete: vi.fn(), onUpdate: vi.fn(), onSelectAsset: vi.fn() };

describe('AssetConnectionsSection', () => {
  it('상대(target) 이름·유형 표시 — 이 자산이 source(A)', () => {
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} />);
    expect(screen.getByText(/장비B/)).toBeInTheDocument();
    expect((screen.getByLabelText('유형') as HTMLSelectElement).value).toBe('LAN');
    expect(screen.getByText('5.4m')).toBeInTheDocument(); // 540cm → 5.4m
  });
  it('상대 이름 클릭 → onSelectAsset(상대 id)', () => {
    const onSelectAsset = vi.fn();
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} onSelectAsset={onSelectAsset} />);
    fireEvent.click(screen.getByText(/장비B/));
    expect(onSelectAsset).toHaveBeenCalledWith('B');
  });
  it('삭제 → onDelete(cableId)', () => {
    const onDelete = vi.fn();
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('연결 삭제'));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });
  it('유형 변경 → onUpdate(cableType)', () => {
    const onUpdate = vi.fn();
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText('유형'), { target: { value: 'DC' } });
    expect(onUpdate).toHaveBeenCalledWith('c1', { cableType: 'DC' });
  });
  it('라벨 변경(blur) → onUpdate(label)', () => {
    const onUpdate = vi.fn();
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} onUpdate={onUpdate} />);
    const input = screen.getByLabelText('라벨') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'L2' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith('c1', { label: 'L2' });
  });
});

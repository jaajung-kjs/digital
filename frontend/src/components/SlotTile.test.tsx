import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotTile } from './SlotTile';

describe('SlotTile', () => {
  it('title/subtitle 표시 + onClick', () => {
    const onClick = vi.fn();
    render(<SlotTile title="원주S/S - 홍천S/S" subtitle="24코어" onClick={onClick} />);
    expect(screen.getByText('원주S/S - 홍천S/S')).toBeInTheDocument();
    expect(screen.getByText('24코어')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
  it('onDelete 는 stopPropagation(타일 클릭 미발생)', () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    render(<SlotTile title="t" onClick={onClick} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /삭제/ }));
    expect(onDelete).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
  it('empty 상태: 점선 타일', () => {
    render(<SlotTile state="empty" title="+ 슬롯 추가" onClick={() => {}} />);
    expect(screen.getByText('+ 슬롯 추가')).toBeInTheDocument();
  });
});

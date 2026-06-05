import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetLifecycleView } from './AssetLifecycleView';

const today = new Date('2026-06-05T00:00:00Z');

describe('AssetLifecycleView', () => {
  it('readOnly: 만료된 하자보수는 만료 배지', () => {
    render(<AssetLifecycleView asset={{ warrantyUntil: '2020-01-01', replaceDue: null }} today={today} readOnly />);
    expect(screen.getByText(/하자보수 만료/)).toBeInTheDocument();
  });
  it('editable: 교체예정 변경 시 onChange', () => {
    const onChange = vi.fn();
    render(<AssetLifecycleView asset={{ warrantyUntil: null, replaceDue: null }} today={today} readOnly={false} onChange={onChange} />);
    const input = screen.getByLabelText('교체예정') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2027-01-01' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ replaceDue: '2027-01-01' });
  });
});

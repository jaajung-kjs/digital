import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetAttributesView } from './AssetAttributesView';

const fields = [
  { key: 'model', label: '모델', type: 'text' as const },
  { key: 'op', label: '운용', type: 'select' as const, options: ['운영', '예비'] },
];

describe('AssetAttributesView', () => {
  it('readOnly: 라벨+값 표시', () => {
    render(<AssetAttributesView fields={fields} attributes={{ model: 'X100', op: '운영' }} readOnly />);
    expect(screen.getByText('모델')).toBeInTheDocument();
    expect(screen.getByText('X100')).toBeInTheDocument();
    expect(screen.getByText('운영')).toBeInTheDocument();
  });
  it('readOnly: 빈 값은 - 표시', () => {
    render(<AssetAttributesView fields={fields} attributes={null} readOnly />);
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });
  it('editable: 텍스트 변경 시 onChange(key,value)', () => {
    const onChange = vi.fn();
    render(<AssetAttributesView fields={fields} attributes={{}} readOnly={false} onChange={onChange} />);
    const input = screen.getByLabelText('모델') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Y200' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('model', 'Y200');
  });
  it('editable: select 변경 시 onChange', () => {
    const onChange = vi.fn();
    render(<AssetAttributesView fields={fields} attributes={{}} readOnly={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('운용'), { target: { value: '예비' } });
    expect(onChange).toHaveBeenCalledWith('op', '예비');
  });
});

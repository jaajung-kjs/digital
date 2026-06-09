import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AssetInspector } from './AssetInspector';

const asset = {
  id: 'a1', substationId: 's1', assetTypeId: 't1',
  assetType: { fieldTemplate: [{ key: 'model', label: '모델', type: 'text' }] },
  name: '장비1', attributes: { model: 'X' }, installDate: null, manager: null, status: null,
  warrantyUntil: null, replaceDue: null, floorId: null, updatedAt: '2026-06-05T00:00:00.000Z',
} as any;
const today = new Date('2026-06-05T00:00:00Z');
const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('AssetInspector', () => {
  it('edit 모드: 속성 변경 → onPatch', () => {
    const onPatch = vi.fn();
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={onPatch} onSelectAsset={vi.fn()} today={today} />);
    const input = screen.getByLabelText('모델') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Y' } });
    fireEvent.blur(input);
    expect(onPatch).toHaveBeenCalledWith('a1', { attributes: { model: 'Y' } });
  });
  it('view 모드: "대장에서 편집" → onGotoRegister', () => {
    const onGotoRegister = vi.fn();
    wrap(<AssetInspector asset={asset} mode="view" onSelectAsset={vi.fn()} onGotoRegister={onGotoRegister} today={today} />);
    fireEvent.click(screen.getByText('대장에서 편집'));
    expect(onGotoRegister).toHaveBeenCalledWith('a1');
  });
});

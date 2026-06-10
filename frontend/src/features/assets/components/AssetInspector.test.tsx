import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AssetInspector } from './AssetInspector';

const asset = {
  id: 'a1', substationId: 's1', assetTypeId: 't1',
  assetType: { name: '랙', placementKind: 'RACK', fieldTemplate: [{ key: 'model', label: '모델', type: 'text' }] },
  name: '장비1', attributes: { model: 'X' }, installDate: null, manager: null, status: '운영중',
  description: '비고 메모', warrantyUntil: null, replaceDue: null, floorId: null, updatedAt: '2026-06-05T00:00:00.000Z',
} as any;
const today = new Date('2026-06-05T00:00:00Z');
const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('AssetInspector — 단일 인스펙터(SSOT)', () => {
  it('핵심 필드를 모두 렌더: 종류(읽기전용)/상태/설명/속성/사진/유지보수/연결', () => {
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={vi.fn()} onSelectAsset={vi.fn()} today={today} />);
    // 종류 — 읽기전용 라벨 + 값
    expect(screen.getByText('종류')).toBeTruthy();
    expect(screen.getAllByText('랙').length).toBeGreaterThan(0);
    // 상태/설명/속성(커스텀) 편집 인풋
    expect(screen.getByLabelText('모델')).toBeTruthy();
    // 접이식 섹션 — 사진/유지보수/연결
    expect(screen.getByText('사진')).toBeTruthy();
    expect(screen.getByText('유지보수')).toBeTruthy();
    expect(screen.getByText('연결')).toBeTruthy();
  });

  it('edit 모드: 설명 변경 → onPatch({ description })', () => {
    const onPatch = vi.fn();
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={onPatch} onSelectAsset={vi.fn()} today={today} />);
    const desc = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: '수정된 메모' } });
    fireEvent.blur(desc);
    expect(onPatch).toHaveBeenCalledWith('a1', { description: '수정된 메모' });
  });

  it('edit 모드: 속성 변경 → onPatch({ attributes })', () => {
    const onPatch = vi.fn();
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={onPatch} onSelectAsset={vi.fn()} today={today} />);
    const input = screen.getByLabelText('모델') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Y' } });
    fireEvent.blur(input);
    expect(onPatch).toHaveBeenCalledWith('a1', { attributes: { model: 'Y' } });
  });

  it('view 모드: 읽기전용 — 편집 인풋 없음, 값은 표시', () => {
    wrap(<AssetInspector asset={asset} mode="view" onSelectAsset={vi.fn()} today={today} />);
    expect(screen.queryByLabelText('모델')).toBeNull();
    expect(screen.getByText('비고 메모')).toBeTruthy();  // 설명 읽기전용 표시
    expect(screen.getByText('운영중')).toBeTruthy();      // 상태 읽기전용 표시
  });
});

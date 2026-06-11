import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AssetInspector } from './AssetInspector';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';

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
  it('핵심 필드를 모두 렌더: 종류(읽기전용)/설명/사진/유지보수/연결 — 속성 UI 없음(#7)', () => {
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={vi.fn()} onSelectAsset={vi.fn()} today={today} />);
    // 종류 — 읽기전용 라벨 + 값
    expect(screen.getByText('종류')).toBeTruthy();
    expect(screen.getAllByText('랙').length).toBeGreaterThan(0);
    // #7: 커스텀 속성(모델 등) 입력/속성 섹션은 더 이상 렌더되지 않는다.
    expect(screen.queryByLabelText('모델')).toBeNull();
    expect(screen.queryByText('속성')).toBeNull();
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

  it('view 모드: 읽기전용 — 편집 인풋 없음, 값은 표시', () => {
    wrap(<AssetInspector asset={asset} mode="view" onSelectAsset={vi.fn()} today={today} />);
    expect(screen.queryByLabelText('모델')).toBeNull();
    expect(screen.getByText('비고 메모')).toBeTruthy();  // 설명 읽기전용 표시
    expect(screen.getByText('ON')).toBeTruthy();           // 상태 = ON/OFF 뱃지(기본 ON)
  });
});

describe('AssetInspector — 랙 모듈(통합 패널)', () => {
  // 상위 랙 자산을 working copy 에 seed → breadcrumb 라벨(← 랙01) 해석.
  beforeEach(() => {
    const empty = { creates: {}, updates: {}, deletes: [] };
    useSubstationWorkingCopy.setState({
      saved: {
        assets: [{ id: 'rack1', name: '랙01' }],
        cables: [], fiberPaths: [],
      },
      overlays: {
        assets: { ...empty }, cables: { ...empty },
        fiberPaths: { ...empty },
      },
    } as never);
  });

  const moduleAsset = {
    id: 'm1', substationId: 's1', assetTypeId: 'cat1',
    assetType: { name: '광패치', placementKind: null, fieldTemplate: [] },
    name: '모듈1', parentAssetId: 'rack1', slotIndex: 2, slotSpan: 2,
    attributes: {}, installDate: null, manager: null, status: '운영중',
    description: '', warrantyUntil: null, replaceDue: null, floorId: null, updatedAt: '',
  } as never;

  it('모듈: 카테고리·슬롯 위치(읽기전용) + 랙으로 breadcrumb 렌더, 종류 라벨 없음', () => {
    wrap(<AssetInspector asset={moduleAsset} mode="edit" onPatch={vi.fn()} onSelectAsset={vi.fn()} today={today} />);
    expect(screen.getByText('카테고리')).toBeTruthy();
    expect(screen.getByText('슬롯 위치')).toBeTruthy();
    // 슬롯 3–4 (slotIndex 2 → 1-based 3), span 2
    expect(screen.getByText('슬롯 3–4 (2슬롯)')).toBeTruthy();
    // 종류는 모듈에서 카테고리로 대체 → '종류' 라벨 없음
    expect(screen.queryByText('종류')).toBeNull();
    // 랙으로 breadcrumb
    expect(screen.getByText('← 랙01')).toBeTruthy();
  });

  it('모듈: breadcrumb 클릭 → onSelectAsset(상위 랙 id)', () => {
    const onSelectAsset = vi.fn();
    wrap(<AssetInspector asset={moduleAsset} mode="edit" onPatch={vi.fn()} onSelectAsset={onSelectAsset} today={today} />);
    fireEvent.click(screen.getByText('← 랙01'));
    expect(onSelectAsset).toHaveBeenCalledWith('rack1');
  });

  it('모듈: 이름 편집 → onPatch(통합 overlay 스테이징과 동일 경로)', () => {
    const onPatch = vi.fn();
    wrap(<AssetInspector asset={moduleAsset} mode="edit" onPatch={onPatch} onSelectAsset={vi.fn()} today={today} />);
    const nameInput = screen.getByDisplayValue('모듈1') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '모듈A' } });
    fireEvent.blur(nameInput);
    expect(onPatch).toHaveBeenCalledWith('m1', { name: '모듈A' });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// 공유 선택은 Zustand selectionStore 백킹(useSelection) — 테스트는 setter 를 스파이로 주입.
let selectionState: { selectedAssetId: string | null; setSelectedAssetId: (id: string | null) => void } = {
  selectedAssetId: null,
  setSelectedAssetId: () => {},
};
vi.mock('../../workspace/SelectionContext', () => ({
  useSelection: () => selectionState,
}));

vi.mock('../../../hooks/useNodeAssets', () => ({
  useNodeAssets: () => ({ data: [
    { id: 'a1', name: '랙01', assetTypeName: '랙', substationId: 's1', substationName: '춘천S/S', floorId: 'f1', floorName: '통신실', roomText: null, installDate: '2024-01-01', manager: '홍길동', status: '정상', lastMaintenanceDate: null },
    { id: 'a2', name: 'OFD-7', assetTypeName: 'OFD', substationId: 's1', substationName: '춘천S/S', floorId: null, floorName: null, roomText: '배전실', installDate: null, manager: null, status: null, lastMaintenanceDate: '2026-05-01' },
  ] }),
}));
// 본부·사업소 인스펙터는 useAsset 으로 페치 — 테스트에선 미해결(로딩) 상태로 둔다.
vi.mock('../hooks/useAsset', () => ({ useAsset: () => ({ data: undefined }) }));
import { NodeStatusView } from './NodeStatusView';

function renderView(onSelect: (id: string | null) => void, selectedAssetId: string | null = null) {
  selectionState = { selectedAssetId, setSelectedAssetId: onSelect };
  return render(
    <MemoryRouter>
      <NodeStatusView nodeType="substation" nodeId="s1" />
    </MemoryRouter>,
  );
}

describe('NodeStatusView', () => {
  it('컬럼 헤더 + 설치장소 + 검색 + 행 클릭', () => {
    const onSelect = vi.fn();
    renderView(onSelect);

    // 1. headers present
    for (const h of ['종류', '이름', '설치장소', '설치일', '담당자', '마지막 점검일', '상태']) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }

    // 2. installLocation
    expect(screen.getByText('춘천S/S 통신실')).toBeInTheDocument();

    // 3. search filters out OFD-7
    expect(screen.getByText('OFD-7')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('이름 검색'), { target: { value: '랙' } });
    expect(screen.queryByText('OFD-7')).not.toBeInTheDocument();
    expect(screen.getByText('랙01')).toBeInTheDocument();

    // 4. click row → onSelect('a1')
    fireEvent.click(screen.getByText('랙01'));
    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('컬럼 헤더 클릭 → 3-state 정렬(오름차순→내림차순→취소) + 컬럼 전환', () => {
    const onSelect = vi.fn();
    renderView(onSelect);

    const names = () => screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td:nth-child(2)')?.textContent?.trim());
    // 원본(머지) 순서. 정렬 전 기준.
    const original = names();

    // '이름' 헤더 1클릭 → 오름차순(localeCompare ko): OFD-7 < 랙01.
    fireEvent.click(screen.getByRole('button', { name: '이름 정렬' }));
    const asc = names();
    expect(asc).toEqual([...asc].sort((a, b) => (a ?? '').localeCompare(b ?? '', 'ko')));

    // 2클릭 → 내림차순(asc 의 역순).
    fireEvent.click(screen.getByRole('button', { name: '이름 정렬' }));
    expect(names()).toEqual([...asc].reverse());

    // 3클릭 → 취소(원본 순서 복원).
    fireEvent.click(screen.getByRole('button', { name: '이름 정렬' }));
    expect(names()).toEqual(original);

    // 다른 컬럼('마지막 점검일') 클릭 → 그 컬럼 오름차순으로 전환.
    // a1 점검일 null(뒤로), a2='2026-05-01' → OFD-7 먼저, 랙01(null) 뒤.
    fireEvent.click(screen.getByRole('button', { name: '마지막 점검일 정렬' }));
    expect(names()).toEqual(['OFD-7', '랙01']);
  });

  it('요약 칩 클릭 → 종류 필터(전체 클릭 시 해제)', () => {
    const onSelect = vi.fn();
    renderView(onSelect);

    // 두 자산 모두 보임
    expect(screen.getByText('랙01')).toBeInTheDocument();
    expect(screen.getByText('OFD-7')).toBeInTheDocument();

    // 'OFD' 칩 클릭 → OFD 만 남음
    fireEvent.click(screen.getByText(/^OFD 1$/));
    expect(screen.queryByText('랙01')).not.toBeInTheDocument();
    expect(screen.getByText('OFD-7')).toBeInTheDocument();

    // '전체' 클릭 → 필터 해제
    fireEvent.click(screen.getByText(/전체 2/));
    expect(screen.getByText('랙01')).toBeInTheDocument();
    expect(screen.getByText('OFD-7')).toBeInTheDocument();
  });
});

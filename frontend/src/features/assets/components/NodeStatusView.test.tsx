import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SelectionContext } from '../../workspace/SelectionContext';

vi.mock('../../../hooks/useNodeAssets', () => ({
  useNodeAssets: () => ({ data: [
    { id: 'a1', name: '랙01', assetTypeName: '랙', assetTypeColor: '#111', substationId: 's1', substationName: '춘천S/S', floorId: 'f1', floorName: '통신실', roomText: null, installDate: '2024-01-01', manager: '홍길동', status: '정상', warrantyUntil: null, replaceDue: null, lastMaintenanceDate: null },
    { id: 'a2', name: 'OFD-7', assetTypeName: 'OFD', assetTypeColor: '#222', substationId: 's1', substationName: '춘천S/S', floorId: null, floorName: null, roomText: '배전실', installDate: null, manager: null, status: null, warrantyUntil: null, replaceDue: null, lastMaintenanceDate: '2026-05-01' },
  ] }),
}));
import { NodeStatusView } from './NodeStatusView';

function renderView(onSelect: (id: string | null) => void) {
  return render(
    <MemoryRouter>
      <SelectionContext.Provider value={{ selectedAssetId: null, setSelectedAssetId: onSelect }}>
        <NodeStatusView nodeType="substation" nodeId="s1" />
      </SelectionContext.Provider>
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
});

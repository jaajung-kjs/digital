import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #7: 커스텀 속성(attributes) UI 제거 — InfoTab 은 name/manager/installDate/description 만 편집.
const stageAssetUpdate = vi.fn();
vi.mock('../../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: (sel: (s: unknown) => unknown) =>
    sel({ stageAssetUpdate }),
}));
vi.mock('../../../workingCopy/hooks', () => ({ useEffectiveAssets: () => [] }));

import { InfoTab } from './InfoTab';

const equipment = { id: 'e1', name: '랙01', manager: null, description: null, installDate: null } as never;
const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('InfoTab — 기본 정보 편집(속성 UI 없음)', () => {
  beforeEach(() => { stageAssetUpdate.mockClear(); });

  it('수정 → 적용: stageAssetUpdate 로 name/manager/description 스테이징, 속성 입력 없음', () => {
    wrap(<InfoTab equipment={equipment} />);
    fireEvent.click(screen.getByText('수정'));

    // 속성(모델 등) 인라인 입력은 더 이상 렌더되지 않는다.
    expect(screen.queryByLabelText('모델')).toBeNull();
    expect(screen.queryByText('속성')).toBeNull();

    fireEvent.click(screen.getByText('적용'));
    expect(stageAssetUpdate).toHaveBeenCalledWith('e1', expect.objectContaining({ name: '랙01' }));
  });
});

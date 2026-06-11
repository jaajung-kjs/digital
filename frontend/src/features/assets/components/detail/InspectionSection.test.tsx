import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../utils/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
import { api } from '../../../../utils/api';

// 관리자 토글 가능하게 mock
let admin = true;
vi.mock('../../../../stores/authStore', () => ({
  useIsAdmin: () => admin,
}));

import { InspectionSection } from './InspectionSection';

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('InspectionSection — 점검(#5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admin = true;
  });

  it('최근 점검일 강조 + 목록(날짜·점검자·내용) 렌더', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [
        { id: 'i1', assetId: 'a1', inspectionDate: '2026-06-01', inspector: '홍길동', content: '이상 없음' },
      ] },
    });
    wrap(<InspectionSection assetId="a1" />);
    await waitFor(() => expect(screen.getByText('홍길동')).toBeTruthy());
    expect(screen.getByText(/최근 점검일/)).toBeTruthy();
    expect(screen.getByText('이상 없음')).toBeTruthy();
  });

  it('관리자: + 점검 추가 → 폼 작성 → POST', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: [] } });
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'new' } } });
    wrap(<InspectionSection assetId="a1" />);
    await waitFor(() => expect(screen.getByText('점검 이력이 없습니다.')).toBeTruthy());
    fireEvent.click(screen.getByText('+ 점검 추가'));
    fireEvent.change(screen.getByLabelText('점검자'), { target: { value: '김점검' } });
    fireEvent.click(screen.getByText('점검 등록'));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/assets/a1/inspections');
    expect(body.inspector).toBe('김점검');
  });

  it('비관리자: 추가 버튼 없음(읽기 전용)', async () => {
    admin = false;
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: [] } });
    wrap(<InspectionSection assetId="a1" />);
    await waitFor(() => expect(screen.getByText('점검 이력이 없습니다.')).toBeTruthy());
    expect(screen.queryByText('+ 점검 추가')).toBeNull();
  });
});

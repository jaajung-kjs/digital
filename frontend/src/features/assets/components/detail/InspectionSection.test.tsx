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
import { useSubstationWorkingCopy, type AssetRecord } from '../../../workingCopy/substationStore';
import { INSPECTIONS } from '../../../workingCopy/recordTypes';

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

/** 워킹카피 saved.records 를 시드(점검은 자산 소유 레코드 — 단일 records 컬렉션, recordType='inspections'). */
function seedInspections(rows: Array<Omit<AssetRecord, 'recordType'>>) {
  const records = rows.map((r) => ({ ...r, recordType: INSPECTIONS }));
  useSubstationWorkingCopy.setState((s) => ({ saved: { ...s.saved, records } }));
  useSubstationWorkingCopy.getState().revert(); // 새 saved 기준으로 overlay fresh
}

describe('InspectionSection — 점검(git-like 스테이징, 워킹카피)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admin = true;
    seedInspections([]); // saved + 오버레이 모두 비우기
  });

  it('이력 목록(날짜·점검자·내용)을 누적 표시', async () => {
    seedInspections([
      { id: 'i1', assetId: 'a1', inspectionDate: '2026-06-01', inspector: '홍길동', content: '이상 없음' },
    ]);
    wrap(<InspectionSection assetId="a1" />);
    await waitFor(() => expect(screen.getByText('홍길동')).toBeTruthy());
    expect(screen.getByText('점검 이력')).toBeTruthy();
    expect(screen.getByText('이상 없음')).toBeTruthy();
  });

  it('작성 시 즉시 POST 가 아니라 워킹카피(substationStore) 오버레이에 staging — git-like 단일 SAVE', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: [] } });
    wrap(<InspectionSection assetId="a1" />);
    await waitFor(() => expect(screen.getByText('아직 기록된 점검이 없습니다.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('점검자'), { target: { value: '김점검' } });
    fireEvent.click(screen.getByText('점검 추가'));
    // 즉시 백엔드로 가지 않는다 — substationStore records 오버레이에만 쌓인다.
    expect(api.post).not.toHaveBeenCalled();
    const creates = Object.values(useSubstationWorkingCopy.getState().overlays.records.creates) as Array<{ assetId: string; inspector: string; recordType: string }>;
    expect(creates).toHaveLength(1);
    expect(creates[0].assetId).toBe('a1');
    expect(creates[0].recordType).toBe(INSPECTIONS);
    expect(creates[0].inspector).toBe('김점검');
    // 목록에 '저장 대기'로 노출.
    expect(screen.getByText('김점검')).toBeTruthy();
    expect(screen.getByText('저장 대기')).toBeTruthy();
  });

  it('비관리자: 작성 폼 없음(읽기 전용)', async () => {
    admin = false;
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: [] } });
    wrap(<InspectionSection assetId="a1" />);
    await waitFor(() => expect(screen.getByText('아직 기록된 점검이 없습니다.')).toBeTruthy());
    expect(screen.queryByLabelText('점검자')).toBeNull();
    expect(screen.queryByText('점검 추가')).toBeNull();
  });
});

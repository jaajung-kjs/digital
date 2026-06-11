import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../utils/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));

import { LogsTab } from './LogsTab';
import { useEditorStore } from '../../../editor/stores/editorStore';

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

// temp id → useMaintenanceLogs disabled(백엔드 호출 없음), 로컬 보류 큐만 사용.
const TEMP = 'temp-eq1';

describe('LogsTab — 고장이력(#6)', () => {
  beforeEach(() => {
    useEditorStore.setState({ pendingLogs: [] } as never);
  });

  it('유형 드롭다운에 점검(MAINTENANCE) 옵션이 없다 — 고장/수리만', () => {
    wrap(<LogsTab equipmentId={TEMP} />);
    fireEvent.click(screen.getByText('+ 이력 추가'));
    const typeSelect = screen.getByLabelText('유형') as HTMLSelectElement;
    const options = Array.from(typeSelect.options).map((o) => o.text);
    expect(options).toEqual(['고장', '수리']);
    expect(options).not.toContain('점검');
    // 기본값 FAILURE
    expect(typeSelect.value).toBe('FAILURE');
  });

  it('빈 상태 문구는 고장 이력 기준', () => {
    wrap(<LogsTab equipmentId={TEMP} />);
    expect(screen.getByText('고장 이력이 없습니다.')).toBeTruthy();
  });

  it('readOnly: 추가 버튼 없음', () => {
    wrap(<LogsTab equipmentId={TEMP} readOnly />);
    expect(screen.queryByText('+ 이력 추가')).toBeNull();
  });
});

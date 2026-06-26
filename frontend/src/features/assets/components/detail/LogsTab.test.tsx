import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../utils/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { LogsTab } from './LogsTab';

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

// 실 id → useMaintenanceLogs 활성(빈 목록). 작성 폼은 항상 노출(토글 없음).
const EQ = 'eq1';

describe('LogsTab — 고장이력(#6)', () => {
  it('유형 드롭다운에 점검(MAINTENANCE) 옵션이 없다 — 고장/수리만, 기본 FAILURE', async () => {
    wrap(<LogsTab assetId={EQ} />);
    const typeSelect = (await screen.findByLabelText('유형')) as HTMLSelectElement;
    const options = Array.from(typeSelect.options).map((o) => o.text);
    expect(options).toEqual(['고장', '수리']);
    expect(options).not.toContain('점검');
    expect(typeSelect.value).toBe('FAILURE');
  });

  it('빈 상태 문구는 고장 이력 기준(한 곳에서만)', async () => {
    wrap(<LogsTab assetId={EQ} />);
    expect(await screen.findByText('기록된 고장 이력이 없습니다.')).toBeTruthy();
  });

  it('readOnly: 작성 폼 없음', async () => {
    wrap(<LogsTab assetId={EQ} readOnly />);
    await screen.findByText('기록된 고장 이력이 없습니다.');
    expect(screen.queryByLabelText('유형')).toBeNull();
    expect(screen.queryByText('고장 등록')).toBeNull();
  });
});

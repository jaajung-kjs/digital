import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { put, patch, remove, generateTempId } = vi.hoisted(() => ({
  put: vi.fn(), patch: vi.fn(), remove: vi.fn(), generateTempId: vi.fn(() => 'tmp-out'),
}));

const SLOT = 'slotA';
const TWIN = 'slotB';
const SLOT_ASSET = { id: SLOT, name: '슬롯', parentAssetId: 'ofdA', substationId: 's1', assetType: { connectionKind: 'conduit', code: 'OFD-SLOT' } };
const opgw = { id: 'opgw', cableType: 'FIBER', sourceAssetId: SLOT, targetAssetId: TWIN, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };
const localOut3 = { id: 'c-l3', cableType: 'FIBER', sourceAssetId: 'eqpL', targetAssetId: SLOT, sourceRole: null, targetRole: 'OUT', number: 3 };

const SLIM = [
  { id: 'eqpL', name: '자국장비', code: 'EQP', substationId: 's1', substationName: '춘천', parentAssetId: null, connectionKind: null },
  { id: 'eqpL2', name: '자국장비2', code: 'EQP', substationId: 's1', substationName: '춘천', parentAssetId: null, connectionKind: null },
  { id: 'eqpR', name: '대국장비', code: 'EQP', substationId: 's2', substationName: '북춘천', parentAssetId: null, connectionKind: null },
  { id: TWIN, name: '북춘천슬롯', code: 'OFD-SLOT', substationId: 's2', substationName: '북춘천', parentAssetId: 'ofdB', connectionKind: 'conduit' },
  { id: 'ofdA', name: 'OFD', code: 'OFD', substationId: 's1', substationName: '춘천', parentAssetId: null, connectionKind: null },
];
const CATS = [{ id: 'cat-opj', code: 'CBL-OPJ', name: '광점퍼코드', displayColor: null }];

// 카테고리 모킹은 테스트마다 교체 가능(빈 배열로 disabled 케이스 검증).
const cats = vi.hoisted(() => ({ value: { data: [] as { id: string; code: string; name: string; displayColor: string | null }[] } }));

vi.mock('../../workingCopy/hooks', () => ({}));
vi.mock('../../trace/traceGraph', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../trace/traceGraph')>()),
  useTraceGraph: () => ({
    graph: {
      cables: [opgw, localOut3],
      nameById: new Map([['eqpL','자국장비'],['eqpR','대국장비']]),
    },
    isLoading: false,
  }),
}));
vi.mock('../../cables/hooks/useCableCategories', () => ({ useCableCategories: () => cats.value }));
vi.mock('../../workingCopy/substationStore', () => {
  const st = { put, patch, remove };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});
vi.mock('../../../utils/idHelpers', () => ({ generateTempId }));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['assets-slim'], SLIM);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

import { EquipmentSelectCell } from './EquipmentSelectCell';

/** EditableField 의 select: ✎ 버튼(title=`${ariaLabel} 수정`) 클릭 → 편집모드 진입 →
 *  네이티브 <select aria-label> 의 change 가 onCommit 을 발화. */
function chooseOption(ariaLabel: string, value: string) {
  fireEvent.click(screen.getByTitle(`${ariaLabel} 수정`));
  fireEvent.change(screen.getByLabelText(ariaLabel), { target: { value } });
}

beforeEach(() => { put.mockClear(); patch.mockClear(); remove.mockClear(); cats.value = { data: CATS }; });

describe('EquipmentSelectCell', () => {
  it('자국 빈 코어: 설비 선택 → buildCoreOutCable put(자국슬롯)', () => {
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="local" />);
    chooseOption('자국설비', 'eqpL2');
    expect(put).toHaveBeenCalledTimes(1);
    const [coll, cable] = put.mock.calls[0];
    expect(coll).toBe('cables');
    expect(cable).toMatchObject({ sourceAssetId: 'eqpL2', targetAssetId: SLOT, targetRole: 'OUT', number: 5, categoryCode: 'CBL-OPJ' });
  });

  it('자국 점유 코어 변경 → patch(sourceAssetId)', () => {
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="local" />);
    chooseOption('자국설비', 'eqpL2');
    expect(patch).toHaveBeenCalledWith('cables', 'c-l3', { sourceAssetId: 'eqpL2' });
    expect(put).not.toHaveBeenCalled();
  });

  it('대국 빈 코어: 후보=대국 변전소 설비 + 선택 → put(twin 슬롯)', () => {
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="remote" />);
    chooseOption('대국설비', 'eqpR');
    const [, cable] = put.mock.calls[0];
    expect(cable).toMatchObject({ sourceAssetId: 'eqpR', targetAssetId: TWIN, number: 5 });
  });

  it('점유 코어에서 빈값 선택 + confirm→true → remove', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="local" />);
    chooseOption('자국설비', '');
    expect(remove).toHaveBeenCalledWith('cables', 'c-l3');
    confirm.mockRestore();
  });

  it('점유 코어에서 빈값 선택 + confirm→false → remove 미호출', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="local" />);
    chooseOption('자국설비', '');
    expect(remove).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('CBL-OPJ 카테고리 없음 → disabled(연필 버튼 없음)', () => {
    cats.value = { data: [] };
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="local" />);
    expect(screen.queryByTitle('자국설비 수정')).toBeNull();
  });
});

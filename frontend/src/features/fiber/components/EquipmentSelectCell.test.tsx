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
// 대국 OUT 코어 3 — 자국 c-l3 와 같은 number, targetRole='OUT'. endpoint 가드 없으면 대국 조회에 자국이 잘못 잡힘.
const remoteOut3 = { id: 'c-r3', cableType: 'FIBER', sourceAssetId: 'eqpR', targetAssetId: TWIN, sourceRole: null, targetRole: 'OUT', number: 3 };

// buildTraceGraph 단일 입력(assetType 중첩). 변전소명은 NAMES 맵.
const A = (id: string, name: string, code: string, sub: string, parent: string | null, kind: 'conduit' | null = null) =>
  ({ id, name, substationId: sub, parentAssetId: parent, slotIndex: null, assetType: { code, connectionKind: kind } });
const SLIM = [
  A('eqpL', '자국장비', 'EQP', 's1', null),
  A('eqpL2', '자국장비2', 'EQP', 's1', null),
  A('eqpR', '대국장비', 'EQP', 's2', null),
  A('eqpR2', '대국장비2', 'EQP', 's2', null),
  A(TWIN, '북춘천슬롯', 'OFD-SLOT', 's2', 'ofdB', 'conduit'),
  A('ofdA', 'OFD', 'OFD', 's1', null),
];
const NAMES = new Map([['s1', '춘천'], ['s2', '북춘천']]);
const CATS = [{ id: 'cat-opj', code: 'CBL-OPJ', name: '광점퍼코드', displayColor: null }];

// 카테고리 모킹은 테스트마다 교체 가능(빈 배열로 disabled 케이스 검증).
const cats = vi.hoisted(() => ({ value: { data: [] as { id: string; code: string; name: string; displayColor: string | null }[] } }));

vi.mock('../../workingCopy/hooks', () => ({}));
vi.mock('../../trace/traceGraph', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../trace/traceGraph')>();
  // 실제 buildTraceGraph 로 그래프 생성(slim+staged 병합 단일 SSOT) — 컴포넌트가 그래프에서 파생.
  return {
    ...orig,
    useTraceGraph: () => ({
      graph: orig.buildTraceGraph({
        assets: SLIM as never[],
        cables: [opgw, localOut3, remoteOut3] as never[],
        substationNames: NAMES,
      }),
      isLoading: false,
    }),
  };
});
vi.mock('../../cables/hooks/useCableCategories', () => ({ useCableCategories: () => cats.value }));
vi.mock('../../workingCopy/substationStore', () => {
  // effectiveCables: 점검일 자동 갱신(touchCoreInspect→commitCoreMeta)이 OPGW coreMeta 를 머지할 때 읽는다.
  const st = { put, patch, remove, effectiveCables: () => [opgw, localOut3, remoteOut3] };
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
    expect(cable).toMatchObject({ sourceAssetId: SLOT, targetAssetId: 'eqpL2', sourceRole: 'OUT', number: 5, categoryCode: 'CBL-OPJ' });
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
    expect(cable).toMatchObject({ sourceAssetId: TWIN, targetAssetId: 'eqpR', number: 5 });
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

  it('endpoint 가드: 대국 셀이 자국 케이블을 매칭하지 않는다(전염 방지)', () => {
    // graph.cables = [opgw, localOut3(자국, target=slotA), remoteOut3(대국, target=twinB)] 둘 다 number 3·targetRole OUT.
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="remote" />);
    // 대국 셀의 현재값은 c-r3(eqpR) 이어야 함 — 자국 c-l3(eqpL) 가 잘못 잡히면 안 됨.
    expect(screen.getByText('대국장비')).toBeInTheDocument();
    expect(screen.queryByText('자국장비')).toBeNull();
    // 변경 시 대국 케이블(c-r3)을 패치 — 자국(c-l3) 아님.
    chooseOption('대국설비', 'eqpR2');
    expect(patch).toHaveBeenCalledWith('cables', 'c-r3', { sourceAssetId: 'eqpR2' });
  });

  it('CBL-OPJ 카테고리 없음 → disabled(연필 버튼 없음)', () => {
    cats.value = { data: [] };
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="local" />);
    expect(screen.queryByTitle('자국설비 수정')).toBeNull();
  });
});

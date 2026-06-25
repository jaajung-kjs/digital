import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { TraceGraph } from '../../trace/traceGraph';

// useTraceGraph 를 모킹 — conduit 슬롯 파생 라벨이 결정적으로 나오도록 그래프를 주입.
// (fiberSlotLabel.test.ts 의 그래프 구성을 미러: 슬롯→OFD parent, OFD/twin subName,
//  OPGW(IN-IN, cores=24) → 라벨 "춘천S/S - 북춘천S/S #24")
const SLOT = 'slotA';
const TWIN = 'slotB';
const OFD = 'ofdA';
const opgw = { id: 'opgw', sourceAssetId: SLOT, targetAssetId: TWIN, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };
const slotGraph = {
  assets: [], cables: [opgw],
  nameById: new Map(),
  subNameById: new Map([[OFD, '춘천S/S'], [TWIN, '북춘천S/S']]),
  parentById: new Map([[SLOT, OFD]]),
  codeById: new Map(),
} as unknown as TraceGraph;
let mockGraph: TraceGraph | null = null;
vi.mock('../../trace/traceGraph', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../trace/traceGraph')>()),
  useTraceGraph: () => ({ graph: mockGraph, isLoading: false }),
}));

import { AssetInspector } from './AssetInspector';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';

const asset = {
  id: 'a1', substationId: 's1', assetTypeId: 't1',
  assetType: { name: '랙', role: 'rack', fieldTemplate: [{ key: 'model', label: '모델', type: 'text' }] },
  name: '장비1', installDate: null, manager: null, status: '운영중',
  description: '비고 메모', warrantyUntil: null, replaceDue: null, floorId: null, updatedAt: '2026-06-05T00:00:00.000Z',
} as any;
const today = new Date('2026-06-05T00:00:00Z');
const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

beforeEach(() => { mockGraph = null; });

describe('AssetInspector — 단일 인스펙터(SSOT)', () => {
  it('핵심 필드를 모두 렌더: 종류(읽기전용)/설명/점검/고장이력/사진/연결 — 속성 UI 없음(#7)', () => {
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={vi.fn()} onSelectAsset={vi.fn()} today={today} />);
    // 종류 — 읽기전용 라벨 + 값
    expect(screen.getByText('종류')).toBeTruthy();
    expect(screen.getAllByText('랙').length).toBeGreaterThan(0);
    // #7: 커스텀 속성(모델 등) 입력/속성 섹션은 더 이상 렌더되지 않는다.
    expect(screen.queryByLabelText('모델')).toBeNull();
    expect(screen.queryByText('속성')).toBeNull();
    // 탭 바(#6) — 정보/점검/고장이력/사진/연결 탭 라벨이 모두 보인다.
    expect(screen.getByRole('tab', { name: '정보' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '점검' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /고장이력/ })).toBeTruthy();
    expect(screen.queryByText('유지보수')).toBeNull();
    expect(screen.getByRole('tab', { name: '사진' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /연결/ })).toBeTruthy();
  });

  it('edit 모드: 설명(연필-인라인) 변경 → onPatch({ description })', () => {
    const onPatch = vi.fn();
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={onPatch} onSelectAsset={vi.fn()} today={today} />);
    // 줄찍찍 제거: 평소엔 plain text, 연필 클릭 시 인풋으로 전환.
    fireEvent.click(screen.getByTitle('설명 수정'));
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

describe('AssetInspector — 필드별 수정 affordance(#8 S7)', () => {
  it('edit 모드: 편집 가능 필드에 수정(연필) 버튼 — 이름/담당자/설치일/설명', () => {
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={vi.fn()} onSelectAsset={vi.fn()} today={today} />);
    expect(screen.getByTitle('이름 수정')).toBeTruthy();
    expect(screen.getByTitle('담당자 수정')).toBeTruthy();
    expect(screen.getByTitle('설치일 수정')).toBeTruthy();
    expect(screen.getByTitle('설명 수정')).toBeTruthy();
    // 읽기전용(종류)에는 연필 없음
    expect(screen.queryByTitle('종류 수정')).toBeNull();
  });

  it('수정(연필) 클릭 → 인풋으로 전환 + focus(편집 시작)', () => {
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={vi.fn()} onSelectAsset={vi.fn()} today={today} />);
    // 평소엔 인풋 없음(plain text). 연필 클릭 시 인풋 등장 + autoFocus.
    expect(screen.queryByDisplayValue('장비1')).toBeNull();
    fireEvent.click(screen.getByTitle('이름 수정'));
    const nameInput = screen.getByDisplayValue('장비1') as HTMLInputElement;
    expect(document.activeElement).toBe(nameInput);
  });

  it('view 모드: 수정(연필) 버튼 없음(읽기전용)', () => {
    wrap(<AssetInspector asset={asset} mode="view" onSelectAsset={vi.fn()} today={today} />);
    expect(screen.queryByTitle('이름 수정')).toBeNull();
    expect(screen.queryByTitle('설명 수정')).toBeNull();
  });
});

describe('AssetInspector — 랙 모듈(통합 패널)', () => {
  // 상위 랙 자산을 working copy 에 seed → breadcrumb 라벨(← 랙01) 해석.
  beforeEach(() => {
    const empty = { creates: {}, updates: {}, deletes: [] };
    useSubstationWorkingCopy.setState({
      saved: {
        assets: [{ id: 'rack1', name: '랙01' }],
        cables: [],
      },
      overlays: {
        assets: { ...empty }, cables: { ...empty },
      },
    } as never);
  });

  const moduleAsset = {
    id: 'm1', substationId: 's1', assetTypeId: 'cat1',
    assetType: { name: '광패치', role: 'device', fieldTemplate: [] },
    name: '모듈1', parentAssetId: 'rack1', slotIndex: 2, slotSpan: 2,
 installDate: null, manager: null, status: '운영중',
    description: '', warrantyUntil: null, replaceDue: null, floorId: null, updatedAt: '',
  } as never;

  it('모듈: 카테고리·슬롯 위치(읽기전용) + 종류 라벨 없음', () => {
    wrap(<AssetInspector asset={moduleAsset} mode="edit" onPatch={vi.fn()} onSelectAsset={vi.fn()} today={today} />);
    expect(screen.getByText('카테고리')).toBeTruthy();
    expect(screen.getByText('슬롯 위치')).toBeTruthy();
    // 슬롯 3–4 (slotIndex 2 → 1-based 3), span 2
    expect(screen.getByText('슬롯 3–4 (2슬롯)')).toBeTruthy();
    // 종류는 모듈에서 카테고리로 대체 → '종류' 라벨 없음
    expect(screen.queryByText('종류')).toBeNull();
    // 읽기전용 카테고리/슬롯에는 수정(연필) 없음, 편집 가능 이름엔 있음
    expect(screen.queryByTitle('카테고리 수정')).toBeNull();
    expect(screen.queryByTitle('슬롯 위치 수정')).toBeNull();
    expect(screen.getByTitle('이름 수정')).toBeTruthy();
  });

  // 상위 자산 네비게이션(브레드크럼)은 헤더(AssetDetailPanel)로 이동 — AssetInspector 책임 아님.

  it('모듈: 이름 편집 → onPatch(통합 overlay 스테이징과 동일 경로)', () => {
    const onPatch = vi.fn();
    wrap(<AssetInspector asset={moduleAsset} mode="edit" onPatch={onPatch} onSelectAsset={vi.fn()} today={today} />);
    fireEvent.click(screen.getByTitle('이름 수정'));
    const nameInput = screen.getByDisplayValue('모듈1') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '모듈A' } });
    fireEvent.blur(nameInput);
    expect(onPatch).toHaveBeenCalledWith('m1', { name: '모듈A' });
  });
});

describe('AssetInspector — 경로슬롯(conduit) 이름 파생 읽기전용', () => {
  const conduitAsset = {
    id: SLOT, substationId: 's1', assetTypeId: 'ofdslot',
    assetType: { name: 'OFD-SLOT', role: 'slot', fieldTemplate: [] },
    name: 'DB저장이름(표시안됨)', installDate: null, manager: null, status: '운영중',
    description: '', warrantyUntil: null, replaceDue: null, floorId: null, updatedAt: '',
  } as never;

  it('conduit: 이름이 파생 라벨(자국-대국#코어수) 읽기전용 — 편집 affordance 없음', () => {
    mockGraph = slotGraph;
    wrap(<AssetInspector asset={conduitAsset} mode="edit" onPatch={vi.fn()} onSelectAsset={vi.fn()} today={today} />);
    // 파생 라벨 표시, DB name 은 표시되지 않음
    expect(screen.getByText('춘천S/S - 북춘천S/S #24')).toBeTruthy();
    expect(screen.queryByText('DB저장이름(표시안됨)')).toBeNull();
    // 읽기전용 — 이름 수정(연필)·편집 인풋 없음
    expect(screen.queryByTitle('이름 수정')).toBeNull();
    expect(screen.queryByDisplayValue('춘천S/S - 북춘천S/S #24')).toBeNull();
    expect(screen.queryByDisplayValue('DB저장이름(표시안됨)')).toBeNull();
  });

  it('비-conduit 자산은 이름이 여전히 편집 가능(연필 노출)', () => {
    mockGraph = slotGraph; // graph 가 있어도 conduit 아니면 영향 없음
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={vi.fn()} onSelectAsset={vi.fn()} today={today} />);
    expect(screen.getByTitle('이름 수정')).toBeTruthy();
  });
});

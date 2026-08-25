/**
 * FloorPlanView — 배경 도면 임포트/제거 UI 테스트
 *
 * FloorPlanView.test.tsx 와 동일한 방식: 실제 컴포넌트 + 실제 워킹카피 스토어를
 * `v2WorkingCopyStore.setState` 로 시딩하고, `useV2Catalog` 만 목킹한다.
 * api 는 `parseBackground`(파일 읽기) 만 목킹 — 나머지는 실물.
 *
 * 읽은 도면은 **워킹카피에 쌓인다**(서버로 가는 것은 저장할 때다). 그래서 단언도 `saved` 가
 * 아니라 지금 화면이 보는 것(`effectiveFloors`)을 본다 — 자산·케이블과 같은 규칙 하나다.
 * 관리자 판정은 프로덕션과 동일하게 인증 스토어(`useV2AuthStore`)의 user.role 로 결정된다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { BackgroundDrawing } from '@twin/core';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { useV2AuthStore } from '../store/authStore';
import { emptyOverlays } from '../store/workingCopyStore';
import { FloorPlanView } from '../components/floorplan/FloorPlanView';
import type { V2Floor } from '../types';

// 카탈로그는 비어 있어도 층 탭바는 렌더된다 — 배치 팔레트/케이블 도구는 이 테스트의 관심사가 아니다.
vi.mock('../hooks', () => ({
  useV2Catalog: () => ({ data: { categories: [], types: [], assemblies: [], cableGroups: [] } }),
  // 장비의 포트를 놓는 순간 만들려면 장비 품목이 필요하다(저장 전에도 포트가 보여야 한다).
  useTypesById: () => new Map(),
  /* 층을 만드는 길이 평면도에도 있다(빈 화면 + 탭 줄 끝) — 여기서는 부르지 않는다. */
  useOrgMutations: () => ({
    createOrgNode: { mutate: () => {}, mutateAsync: async () => {}, isPending: false },
    renameOrgNode: { mutate: () => {}, mutateAsync: async () => {}, isPending: false },
    deleteOrgNode: { mutate: () => {}, mutateAsync: async () => {}, isPending: false },
  }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, parseBackground: vi.fn() };
});
import { parseBackground } from '../api';

const mockedParse = vi.mocked(parseBackground);

const drawing = (fileName: string): BackgroundDrawing => ({
  source: { fileName, importedAt: '2026-08-04T00:00:00.000Z', fileType: 'DWG' },
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  layers: [],
  paths: [],
  texts: [],
  filled: [],
});

function setFloors(floors: V2Floor[]) {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: {
      substation: { id: 'sub-1', name: '변전소', branchId: 'b1', sortOrder: 1 },
      floors, assets: [], maintenanceLogs: [], inspectionLogs: [], cables: [], photos: [],
    },
    overlays: emptyOverlays(),
    baseVersions: {},
  });
}

function setRole(role: string) {
  useV2AuthStore.setState({ user: { id: 'u1', username: 'u', role }, isAuthenticated: true });
}

const floor = (extra: Partial<V2Floor> = {}): V2Floor =>
  ({ id: 'f1', name: '1층', sortOrder: 1, substationId: 'sub-1', updatedAt: 'v1', ...extra });

function renderFloorPlan() {
  return render(
    <FloorPlanView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />,
  );
}

function selectFile(name: string): File {
  return new File(['fake-bytes'], name);
}

describe('FloorPlanView — 배경 도면 임포트', () => {
  beforeEach(() => {
    mockedParse.mockReset();
    setFloors([floor()]);
  });

  it('관리자에게 배경 임포트 버튼이 보인다', () => {
    setRole('admin');
    renderFloorPlan();

    expect(screen.getByTestId('background-import-button')).toBeTruthy();
  });

  it('파일 input 이 광고한 3개 포맷(dwg/dxf/dgn)을 전부 받는다 — .dgn 회귀 방지', () => {
    setRole('admin');
    renderFloorPlan();

    const input = screen.getByTestId('background-import-input') as HTMLInputElement;
    expect(input.accept).toBe('.dwg,.dxf,.dgn');
  });

  it('비관리자에게는 보이지 않는다', () => {
    setRole('viewer');
    renderFloorPlan();

    expect(screen.getByText('1층')).toBeTruthy(); // 층 탭바 자체는 렌더됨
    expect(screen.queryByTestId('background-import-button')).toBeNull();
  });

  it('파일을 고르면 읽어서 그 층에 얹는다 — 서버로 가는 것은 저장할 때다', async () => {
    setRole('admin');
    mockedParse.mockResolvedValue(drawing('plan.dwg'));
    renderFloorPlan();

    const input = screen.getByTestId('background-import-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [selectFile('plan.dwg')] } });

    // 읽기 성공 → 그 층에 얹혀 제거 버튼이 나타난다
    expect(await screen.findByTestId('background-remove-button')).toBeTruthy();

    expect(mockedParse).toHaveBeenCalledTimes(1);
    const st = v2WorkingCopyStore.getState();
    expect(st.effectiveFloors()[0]!.backgroundDrawing).toMatchObject({ source: { fileName: 'plan.dwg' } });
    /* 아직 서버의 것은 아니다 — 저장할 것이 한 건 쌓였을 뿐이다. */
    expect(st.saved.floors[0]!.backgroundDrawing).toBeUndefined();
    expect(st.dirtyCount()).toBe(1);
  });

  it('읽기 실패 시 서버 메시지를 표시하고 워킹카피는 그대로다', async () => {
    setRole('admin');
    mockedParse.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: 'UNSUPPORTED_FORMAT', message: '.pdf 는 지원하지 않습니다' } },
    });
    renderFloorPlan();

    const input = screen.getByTestId('background-import-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [selectFile('plan.pdf')] } });

    expect(await screen.findByText('.pdf 는 지원하지 않습니다')).toBeTruthy();
    expect(v2WorkingCopyStore.getState().dirtyCount()).toBe(0);
  });

  it('배경이 없는 층에는 제거 버튼이 없고, 있는 층에만 나온다', async () => {
    setRole('admin');
    renderFloorPlan();

    expect(screen.queryByTestId('background-remove-button')).toBeNull();

    act(() => setFloors([floor({ backgroundDrawing: drawing('plan.dwg') })]));

    expect(await screen.findByTestId('background-remove-button')).toBeTruthy();
  });

  it('제거 버튼 → 배경이 화면에서 사라지고, 없앤다는 것이 저장할 것으로 쌓인다', async () => {
    setRole('admin');
    setFloors([floor({ backgroundDrawing: drawing('plan.dwg') })]);
    renderFloorPlan();

    fireEvent.click(screen.getByTestId('background-remove-button'));

    await waitFor(() => expect(screen.queryByTestId('background-remove-button')).toBeNull());

    const st = v2WorkingCopyStore.getState();
    expect(st.effectiveFloors()[0]!.backgroundDrawing).toBeNull();
    /* 서버가 아는 것은 아직 그대로다 — 되돌리기가 듣는다는 뜻이다. */
    expect(st.saved.floors[0]!.backgroundDrawing).toMatchObject({ source: { fileName: 'plan.dwg' } });
    expect(st.dirtyCount()).toBe(1);
  });
});

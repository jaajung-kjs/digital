/**
 * FloorPlanView — 배경 도면 임포트/제거 UI 테스트
 *
 * FloorPlanView.test.tsx 와 동일한 방식: 실제 컴포넌트 + 실제 워킹카피 스토어를
 * `v2WorkingCopyStore.setState` 로 시딩하고, `useV2Catalog` 만 목킹한다.
 * api 는 `uploadBackground`/`deleteBackground` 만 목킹 — 나머지는 실물.
 * 관리자 판정은 프로덕션과 동일하게 인증 스토어(`useV2AuthStore`)의 user.role 로 결정된다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { BackgroundDrawing } from '@twin/core';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { useV2AuthStore } from '../store/authStore';
import { emptyOverlay } from '../store/overlay';
import { FloorPlanView } from '../components/FloorPlanView';
import type { V2Floor } from '../types';

// 카탈로그는 비어 있어도 층 탭바는 렌더된다 — 배치 팔레트/케이블 도구는 이 테스트의 관심사가 아니다.
vi.mock('../hooks', () => ({
  useV2Catalog: () => ({ data: { categories: [], types: [], cableGroups: [] } }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, uploadBackground: vi.fn(), deleteBackground: vi.fn() };
});
import { uploadBackground, deleteBackground } from '../api';

const mockedUpload = vi.mocked(uploadBackground);
const mockedDelete = vi.mocked(deleteBackground);

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
    overlays: { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), cables: emptyOverlay(), photos: emptyOverlay() },
    baseVersions: {},
  });
}

function setRole(role: string) {
  useV2AuthStore.setState({ user: { id: 'u1', username: 'u', role }, isAuthenticated: true });
}

const floor = (extra: Partial<V2Floor> = {}): V2Floor =>
  ({ id: 'f1', name: '1층', sortOrder: 1, substationId: 'sub-1', ...extra });

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
    mockedUpload.mockReset();
    mockedDelete.mockReset();
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

  it('파일을 고르면 활성 층 id 로 업로드하고, 응답 층이 워킹카피에 반영된다', async () => {
    setRole('admin');
    mockedUpload.mockResolvedValue(floor({ backgroundDrawing: drawing('plan.dwg') }));
    renderFloorPlan();

    const input = screen.getByTestId('background-import-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [selectFile('plan.dwg')] } });

    // 업로드 성공 → 반환된 층이 적용되어 제거 버튼이 나타난다
    expect(await screen.findByTestId('background-remove-button')).toBeTruthy();

    expect(mockedUpload).toHaveBeenCalledTimes(1);
    expect(mockedUpload.mock.calls[0][0]).toBe('f1');
    expect(v2WorkingCopyStore.getState().saved.floors[0].backgroundDrawing).toMatchObject({
      source: { fileName: 'plan.dwg' },
    });
  });

  it('업로드 실패 시 서버 메시지를 표시하고 워킹카피는 그대로다', async () => {
    setRole('admin');
    mockedUpload.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: 'UNSUPPORTED_FORMAT', message: '.pdf 는 지원하지 않습니다' } },
    });
    renderFloorPlan();

    const input = screen.getByTestId('background-import-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [selectFile('plan.pdf')] } });

    expect(await screen.findByText('.pdf 는 지원하지 않습니다')).toBeTruthy();
    expect(v2WorkingCopyStore.getState().saved.floors[0].backgroundDrawing).toBeUndefined();
  });

  it('배경이 없는 층에는 제거 버튼이 없고, 있는 층에만 나온다', async () => {
    setRole('admin');
    renderFloorPlan();

    expect(screen.queryByTestId('background-remove-button')).toBeNull();

    act(() => setFloors([floor({ backgroundDrawing: drawing('plan.dwg') })]));

    expect(await screen.findByTestId('background-remove-button')).toBeTruthy();
  });

  it('제거 버튼 → deleteBackground 호출 후 배경이 사라진다', async () => {
    setRole('admin');
    setFloors([floor({ backgroundDrawing: drawing('plan.dwg') })]);
    mockedDelete.mockResolvedValue(floor({ backgroundDrawing: null }));
    renderFloorPlan();

    fireEvent.click(screen.getByTestId('background-remove-button'));

    await waitFor(() => expect(screen.queryByTestId('background-remove-button')).toBeNull());

    expect(mockedDelete).toHaveBeenCalledWith('f1');
    expect(v2WorkingCopyStore.getState().saved.floors[0].backgroundDrawing).toBeNull();
  });
});

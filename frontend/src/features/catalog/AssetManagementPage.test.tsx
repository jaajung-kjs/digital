import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AssetManagementPage } from './AssetManagementPage';
import { useCatalogStore } from './catalogStore';
import { useAuthStore } from '../../stores/authStore';

// ── authStore 모킹 ──────────────────────────────────────────────────────────────
vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

// toastStore 모킹(onSave 호출 시 에러 방지)
vi.mock('../editor/stores/toastStore', () => ({
  useToastStore: { getState: () => ({ showToast: vi.fn() }) },
}));

const mockUseAuthStore = vi.mocked(useAuthStore);

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────────
const mkCat = (id: string, name: string) =>
  ({ id, name, sortOrder: 0 }) as never;

const mkType = (id: string, name: string, categoryId: string | null, role = 'device') =>
  ({
    id, name, role, categoryId, sortOrder: 0,
    laborType: null, installHoursPerUnit: null,
    removeHoursPerUnit: null, relocateHoursPerUnit: null,
  }) as never;

const mkCableGroup = (id: string, name: string, color: string | null = null) =>
  ({
    id, name, color, sortOrder: 0, laborType: null,
    installHoursPerMeter: null, removeHoursPerMeter: null, relocateHoursPerMeter: null,
  }) as never;

const mkCableCat = (id: string, name: string, groupId: string) =>
  ({ id, name, groupId, groupName: null, groupColor: null, sortOrder: 0 }) as never;

// ── 공통 초기화 ─────────────────────────────────────────────────────────────────
beforeEach(() => {
  // ADMIN으로 mock
  mockUseAuthStore.mockImplementation(
    (sel: (s: { user: { role: string } }) => unknown) =>
      sel({ user: { role: 'ADMIN' } }),
  );

  // 스토어에 목 데이터 + no-op load 주입 (실제 API 호출 방지)
  useCatalogStore.setState({
    baseCategories: [mkCat('c1', '광전송장치')],
    baseTypes: [mkType('t1', '송변전광단말', 'c1')],
    baseCableGroups: [mkCableGroup('g1', '전원', '#ef4444')],
    baseCableCategories: [mkCableCat('cc1', 'Fr-sq3.5', 'g1')],
    load: vi.fn().mockResolvedValue(undefined),
  } as never);
  useCatalogStore.getState().discard();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AssetManagementPage />
    </MemoryRouter>,
  );
}

// ── 비ADMIN 가드 ──────────────────────────────────────────────────────────────
describe('비ADMIN 리다이렉트', () => {
  it('USER 역할이면 페이지 콘텐츠 미렌더(Navigate)', () => {
    mockUseAuthStore.mockImplementation(
      (sel: (s: { user: { role: string } }) => unknown) =>
        sel({ user: { role: 'USER' } }),
    );
    renderPage();
    // Navigate 후 page content 사라짐
    expect(screen.queryByText('설비')).toBeNull();
  });
});

// ── 설비 세그먼트 렌더 ─────────────────────────────────────────────────────────
describe('설비 세그먼트 렌더', () => {
  it('초기: 분류 헤더와 종류 행 렌더', () => {
    renderPage();
    // '광전송장치'는 분류헤더 button(title=광전송장치)과 분류열 span 두 곳에 있으므로 getByTitle 사용
    expect(screen.getByTitle('광전송장치')).toBeInTheDocument();
    expect(screen.getByText('송변전광단말')).toBeInTheDocument();
  });

  it('categoryId=null 종류가 있으면 미분류 sentinel 그룹 표시', () => {
    useCatalogStore.setState({
      baseCategories: [],
      baseTypes: [mkType('tx', '미분류종류', null)],
      load: vi.fn().mockResolvedValue(undefined),
    } as never);
    useCatalogStore.getState().discard();
    renderPage();
    expect(screen.getByText('미분류')).toBeInTheDocument();
    expect(screen.getByText('미분류종류')).toBeInTheDocument();
  });

  it('role !== device 종류는 시스템 배지 노출', () => {
    useCatalogStore.setState({
      baseTypes: [
        mkType('t1', '송변전광단말', 'c1'),
        mkType('rack1', '랙', 'c1', 'rack'),
      ],
      load: vi.fn().mockResolvedValue(undefined),
    } as never);
    useCatalogStore.getState().discard();
    renderPage();
    expect(screen.getAllByText('시스템').length).toBeGreaterThan(0);
  });
});

// ── 세그먼트 전환 ──────────────────────────────────────────────────────────────
describe('세그먼트 전환 (설비 ↔ 케이블)', () => {
  it('케이블 버튼 클릭 → 케이블 그룹·종류 표시, 설비 분류 사라짐', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(screen.getByText('전원')).toBeInTheDocument();
    expect(screen.getByText('Fr-sq3.5')).toBeInTheDocument();
    // 설비 분류 헤더(button, title=광전송장치) 가 사라져야 함
    expect(screen.queryByTitle('광전송장치')).toBeNull();
  });

  it('설비→케이블→설비 순서 전환', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(screen.getByText('전원')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '설비' }));
    // 분류헤더 button 의 title 속성으로 확인 (분류열 span 과 구분)
    expect(screen.getByTitle('광전송장치')).toBeInTheDocument();
    expect(screen.queryByText('전원')).toBeNull();
  });
});

// ── 인라인 편집 — stageUpdateType 호출 ────────────────────────────────────────
describe('인라인 편집', () => {
  it('종류 이름 셀 편집 → stageUpdateType 호출', () => {
    const spy = vi.fn();
    useCatalogStore.setState({ stageUpdateType: spy } as never);
    renderPage();

    // valueClickEdits=true 이므로 값 버튼 클릭하면 편집 열림
    const valueBtn = screen.getByTitle('송변전광단말');
    fireEvent.click(valueBtn);

    // 입력 나타남
    const input = screen.getByRole('textbox', { name: '종류명' });
    expect(input).toBeInTheDocument();

    // 값 변경 후 blur 로 커밋
    fireEvent.change(input, { target: { value: '수정된이름' } });
    fireEvent.blur(input);

    expect(spy).toHaveBeenCalledWith('t1', { name: '수정된이름' });
  });
});

// ── + 종류 버튼 → stageCreateType 호출 ───────────────────────────────────────
describe('추가 버튼', () => {
  it('+ 종류 클릭 → stageCreateType 호출(dirty 증가)', () => {
    renderPage();
    expect(useCatalogStore.getState().dirtyCount()).toBe(0);
    fireEvent.click(screen.getAllByRole('button', { name: '+ 종류' })[0]);
    expect(useCatalogStore.getState().dirtyCount()).toBe(1);
  });

  it('+ 분류 클릭 → stageCreateCategory 호출(dirty 증가)', () => {
    renderPage();
    expect(useCatalogStore.getState().dirtyCount()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '+ 분류' }));
    expect(useCatalogStore.getState().dirtyCount()).toBe(1);
  });
});

// ── CommitBar (dirty>0) ────────────────────────────────────────────────────────
describe('CommitBar', () => {
  it('dirty=0 이면 CommitBar 미표시', () => {
    renderPage();
    expect(screen.queryByText(/저장.*건/)).toBeNull();
  });

  it('dirty>0 이면 CommitBar 표시', () => {
    // 스테이징 1건 추가 후 렌더
    useCatalogStore.getState().stageCreateCategory({ id: 'tmp1', name: '임시분류', sortOrder: 0 });
    renderPage();
    expect(screen.getByText(/저장.*건/)).toBeInTheDocument();
  });
});

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

// ── 세그먼트 전환 ──────────────────────────────────────────────────────────────
describe('세그먼트 전환 (설비 ↔ 케이블)', () => {
  it('초기: 설비 세그먼트 — 분류·종류 표시', () => {
    renderPage();
    expect(screen.getByText('광전송장치')).toBeInTheDocument();
    expect(screen.getByText('송변전광단말')).toBeInTheDocument();
    expect(screen.queryByText('Fr-sq3.5')).toBeNull();
  });

  it('케이블 버튼 클릭 → 케이블 그룹·종류 표시, 설비 목록 사라짐', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(screen.getByText('전원')).toBeInTheDocument();
    expect(screen.getByText('Fr-sq3.5')).toBeInTheDocument();
    expect(screen.queryByText('광전송장치')).toBeNull();
  });

  it('설비→케이블→설비 순서 전환', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(screen.getByText('전원')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '설비' }));
    expect(screen.getByText('광전송장치')).toBeInTheDocument();
    expect(screen.queryByText('전원')).toBeNull();
  });
});

// ── 설비 리스트 렌더 ───────────────────────────────────────────────────────────
describe('설비 리스트 렌더', () => {
  it('분류·종류 항목 렌더', () => {
    renderPage();
    expect(screen.getByText('광전송장치')).toBeInTheDocument();
    expect(screen.getByText('송변전광단말')).toBeInTheDocument();
  });

  it('categoryId=null 종류가 있으면 미분류 sentinel 그룹 표시', () => {
    useCatalogStore.setState({
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

// ── 종류(leaf) 클릭 → 우측 폼 노출 ───────────────────────────────────────────
describe('항목 선택 → 우측 폼 노출', () => {
  it('종류(leaf) 클릭 → AssetTypeForm 렌더(역할 FormRow 노출)', () => {
    renderPage();
    fireEvent.click(screen.getByText('송변전광단말'));
    // AssetTypeForm 에만 있는 FormRow 라벨 "역할" 으로 확인
    expect(screen.getByText('역할')).toBeInTheDocument();
  });

  it('분류(group) 클릭 → AssetCategoryForm 렌더(사용 종류 카운트 노출)', () => {
    renderPage();
    // 분류 이름 버튼은 '광전송장치'; 첫 번째를 클릭
    fireEvent.click(screen.getAllByText('광전송장치')[0]);
    // AssetCategoryForm 은 사용 종류 수를 "N개" 로 렌더
    expect(screen.getByText('1개')).toBeInTheDocument();
  });

  it('케이블 세그먼트에서 그룹 클릭 → CableGroupForm 렌더(색 input 노출)', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    fireEvent.click(screen.getAllByText('전원')[0]);
    expect(screen.getByLabelText('그룹 색')).toBeInTheDocument();
  });

  it('케이블 종류(leaf) 클릭 → CableCategoryForm 렌더(삭제 버튼 노출)', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    fireEvent.click(screen.getByText('Fr-sq3.5'));
    expect(screen.getByTitle('삭제')).toBeInTheDocument();
  });
});

// ── + 분류 / + 종류 동작 ────────────────────────────────────────────────────────
describe('추가 버튼', () => {
  it('+ 분류 클릭 → stageCreateCategory (dirty 증가)', () => {
    renderPage();
    expect(useCatalogStore.getState().dirtyCount()).toBe(0);
    fireEvent.click(screen.getByText('+ 분류'));
    expect(useCatalogStore.getState().dirtyCount()).toBe(1);
  });

  it('+ 종류 클릭 → stageCreateType (dirty 증가)', () => {
    renderPage();
    expect(useCatalogStore.getState().dirtyCount()).toBe(0);
    fireEvent.click(screen.getAllByText('+ 종류')[0]);
    expect(useCatalogStore.getState().dirtyCount()).toBe(1);
  });
});

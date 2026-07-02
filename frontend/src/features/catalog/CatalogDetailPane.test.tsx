import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogDetailPane } from './CatalogDetailPane';
import { useCatalogStore } from './catalogStore';

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────
const cat = (id: string, name: string): never =>
  ({ id, name, sortOrder: 0 }) as never;

const type = (id: string, name: string, categoryId: string | null, role = 'device'): never =>
  ({
    id, name, role, categoryId, sortOrder: 0,
    laborType: null,
    installHoursPerUnit: null,
    removeHoursPerUnit: null,
    relocateHoursPerUnit: null,
  }) as never;

const group = (id: string, name: string, color: string | null = null): never =>
  ({
    id, name, color, sortOrder: 0,
    laborType: null,
    installHoursPerMeter: null,
    removeHoursPerMeter: null,
    relocateHoursPerMeter: null,
  }) as never;

const cc = (id: string, name: string, groupId: string): never =>
  ({ id, name, groupId, groupName: null, groupColor: null, sortOrder: 0 }) as never;

// ── 공통 초기화 ────────────────────────────────────────────────────────────────
beforeEach(() => {
  useCatalogStore.setState({
    baseCategories: [cat('c1', '광전송장치')] as never,
    baseTypes: [
      type('t1', '송변전광단말', 'c1'),
      type('rack1', '랙', null, 'rack'),
    ] as never,
    baseCableGroups: [group('g1', '전원', '#ef4444')] as never,
    baseCableCategories: [cc('cc1', 'Fr-sq3.5', 'g1')] as never,
  } as never);
  useCatalogStore.getState().discard();
});

// ── 미선택 빈 상태 ─────────────────────────────────────────────────────────────
describe('CatalogDetailPane — 미선택 상태', () => {
  it('asset segment: SectionEmpty "항목을 선택하세요" 렌더', () => {
    useCatalogStore.getState().selectAsset(null);
    render(<CatalogDetailPane segment="asset" />);
    expect(screen.getByText('항목을 선택하세요.')).toBeInTheDocument();
  });

  it('cable segment: SectionEmpty "항목을 선택하세요" 렌더', () => {
    useCatalogStore.getState().selectCable(null);
    render(<CatalogDetailPane segment="cable" />);
    expect(screen.getByText('항목을 선택하세요.')).toBeInTheDocument();
  });
});

// ── 종류(AssetTypeForm) ───────────────────────────────────────────────────────
describe('CatalogDetailPane — 종류(AssetTypeForm) 선택', () => {
  beforeEach(() => {
    useCatalogStore.getState().selectAsset({ kind: 'type', id: 't1' });
  });

  it('이름 EditableField 렌더', () => {
    render(<CatalogDetailPane segment="asset" />);
    expect(screen.getByText('송변전광단말')).toBeInTheDocument();
  });

  it('설치(개당) number input 존재', () => {
    render(<CatalogDetailPane segment="asset" />);
    expect(screen.getByRole('spinbutton', { name: '설치(개당)' })).toBeInTheDocument();
  });

  it('이설(개당) number input 존재', () => {
    render(<CatalogDetailPane segment="asset" />);
    expect(screen.getByRole('spinbutton', { name: '이설(개당)' })).toBeInTheDocument();
  });

  it('설치 값 변경 → stageUpdateType 호출', () => {
    const spy = vi.spyOn(useCatalogStore.getState(), 'stageUpdateType');
    render(<CatalogDetailPane segment="asset" />);
    const input = screen.getByRole('spinbutton', { name: '설치(개당)' });
    fireEvent.change(input, { target: { value: '3.5' } });
    expect(spy).toHaveBeenCalledWith('t1', { installHoursPerUnit: 3.5 });
    spy.mockRestore();
  });

  it('role=rack 이면 삭제 버튼 없음(시스템)', () => {
    useCatalogStore.getState().selectAsset({ kind: 'type', id: 'rack1' });
    render(<CatalogDetailPane segment="asset" />);
    // DetailCardHeader onDelete 가 없으면 휴지통 버튼 미렌더
    expect(screen.queryByTitle('삭제')).toBeNull();
  });

  it('role=device 이면 삭제 버튼 있음', () => {
    render(<CatalogDetailPane segment="asset" />);
    expect(screen.getByTitle('삭제')).toBeInTheDocument();
  });
});

// ── 분류(AssetCategoryForm) ──────────────────────────────────────────────────
describe('CatalogDetailPane — 분류(AssetCategoryForm) 선택', () => {
  beforeEach(() => {
    useCatalogStore.getState().selectAsset({ kind: 'category', id: 'c1' });
  });

  it('분류명 EditableField 렌더', () => {
    render(<CatalogDetailPane segment="asset" />);
    expect(screen.getByText('광전송장치')).toBeInTheDocument();
  });

  it('이 분류 쓰는 종류 수 메타 렌더', () => {
    render(<CatalogDetailPane segment="asset" />);
    // 1개 종류(t1)가 c1에 속함
    expect(screen.getByText('1개')).toBeInTheDocument();
  });

  it('종류 0 아니면 삭제 버튼 없음', () => {
    render(<CatalogDetailPane segment="asset" />);
    expect(screen.queryByTitle('삭제')).toBeNull();
  });
});

// ── 케이블그룹(CableGroupForm) ────────────────────────────────────────────────
describe('CatalogDetailPane — 케이블그룹(CableGroupForm) 선택', () => {
  beforeEach(() => {
    useCatalogStore.getState().selectCable({ kind: 'group', id: 'g1' });
  });

  it('그룹명 렌더', () => {
    render(<CatalogDetailPane segment="cable" />);
    expect(screen.getByText('전원')).toBeInTheDocument();
  });

  it('색 input[type=color] 존재', () => {
    render(<CatalogDetailPane segment="cable" />);
    expect(document.querySelector('input[type="color"]')).not.toBeNull();
  });

  it('이설(m당) number input 존재', () => {
    render(<CatalogDetailPane segment="cable" />);
    expect(screen.getByRole('spinbutton', { name: '이설(m당)' })).toBeInTheDocument();
  });

  it('색 변경 → stageUpdateCableGroup({color}) 호출', () => {
    const spy = vi.spyOn(useCatalogStore.getState(), 'stageUpdateCableGroup');
    render(<CatalogDetailPane segment="cable" />);
    const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '#ff0000' } });
    expect(spy).toHaveBeenCalledWith('g1', { color: '#ff0000' });
    spy.mockRestore();
  });

  it('케이블종류 1개 있으면 삭제 버튼 없음', () => {
    render(<CatalogDetailPane segment="cable" />);
    expect(screen.queryByTitle('삭제')).toBeNull();
  });
});

// ── 케이블종류(CableCategoryForm) ─────────────────────────────────────────────
describe('CatalogDetailPane — 케이블종류(CableCategoryForm) 선택', () => {
  beforeEach(() => {
    useCatalogStore.getState().selectCable({ kind: 'category', id: 'cc1' });
  });

  it('종류명 렌더', () => {
    render(<CatalogDetailPane segment="cable" />);
    expect(screen.getByText('Fr-sq3.5')).toBeInTheDocument();
  });

  it('항상 삭제 버튼 있음', () => {
    render(<CatalogDetailPane segment="cable" />);
    expect(screen.getByTitle('삭제')).toBeInTheDocument();
  });
});

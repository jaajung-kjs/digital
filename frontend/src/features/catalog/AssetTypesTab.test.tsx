import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetTypesTab } from './AssetTypesTab';
import { useCatalogStore } from './catalogStore';

const cat = (id: string, name: string): never => ({ id, name, sortOrder: 0, isActive: true }) as never;
const type = (id: string, name: string, categoryId: string | null, role = 'device'): never =>
  ({ id, code: id, name, group: null, role, categoryId, isContainer: false, fieldTemplate: null, requiredToCreate: null, iconName: null, displayColor: null, placementKind: null, connectionKind: null, sortOrder: 0, isActive: true, laborType: null, installHoursPerUnit: null, removeHoursPerUnit: null, relocateHoursPerUnit: null }) as never;

beforeEach(() => {
  useCatalogStore.setState({
    baseCategories: [cat('c1', '광전송장치')] as never,
    baseTypes: [type('t1', '송변전광단말', 'c1'), type('rack', '랙', null, 'rack')] as never,
  } as never);
  useCatalogStore.getState().discard();
});

describe('AssetTypesTab', () => {
  it('분류별 종류를 렌더한다', () => {
    render(<AssetTypesTab />);
    expect(screen.getAllByText('광전송장치').length).toBeGreaterThan(0);
    expect(screen.getByText('송변전광단말')).toBeInTheDocument();
  });

  it('role 보유(rack) 종류는 시스템 잠금(삭제 버튼 없음)', () => {
    render(<AssetTypesTab />);
    expect(screen.getAllByText('시스템').length).toBeGreaterThan(0);
  });

  it('+ 종류 → stageCreateType (dirty 증가)', () => {
    render(<AssetTypesTab />);
    expect(useCatalogStore.getState().dirtyCount()).toBe(0);
    fireEvent.click(screen.getAllByText('+ 종류')[0]);
    expect(useCatalogStore.getState().dirtyCount()).toBe(1);
  });

  it('+ 분류 → stageCreateCategory', () => {
    render(<AssetTypesTab />);
    fireEvent.click(screen.getByText('+ 분류'));
    expect(useCatalogStore.getState().effectiveCategories().length).toBe(2);
  });

  it('설치(개당) 입력 변경 → stageUpdateType(id, { installHoursPerUnit })', () => {
    const spy = vi.spyOn(useCatalogStore.getState(), 'stageUpdateType');
    render(<AssetTypesTab />);
    // t1 is in category 'c1' (first group); rack is in '미분류' (last group)
    const inputs = screen.getAllByRole('spinbutton', { name: '설치(개당)' });
    fireEvent.change(inputs[0], { target: { value: '2.5' } });
    expect(spy).toHaveBeenCalledWith('t1', { installHoursPerUnit: 2.5 });
    spy.mockRestore();
  });
});

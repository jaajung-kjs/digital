import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CableTypesTab } from './CableTypesTab';
import { useCatalogStore } from './catalogStore';

const group = (id: string, name: string, color: string | null): never =>
  ({ id, name, color, sortOrder: 0, isActive: true }) as never;
const cat = (id: string, name: string, groupId: string): never =>
  ({ id, name, groupId, groupName: null, groupColor: null, sortOrder: 0, isActive: true }) as never;

beforeEach(() => {
  useCatalogStore.setState({
    baseCableGroups: [group('g1', '전원', '#ef4444')] as never,
    baseCableCategories: [cat('c1', 'Fr-sq3.5', 'g1')] as never,
  } as never);
  useCatalogStore.getState().discard();
});

describe('CableTypesTab', () => {
  it('그룹별 종류를 렌더한다', () => {
    render(<CableTypesTab />);
    expect(screen.getAllByText('전원').length).toBeGreaterThan(0);
    expect(screen.getByText('Fr-sq3.5')).toBeInTheDocument();
  });

  it('+ 그룹 → stageCreateCableGroup', () => {
    render(<CableTypesTab />);
    fireEvent.click(screen.getByText('+ 그룹'));
    expect(useCatalogStore.getState().effectiveCableGroups().length).toBe(2);
  });

  it('+ 종류 → stageCreateCableCategory (dirty 증가)', () => {
    render(<CableTypesTab />);
    expect(useCatalogStore.getState().dirtyCount()).toBe(0);
    fireEvent.click(screen.getAllByText('+ 종류')[0]);
    expect(useCatalogStore.getState().dirtyCount()).toBe(1);
  });

  it('그룹 색 입력이 존재한다', () => {
    render(<CableTypesTab />);
    expect(screen.getByLabelText('그룹 색')).toBeInTheDocument();
  });
});

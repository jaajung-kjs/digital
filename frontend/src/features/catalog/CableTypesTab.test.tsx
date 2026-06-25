import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CableTypesTab } from './CableTypesTab';
import { useCatalogStore } from './catalogStore';

const group = (id: string, name: string, color: string | null, extra?: object): never =>
  ({ id, name, color, sortOrder: 0, laborType: null, installHoursPerMeter: null, removeHoursPerMeter: null, relocateHoursPerMeter: null, ...extra }) as never;
const cat = (id: string, name: string, groupId: string): never =>
  ({ id, name, groupId, groupName: null, groupColor: null, sortOrder: 0 }) as never;

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

  it('+ 그룹 버튼이 없다 (고정 5분류)', () => {
    render(<CableTypesTab />);
    expect(screen.queryByText('+ 그룹')).toBeNull();
  });

  it('그룹 색 input[type=color]이 없다 (읽기전용 스와치)', () => {
    render(<CableTypesTab />);
    expect(document.querySelector('input[type="color"]')).toBeNull();
  });

  it('그룹 헤더에 읽기전용 색 스와치(div)가 있다', () => {
    render(<CableTypesTab />);
    expect(document.querySelector('[data-color-swatch]')).not.toBeNull();
  });

  it('설치(m당) 입력 변경 → stageUpdateCableGroup 호출', () => {
    render(<CableTypesTab />);
    const input = screen.getAllByLabelText('설치(m당)')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.05' } });
    const overlay = useCatalogStore.getState().cgOverlay;
    const updates = Object.values(overlay.updates);
    const found = updates.find((p) => p && (p as Record<string, unknown>).installHoursPerMeter === 0.05);
    expect(found).toBeDefined();
  });

  it('철거(m당) 입력 변경 → stageUpdateCableGroup 호출', () => {
    render(<CableTypesTab />);
    const input = screen.getAllByLabelText('철거(m당)')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.02' } });
    const overlay = useCatalogStore.getState().cgOverlay;
    const updates = Object.values(overlay.updates);
    const found = updates.find((p) => p && (p as Record<string, unknown>).removeHoursPerMeter === 0.02);
    expect(found).toBeDefined();
  });

  it('+ 종류 → stageCreateCableCategory (dirty 증가)', () => {
    render(<CableTypesTab />);
    expect(useCatalogStore.getState().dirtyCount()).toBe(0);
    fireEvent.click(screen.getAllByText('+ 종류')[0]);
    expect(useCatalogStore.getState().dirtyCount()).toBe(1);
  });

  it('종류명 편집 → stageUpdateCableCategory 호출', () => {
    render(<CableTypesTab />);
    // EditableField with valueClickEdits: click the displayed text to enter editing mode
    fireEvent.click(screen.getByText('Fr-sq3.5'));
    // Now the input with aria-label appears
    const input = screen.getByLabelText('종류명');
    fireEvent.change(input, { target: { value: '새이름' } });
    fireEvent.blur(input);
    const overlay = useCatalogStore.getState().ccOverlay;
    const updates = Object.values(overlay.updates);
    expect(updates.some((p) => p && (p as Record<string, unknown>).name === '새이름')).toBe(true);
  });
});

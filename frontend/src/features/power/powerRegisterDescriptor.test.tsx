import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock useCableCategories with two groups
vi.mock('../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({ data: [
    { id: 'catFR', name: 'FR', groupId: 'gP', isActive: true },
    { id: 'catHIV', name: 'HIV', groupId: 'gP', isActive: true },
    { id: 'catOPGW', name: 'OPGW', groupId: 'gO', isActive: true },
  ] }),
}));

// Mock substationWorkingCopy
vi.mock('../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: Object.assign(
    (sel: (s: unknown) => unknown) => sel({ patch: vi.fn(), effectiveCables: () => [] }),
    { getState: () => ({ patch: vi.fn() }) }
  ),
}));

// We test SpecCell indirectly via powerRegisterDescriptor columns
// Import the descriptor and render the SpecCell column via its cell function
import { powerRegisterDescriptor } from './powerRegisterDescriptor';

describe('SpecCell (규격 셀)', () => {
  it('같은 그룹 카테고리만 옵션에 포함(OPGW 제외)', () => {
    const specCol = powerRegisterDescriptor.columns.find((c) => c.label === '규격')!;
    const row = { cableId: 'c1', categoryId: 'catFR', spec: 'FR', loadAssetId: null, loadName: null, cbNumber: '1', voltage: '', capacity: '', switchState: 'ON' };
    render(<>{specCol.cell(row, {} as never)}</>);

    // Click pencil to enter edit mode
    const editBtn = screen.getByTitle('규격 수정');
    fireEvent.click(editBtn);

    const opts = screen.getByLabelText('규격');
    expect(within(opts as HTMLElement).queryByText('OPGW')).toBeNull();
    expect(within(opts as HTMLElement).getByText('HIV')).toBeInTheDocument();
  });
});

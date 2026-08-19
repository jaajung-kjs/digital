import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StatusTable } from '../components/StatusTable';
import type { StatusRow } from '../statusRows';

const row = (over: Partial<StatusRow> & Pick<StatusRow, 'id' | 'name' | 'status'>): StatusRow => ({
  typeName: '광단말',
  location: '1층',
  lastInspectedAt: null,
  fieldValues: {},
  assemblyRootId: null,
  depth: 0,
  ...over,
});

/** 설비 하나(뿌리 + 장비 둘) — 장비 하나가 고장이지만 설비는 정상으로 매겨 두었다. */
const ROWS: StatusRow[] = [
  row({ id: 'root', name: '판암 송광치', status: 'normal', assemblyRootId: 'root' }),
  row({ id: 'k1', name: '광단말 A', status: 'normal', assemblyRootId: 'root', depth: 1 }),
  row({ id: 'k2', name: '광단말 B', status: 'fault', assemblyRootId: 'root', depth: 1 }),
];

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('StatusTable — 상태는 그 자산에 저장된 값 그대로', () => {
  it('자손이 고장이어도 설비는 제 상태를 표시한다', () => {
    render(<StatusTable rows={ROWS} fieldColumns={[]} selectedId={null} onSelectAsset={() => {}} />);
    /* 굴려 올리지 않는다 — 사람이 정상으로 매겨 둔 설비를 화면이 제멋대로 고장으로
       바꿔 적으면, 그 화면은 저장된 값이 아니라 제 판단을 보여 주는 것이 된다. */
    expect(within(rowOf('판암 송광치')).getByText('정상')).toBeTruthy();
  });

  it('장비 줄은 펼쳤을 때 제 상태를 표시한다', () => {
    render(<StatusTable rows={ROWS} fieldColumns={[]} selectedId={null} onSelectAsset={() => {}} />);
    fireEvent.click(screen.getByLabelText('판암 송광치 펼치기'));
    expect(within(rowOf('광단말 B')).getByText('고장')).toBeTruthy();
  });
});

describe('StatusTable — 가지 줄의 재클릭은 접기다', () => {
  const rowsOf = () => screen.getAllByRole('row').length;

  it('설비 묶음을 다시 누르면 놓이는 것이 아니라 접힌다', () => {
    /* 하위를 품은 줄은 「갈 곳」이면서 「담는 것」이다. 재클릭이 해제를 뜻하면, 폴더를
       다시 눌러 접기를 기대한 사람에게 화면이 엉뚱하게 반응한다. */
    const onSelect = vi.fn();
    render(<StatusTable rows={ROWS} fieldColumns={[]} selectedId={null} onSelectAsset={onSelect} />);
    const parent = rowOf('판암 송광치');

    fireEvent.click(parent);
    expect(onSelect).toHaveBeenLastCalledWith('root');
  });

  it('고른 가지를 다시 누르면 접히고, 선택은 남는다', () => {
    const onSelect = vi.fn();
    render(<StatusTable rows={ROWS} fieldColumns={[]} selectedId="root" onSelectAsset={onSelect} />);
    const before = rowsOf();
    fireEvent.click(rowOf('판암 송광치'));
    /* 놓지 않는다 — 놓는 일은 빈 곳·Esc 가 맡는다. */
    expect(onSelect).not.toHaveBeenCalled();
    expect(rowsOf()).not.toBe(before);
  });
});

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

/** 설비 하나(뿌리 + 부품 둘) — 부품 하나가 고장이지만 설비는 정상으로 매겨 두었다. */
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

  it('부품 줄은 펼쳤을 때 제 상태를 표시한다', () => {
    render(<StatusTable rows={ROWS} fieldColumns={[]} selectedId={null} onSelectAsset={() => {}} />);
    fireEvent.click(screen.getByLabelText('판암 송광치 펼치기'));
    expect(within(rowOf('광단말 B')).getByText('고장')).toBeTruthy();
  });
});

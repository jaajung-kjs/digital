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

/** 설비 하나(뿌리 + 부품 둘) — 부품 하나가 고장이다. */
const ROWS: StatusRow[] = [
  row({ id: 'root', name: '판암 송광치', status: 'normal', assemblyRootId: 'root' }),
  row({ id: 'k1', name: '광단말 A', status: 'normal', assemblyRootId: 'root', depth: 1 }),
  row({ id: 'k2', name: '광단말 B', status: 'fault', assemblyRootId: 'root', depth: 1 }),
];

const table = (rows: StatusRow[] = ROWS) =>
  render(<StatusTable rows={rows} fieldColumns={[]} selectedId={null} onSelectAsset={() => {}} />);

/** 그 이름이 적힌 줄 하나. */
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('StatusTable — 접힌 설비 줄의 상태 롤업', () => {
  it('접힌 설비 줄은 안에 든 것 중 가장 나쁜 상태를 말한다', () => {
    table();
    /* 기본은 접힘 — 부품 줄은 아예 없다. 그런데도 고장은 보여야 한다. */
    expect(screen.queryByText('광단말 B')).toBeNull();
    expect(within(rowOf('판암 송광치')).getByText('고장')).toBeTruthy();
  });

  it('내역을 얹어 볼 수 있다 — 무엇이 몇인지', () => {
    table();
    expect(within(rowOf('판암 송광치')).getByTitle('정상 2 · 고장 1')).toBeTruthy();
  });

  it('「고장」으로 검색하면 그 고장을 품은 설비 줄이 걸린다', () => {
    table([...ROWS, row({ id: 'other', name: '멀쩡한 것', status: 'normal' })]);
    /* 롤업이 검색이 훑는 값에도 반영되지 않으면, 접힌 설비는 「고장」으로 찾히지 않는다. */
    fireEvent.change(screen.getByLabelText('자산 검색'), { target: { value: '고장' } });
    expect(screen.getByText('판암 송광치')).toBeTruthy();
    expect(screen.queryByText('멀쩡한 것')).toBeNull();
  });

  it('부품이 하나도 없는 자산은 제 상태를 그대로 말한다', () => {
    table([row({ id: 'solo', name: '단독 자산', status: 'standby' })]);
    expect(within(rowOf('단독 자산')).getByText('예비')).toBeTruthy();
  });
});

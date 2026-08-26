/**
 * 설비 현황 — **집계가 본문이고 목록은 그 안에 접혀 있다**.
 *
 * 묻는 말이 「이 본부에 L3 스위치가 몇 개지」·「광전송장치는 어디에 있지」인데, 예전 표는
 * 자산을 한 줄씩 늘어놓기만 했다. 여기서 지키는 것은 그 뒤집힌 순서다: 개수가 먼저,
 * 개체는 펼쳐서.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StatusOverview } from '../components/StatusOverview';
import type { StatusRow } from '../statusRows';

const row = (over: Partial<StatusRow> & Pick<StatusRow, 'id' | 'name' | 'status'>): StatusRow => ({
  typeName: 'L3 스위치',
  categoryName: '통신',
  kind: '장비',
  where: '1층',
  location: '판암 OFD',
  lastInspectedAt: '2026-03-01T00:00:00.000Z',
  fieldValues: {},
  assemblyRootId: null,
  depth: 0,
  ...over,
});

const ROWS: StatusRow[] = [
  row({ id: 'a', name: 'L3 스위치 1', status: 'normal' }),
  row({ id: 'b', name: 'L3 스위치 2', status: 'fault', where: '2층' }),
  row({ id: 'c', name: '판암 OFD', status: 'normal', typeName: 'OFD', kind: '설비', lastInspectedAt: null }),
  row({ id: 'd', name: '1층 분전반', status: 'normal', typeName: '분전반', kind: '설비', categoryName: '전원' }),
];

function show(rows: StatusRow[] = ROWS, extra: Partial<Parameters<typeof StatusOverview>[0]> = {}) {
  return render(
    <StatusOverview rows={rows} fieldColumns={[]} selectedId={null} onSelectAsset={vi.fn()} {...extra} />,
  );
}

const lineOf = (text: string) => screen.getByText(text).closest('tr')!;

describe('설비 현황 — 개수가 먼저다', () => {
  it('분류 ▸ 품목으로 접어 개수를 보여 준다', () => {
    show();

    /* 「통신 3」 — 분류가 그 아래 품목들의 합이다. */
    expect(within(lineOf('통신')).getByText('3')).toBeTruthy();
    expect(within(lineOf('L3 스위치')).getByText('2')).toBeTruthy();
    expect(within(lineOf('전원')).getByText('1')).toBeTruthy();
  });

  it('품목 줄을 펼치면 **어디에 있는지** 개체가 나온다', () => {
    show();

    expect(screen.queryByText('L3 스위치 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'L3 스위치 펼치기' }));

    expect(screen.getByText('L3 스위치 1')).toBeTruthy();
    expect(screen.getByText('L3 스위치 2')).toBeTruthy();
  });

  it('「어디에」는 고른 곳에 따라 뜻이 바뀐다 — 본부면 변전소, 변전소면 층', () => {
    show(ROWS, { nodeScope: true });
    expect(screen.getByText('어느 변전소에')).toBeTruthy();

    show();
    expect(screen.getAllByText('어느 층에').length).toBeGreaterThan(0);
  });

  it('품목 줄에 **어디에 몇 개**가 적힌다 — 펼치지 않고도 분포를 본다', () => {
    show();
    expect(within(lineOf('L3 스위치')).getByText('1층 1 · 2층 1')).toBeTruthy();
  });

  it('성한 것은 세지 않는다 — 손볼 것만 상태로 선다', () => {
    show();
    /* 「정상 47」은 볼 일이 없다. 고장 한 대가 그 줄에 보이는 것이 현황이다. */
    expect(within(lineOf('L3 스위치')).getByText(/고장 1/)).toBeTruthy();
    expect(within(lineOf('OFD')).queryByText(/정상/)).toBeNull();
  });
});

describe('설비 현황 — 칩으로 좁혀 본다', () => {
  it('설비/장비로 좁힌다', () => {
    show();

    fireEvent.click(screen.getByRole('button', { name: /설비 2/ }));

    expect(screen.queryByText('L3 스위치')).toBeNull();
    expect(screen.getByText('OFD')).toBeTruthy();
  });

  it('고장만 남긴다', () => {
    show();

    fireEvent.click(screen.getByRole('button', { name: /고장 1/ }));

    expect(within(lineOf('L3 스위치')).getByText('1')).toBeTruthy();
    expect(screen.queryByText('OFD')).toBeNull();
  });

  it('미점검 — 점검 이력이 하나도 없는 것만(임의의 기간 기준은 두지 않는다)', () => {
    show();

    fireEvent.click(screen.getByRole('button', { name: /미점검 1/ }));

    expect(screen.getByText('OFD')).toBeTruthy();
    expect(screen.queryByText('L3 스위치')).toBeNull();
  });

  it('칩의 숫자는 **거르기 전 전체**다 — 걸러 놓고 다시 세면 늘 0 이 된다', () => {
    show();

    fireEvent.click(screen.getByRole('button', { name: /고장 1/ }));

    expect(screen.getByRole('button', { name: /설비 2/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /미점검 1/ })).toBeTruthy();
  });
});

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

  it('개체 줄의 「위치」는 고른 곳에 따라 뜻이 바뀐다 — 본부면 변전소부터, 변전소면 층부터', () => {
    show(ROWS, { nodeScope: true, rows: [row({ id: 'a', name: 'L3 스위치 1', status: 'normal', where: '춘천S/S', location: '판암 OFD' })] });
    fireEvent.click(screen.getByRole('button', { name: 'L3 스위치 펼치기' }));
    /* 본부에서는 어느 변전소인지가 먼저다. */
    expect(screen.getByText('춘천S/S · 판암 OFD')).toBeTruthy();

    show([row({ id: 'a', name: 'L3 스위치 1', status: 'normal', where: '1층', location: '1층 · 판암 OFD · 1행 1열' })]);
    fireEvent.click(screen.getAllByRole('button', { name: 'L3 스위치 펼치기' }).at(-1)!);
    /* 변전소 안에서는 층부터의 경로가 이미 그것을 말한다. */
    expect(screen.getByText('1층 · 판암 OFD · 1행 1열')).toBeTruthy();
  });

  it('개체 줄은 **저장된 이름·상태·자리·점검일**을 그 열에 채운다 — 개수 칸에 날짜를 넣지 않는다', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'L3 스위치 펼치기' }));

    const cells = [...lineOf('L3 스위치 1').querySelectorAll('td')].map((td) => td.textContent?.trim());
    expect(cells[0]).toBe('L3 스위치 1');
    expect(cells[1]).toBe('');            // 개수는 집계 줄의 것이다
    expect(cells[2]).toContain('정상');
    expect(cells[3]).toBe('판암 OFD');
    expect(cells.at(-1)).toBe('2026-03-01');
  });

  it('접힌 줄은 **얼마나 · 성한가**만 말한다 — 자리는 비워 둔다(펼치면 순서대로 나온다)', () => {
    show();

    const cells = [...lineOf('L3 스위치').querySelectorAll('td')].map((td) => td.textContent?.trim());
    expect(cells[1]).toBe('2');   // 개수
    expect(cells[3]).toBe('');    // 위치 — 접힌 줄에서는 비어 있다
  });

  it('펼친 개체는 **자리 순**으로 선다 — 어디에 몇 개인지가 순서로 읽힌다', () => {
    show([
      row({ id: 'b', name: '나중', status: 'normal', where: '2층' }),
      row({ id: 'a', name: '먼저', status: 'normal', where: '1층' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'L3 스위치 펼치기' }));

    const names = [...document.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')?.textContent?.trim());
    expect(names.filter((n) => n === '먼저' || n === '나중')).toEqual(['먼저', '나중']);
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

  it('본부에서는 **누른다고 옮기지 않는다** — 고르기만 하고, 옮기는 것은 또렷한 한 번이다', () => {
    const onSelectAsset = vi.fn();
    const onOpenElsewhere = vi.fn();
    show(ROWS, { nodeScope: true, onSelectAsset, onOpenElsewhere });
    fireEvent.click(screen.getByRole('button', { name: 'L3 스위치 펼치기' }));

    fireEvent.click(screen.getByText('L3 스위치 1'));
    expect(onSelectAsset).toHaveBeenCalledWith('a');
    expect(onOpenElsewhere).not.toHaveBeenCalled();   // 보던 자리를 잃지 않는다

    fireEvent.click(screen.getByRole('button', { name: 'L3 스위치 1 이 있는 변전소에서 열기' }));
    expect(onOpenElsewhere).toHaveBeenCalledWith('a');
  });

  it('변전소 안에서는 그 단추가 없다 — 옮길 곳이 없다', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'L3 스위치 펼치기' }));

    expect(screen.queryByRole('button', { name: /변전소에서 열기/ })).toBeNull();
  });
});

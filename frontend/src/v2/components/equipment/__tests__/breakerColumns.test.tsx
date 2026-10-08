import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TableCard } from '../../../../components/ui';
import { BREAKER_COLUMNS, BreakerCells, type BreakerRowView } from '../breakerColumns';
import { asViewer } from '../../../../tests/asRole';

const row = (o: Partial<BreakerRowView['circuit']>, extra: Partial<BreakerRowView> = {}): BreakerRowView => ({
  no: 1,
  circuit: { label: null, current: null, voltage: null, capacity: null, phase: null, switch: null, purpose: null, ...o },
  load: null, cable: null, lengthM: null, ...extra,
});

/** 좁은 판(mid) — 전압+용량은 「정격」, 길이는 전원케이블 뒤로 병합된다. */
function renderMid(r: BreakerRowView) {
  render(
    <TableCard columns={BREAKER_COLUMNS} tier="mid">
      <tbody><tr><BreakerCells row={r} onSet={() => undefined} onConnect={() => undefined} /></tr></tbody>
    </TableCard>,
  );
  const cell = (col: string) => document.querySelector<HTMLElement>(`td[data-col="${col}"]`)!;
  return cell;
}

describe('차단기 병합 칸 — 빈 조각은 뺀다', () => {
  asViewer();

  it('정격: 전압이 비면 「— · 50 A」가 아니라 「50 A」(용량 「50A」는 보일 때만 띄운다)', () => {
    const cell = renderMid(row({ capacity: '50A' }));
    expect(cell('rating').textContent).toBe('50 A');
  });

  it('정격: 둘 다 있으면 「220 V · 30 A」, 용량만 비면 전압만', () => {
    const cell = renderMid(row({ voltage: '220V', capacity: '30A' }));
    expect(cell('rating').textContent).toBe('220 V·30 A');
    expect(cell('rating')).toHaveTextContent('220 V');
    expect(cell('rating')).toHaveTextContent('30 A');
    expect(cell('rating').textContent).not.toContain('—');
  });

  it('정격: 둘 다 비면 「—」 하나', () => {
    const cell = renderMid(row({}));
    expect(cell('rating').textContent).toBe('—');
  });

  it('전원케이블 + 길이: 케이블이 비면 「12 m」만, 둘 다 있으면 「F-CV · 12 m」', () => {
    const cell = renderMid(row({}, { lengthM: 12 }));
    expect(cell('cable').textContent).toBe('12 m');
  });

  it('전원케이블 + 길이: 둘 다 있으면 「F-CV · 12 m」', () => {
    const cell = renderMid(row({}, { cable: 'F-CV', lengthM: 12 }));
    expect(cell('cable').textContent).toBe('F-CV · 12 m');
  });

  it('전원케이블: 둘 다 비면 「—」', () => {
    const cell = renderMid(row({}));
    expect(cell('cable').textContent).toBe('—');
  });

  it('부하 + 포트: 포트가 비면 이름만', () => {
    const cell = renderMid(row({}, { load: { equipmentId: null, name: '충전기', port: null } }));
    expect(cell('load').textContent).toBe('충전기');
  });
});

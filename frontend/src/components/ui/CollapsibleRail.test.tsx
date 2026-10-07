import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CollapsibleRail } from './CollapsibleRail';

const KEY = 'test.rail.collapsed';
const renderRail = () => render(
  <CollapsibleRail storageKey={KEY} title="조직" className="w-64" data-testid="rail">
    {(collapse) => <div><span>조직</span>{collapse}<p>트리 내용</p></div>}
  </CollapsibleRail>,
);

beforeEach(() => window.localStorage.clear());

describe('CollapsibleRail', () => {
  it('처음에는 펼친 채 — 접으면 트리가 숨고 펼치기 단추만 남은 띠가 된다', () => {
    renderRail();
    expect(screen.getByText('트리 내용')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '조직 접기' }));
    expect(screen.getByTestId('rail')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByText('트리 내용')).not.toBeVisible();
    expect(screen.getByRole('button', { name: '조직 펼치기' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '조직 펼치기' }));
    expect(screen.getByText('트리 내용')).toBeVisible();
    expect(screen.queryByRole('button', { name: '조직 펼치기' })).toBeNull();
  });

  it('접힘은 이 브라우저가 기억한다 — 다시 열면 접힌 채', () => {
    const first = renderRail();
    fireEvent.click(screen.getByRole('button', { name: '조직 접기' }));
    first.unmount();
    renderRail();
    expect(screen.getByTestId('rail')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('button', { name: '조직 펼치기' })).toBeInTheDocument();
  });

  it('저장소를 못 쓰면 펼친 채로 — 손은 그대로 듣는다', () => {
    const orig = Storage.prototype.getItem;
    const origSet = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
    try {
      renderRail();
      expect(screen.getByText('트리 내용')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: '조직 접기' }));
      expect(screen.getByTestId('rail')).toHaveAttribute('data-collapsed', 'true');
    } finally {
      Storage.prototype.getItem = orig;
      Storage.prototype.setItem = origSet;
    }
  });
});

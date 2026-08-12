/**
 * 바깥을 누르면 풀린다 — **앱 공통 규칙**이라 여기서 잠근다.
 *
 * 고르는 화면마다 제 손으로 「빈 곳」을 정의하면 반드시 한 곳이 빠진다. 실제로 격자는 빈
 * 칸과 Esc 만 알아, 상단 머리줄이나 목록을 눌러도 선택이 남아 있었다.
 */
import { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDismissOnOutside } from './useDismissOnOutside';

function Harness({ active, onDismiss }: { active: boolean; onDismiss: () => void }) {
  const panel = useRef<HTMLDivElement | null>(null);
  const detail = useRef<HTMLDivElement | null>(null);
  useDismissOnOutside(active, [panel, detail], onDismiss);
  return (
    <div>
      <header>
        <button type="button">머리줄 버튼</button>
      </header>
      <div ref={panel}>
        <button type="button">판 안쪽</button>
      </div>
      <div ref={detail}>
        <button type="button">상세 안쪽</button>
      </div>
    </div>
  );
}

const down = (el: Element) =>
  fireEvent(el, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));

describe('useDismissOnOutside', () => {
  it('바깥을 누르면 푼다', () => {
    const onDismiss = vi.fn();
    render(<Harness active onDismiss={onDismiss} />);
    down(screen.getByRole('button', { name: '머리줄 버튼' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /* 고른 것을 다루는 자리는 「안」이다 — 이름을 고치다 선택이 풀리면 안 된다. */
  it('판이나 상세 안쪽은 바깥이 아니다', () => {
    const onDismiss = vi.fn();
    render(<Harness active onDismiss={onDismiss} />);
    down(screen.getByRole('button', { name: '판 안쪽' }));
    down(screen.getByRole('button', { name: '상세 안쪽' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('고른 것이 없으면 듣지 않는다', () => {
    const onDismiss = vi.fn();
    render(<Harness active={false} onDismiss={onDismiss} />);
    down(screen.getByRole('button', { name: '머리줄 버튼' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  /* 방금 지워진 버튼(예: 목록에서 사라진 행)을 누른 것은 그 동작 자체가 선택을 다루고 있다. */
  it('이미 화면에서 떨어져 나간 노드는 바깥으로 세지 않는다', () => {
    const onDismiss = vi.fn();
    render(<Harness active onDismiss={onDismiss} />);
    const orphan = document.createElement('button');
    down(orphan);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

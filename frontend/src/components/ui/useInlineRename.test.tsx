/**
 * 제자리 이름 바꾸기 — **여러 화면이 같은 규칙**이라 여기서 잠근다.
 *
 * 예전에는 자산 종류 탭·설비 종류 탭·케이블 종류 탭이 각자 같은 코드를 들고 있었다
 * (상태 두 개 · 커밋 함수 · Enter/Escape/onBlur 처리가 한 글자도 다르지 않았다).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useInlineRename } from './useInlineRename';

function Harness({ onCommit }: { onCommit: (id: string, name: string) => void }) {
  const rename = useInlineRename(onCommit);
  return rename.isEditing('a') ? (
    <>{rename.field('a', '광', '분류 이름 편집')}</>
  ) : (
    <button type="button" onClick={() => rename.start('a', '광')}>
      광
    </button>
  );
}

const field = () => screen.getByLabelText('분류 이름 편집') as HTMLInputElement;
const startEditing = () => fireEvent.click(screen.getByRole('button', { name: '광' }));

describe('useInlineRename', () => {
  it('고치기 시작하면 지금 이름이 담긴 상자가 선다', () => {
    render(<Harness onCommit={vi.fn()} />);
    startEditing();
    expect(field().value).toBe('광');
  });

  it('Enter 로 커밋한다', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    startEditing();
    fireEvent.change(field(), { target: { value: '광케이블' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('a', '광케이블');
  });

  it('포커스를 잃어도 커밋한다', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    startEditing();
    fireEvent.change(field(), { target: { value: '광케이블' } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledWith('a', '광케이블');
  });

  it('Escape 는 물린다 — 고치던 값을 보내지 않는다', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    startEditing();
    fireEvent.change(field(), { target: { value: '광케이블' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '광' })).toBeTruthy();
  });

  /* 실수로 지우는 길을 만들지 않는다 — 빈 이름은 커밋이 아니라 물림이다. */
  it('비웠거나 그대로면 아무 일도 하지 않는다', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    startEditing();
    fireEvent.change(field(), { target: { value: '   ' } });
    fireEvent.blur(field());
    startEditing();
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
  });
});

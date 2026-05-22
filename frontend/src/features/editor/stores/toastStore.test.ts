import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('showToast 는 기본 success 타입으로 토스트를 추가한다', () => {
    useToastStore.getState().showToast('저장했습니다');
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('저장했습니다');
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].id).toBeTruthy();
  });

  it('showToast 는 명시한 타입을 사용한다', () => {
    useToastStore.getState().showToast('실패', 'error');
    expect(useToastStore.getState().toasts[0].type).toBe('error');
  });

  it('dismissToast 는 id 로 토스트를 제거한다', () => {
    useToastStore.getState().showToast('A');
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().dismissToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('토스트는 지정 시간 후 자동 제거된다', () => {
    vi.useFakeTimers();
    useToastStore.getState().showToast('temp');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(2600);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });
});

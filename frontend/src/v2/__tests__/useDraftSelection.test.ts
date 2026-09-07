import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDraftSelection } from '../useDraftSelection';

const ENTITIES = [
  { id: 'a', name: '가' },
  { id: 'b', name: '나' },
];
const toDraft = (e: { id: string; name: string }) => ({ name: e.name });
const yes = () => Promise.resolve(true);

const setup = (entities = ENTITIES) =>
  renderHook(() => useDraftSelection({ entities, toDraft, confirmLeave: yes }));

describe('useDraftSelection — 「안 골랐다」와 「놓았다」는 다르다', () => {
  it('처음 들어오면 첫 항목이 열려 있다', () => {
    expect(setup().result.current.selectedId).toBe('a');
  });

  it('놓으면 놓인 채로 있다 — 첫 항목으로 되돌아가지 않는다', async () => {
    /* 「고른 것이 없으면 첫 번째」로 적어 두었더니 놓을 수가 없었다: 빈 곳을 눌러도
       Esc 를 눌러도 선택이 첫 항목으로 튕겨 돌아왔다. */
    const { result } = setup();
    await act(async () => result.current.select(null));
    expect(result.current.selectedId).toBeNull();
  });

  it('고른 것이 목록에서 사라지면 첫 항목으로 물러선다', () => {
    const { result, rerender } = renderHook(
      ({ entities }) => useDraftSelection({ entities, toDraft, confirmLeave: yes }),
      { initialProps: { entities: ENTITIES } },
    );
    act(() => void result.current.select('b'));
    rerender({ entities: [ENTITIES[0]!] });
    expect(result.current.selectedId).toBe('a');
  });

  it('떠나기로 하면 **버린다** — 돌아와도 되살아나지 않는다', async () => {
    /* 예전에는 편집을 「어느 것의 것인가(id)」로 가리기만 했다. 다른 것을 보는 동안 안 보일
       뿐 남아 있어서, 「변경 1건이 사라집니다」에 「이동」을 눌러도 돌아오면 그대로였고
       나갈 때마다 같은 상자가 다시 떴다 — 끝이 없었다. */
    const { result } = setup();
    act(() => result.current.setDraft({ name: '고친 이름' }));
    expect(result.current.dirty).toBe(true);
    await act(async () => result.current.select('b'));
    await act(async () => result.current.select('a'));
    expect(result.current.draft).toEqual({ name: '가' });
    expect(result.current.dirty).toBe(false);
  });

  it('물리면 원본으로 — 다시 돌아와도 원본이다', async () => {
    const { result } = setup();
    act(() => result.current.setDraft({ name: '고친 이름' }));
    act(() => result.current.cancel());
    expect(result.current.dirty).toBe(false);
    await act(async () => result.current.select('b'));
    await act(async () => result.current.select('a'));
    expect(result.current.draft).toEqual({ name: '가' });
  });

  it('새로 만들던 초안은 **새 줄에** 붙는다 — 옮기기 전 항목이 아니라', async () => {
    const { result } = setup();
    await act(async () => result.current.startNew({ name: '' }));
    expect(result.current.isNew).toBe(true);
    expect(result.current.draft).toEqual({ name: '' });
  });

  it('고친 것이 있으면 묻고, 아니라고 하면 옮기지 않는다', async () => {
    const no = vi.fn(() => Promise.resolve(false));
    const { result } = renderHook(() => useDraftSelection({ entities: ENTITIES, toDraft, confirmLeave: no }));
    act(() => result.current.setDraft({ name: '고친 이름' }));
    await act(async () => result.current.select('b'));
    expect(no).toHaveBeenCalled();
    expect(result.current.selectedId).toBe('a');
  });
});

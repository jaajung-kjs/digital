/**
 * TreePanel — **앱의 모든 트리가 같은 문장**을 쓴다(조직 · 설비 품목 · 장비 품목 · 케이블 품목).
 *
 * 여기서 지키는 것은 그 문장이다: 트리는 「층마다 무엇이 서는가」로만 기술되고, 손잡이는
 * 어느 줄에서나 `+`·연필·휴지통 셋이며, **무엇이 만들어지는지는 누른 자리가 정한다**.
 * 예전에는 트리마다 줄마다 「지사 추가」 같은 문구를 손으로 적었고, 트리가 하나 늘 때마다
 * 또 적었다. 문구는 이제 층 선언에서만 나온다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreePanel, type TreeKind, type TreeNode } from './TreePanel';

const ORG: TreeKind[] = [
  { label: '본부', create: 'inline', rename: true, remove: true },
  { label: '전력지사', create: 'inline', rename: true, remove: true },
  { label: '변전소', create: 'inline', rename: true, remove: true },
];
/** 대장 — 분류는 이름만으로 서고(뼈대), 품목은 오른쪽 초안에서 만든다(내용). */
const CATALOG: TreeKind[] = [
  { label: '분류', create: 'inline', rename: true, remove: true },
  { label: '장비 품목', create: 'editor' },
];

const row = (over: Partial<TreeNode> & { id: string; text: string }): TreeNode => ({
  label: over.text, depth: 0, ...over,
});

describe('TreePanel — 무엇이 만들어지는지는 누른 자리가 정한다', () => {
  it('머리줄의 `+` 는 뿌리 안에 하나 — 무엇이 만들어지는지 이름에 적힌다', () => {
    render(<TreePanel title="조직" kinds={ORG} nodes={[]} selectedId={null} onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: '새 본부' })).toBeTruthy();
  });

  it('줄의 `+` 는 **그 안에** 하나 — 다음 층의 것이 만들어진다', () => {
    render(
      <TreePanel title="조직" kinds={ORG} selectedId={null} onSelect={() => {}}
        nodes={[row({ id: 'hq', text: '강원본부' }), row({ id: 'br', text: '직할', depth: 1 })]} />,
    );

    expect(screen.getByRole('button', { name: '강원본부 안에 새 전력지사' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '직할 안에 새 변전소' })).toBeTruthy();
  });

  it('맨 아래 층에는 `+` 가 없다 — 그 안에 설 것이 없다', () => {
    render(
      <TreePanel title="조직" kinds={ORG} selectedId={null} onSelect={() => {}}
        nodes={[row({ id: 'ss', text: '춘천S/S', depth: 2 })]} />,
    );

    expect(screen.queryByRole('button', { name: /춘천S\/S 안에/ })).toBeNull();
    expect(screen.getByRole('button', { name: '춘천S/S 이름 바꾸기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '춘천S/S 삭제' })).toBeTruthy();
  });

  it('`+` 를 누르면 그 자리에 줄이 서고 **이름이 채워진 채** 잡혀 있다 — Enter 면 그대로 만든다', () => {
    const onCreate = vi.fn();
    render(
      <TreePanel title="조직" kinds={ORG} selectedId={null} onSelect={() => {}} onCreate={onCreate}
        nodes={[row({ id: 'hq', text: '강원본부' })]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '강원본부 안에 새 전력지사' }));

    const field = screen.getByLabelText('새 전력지사 이름') as HTMLInputElement;
    /* 그대로 Enter 해도 쓸 수 있는 이름이어야 한다(탐색기의 「untitled folder」). */
    expect(field.value).toBe('새 전력지사');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onCreate).toHaveBeenCalledWith({ level: 1, parentId: 'hq', name: '새 전력지사' });
  });

  it('친 이름으로 만든다 — 앞뒤 공백은 이름이 아니다', () => {
    const onCreate = vi.fn();
    render(<TreePanel title="조직" kinds={ORG} nodes={[]} selectedId={null} onSelect={() => {}} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: '새 본부' }));
    const field = screen.getByLabelText('새 본부 이름');
    fireEvent.change(field, { target: { value: '  중부본부  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onCreate).toHaveBeenCalledWith({ level: 0, parentId: null, name: '중부본부' });
  });

  it('Esc · 빈 이름이면 **아무것도 만들지 않는다** — 서버로 가는 것은 확정할 때다', () => {
    const onCreate = vi.fn();
    render(<TreePanel title="조직" kinds={ORG} nodes={[]} selectedId={null} onSelect={() => {}} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: '새 본부' }));
    fireEvent.keyDown(screen.getByLabelText('새 본부 이름'), { key: 'Escape' });
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '새 본부' }));
    const field = screen.getByLabelText('새 본부 이름');
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('이름만으로 서지 않는 층(품목)은 줄을 세우지 않고 **초안을 연다**', () => {
    const onCreate = vi.fn();
    render(
      <TreePanel title="장비 품목" kinds={CATALOG} selectedId={null} onSelect={() => {}} onCreate={onCreate}
        nodes={[row({ id: 'c1', text: '통신' })]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '통신 안에 새 장비 품목' }));

    expect(onCreate).toHaveBeenCalledWith({ level: 1, parentId: 'c1' });
    expect(screen.queryByLabelText('새 장비 품목 이름')).toBeNull();
  });

  it('연필 → 그 자리에서 고친다. 그대로면 아무 일도 하지 않는다', () => {
    const onRename = vi.fn();
    render(
      <TreePanel title="조직" kinds={ORG} selectedId={null} onSelect={() => {}} onRename={onRename}
        nodes={[row({ id: 'hq', text: '강원본부' })]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '강원본부 이름 바꾸기' }));
    fireEvent.keyDown(screen.getByLabelText('강원본부 이름'), { key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '강원본부 이름 바꾸기' }));
    const field = screen.getByLabelText('강원본부 이름');
    fireEvent.change(field, { target: { value: '중부본부' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'hq' }), '중부본부');
  });

  it('지금 지울 수 없으면 휴지통이 잠기고 **왜인지 말한다** — 감추지 않는다', () => {
    render(
      <TreePanel title="장비 품목" kinds={CATALOG} selectedId={null} onSelect={() => {}}
        nodes={[row({ id: 'c1', text: '통신', removeBlocked: '이 분류에 20개가 들어 있어 지울 수 없습니다' })]} />,
    );

    const btn = screen.getByRole('button', { name: /통신 삭제/ });
    expect(btn).toHaveProperty('disabled', true);
    expect(btn.title).toBe('이 분류에 20개가 들어 있어 지울 수 없습니다');
  });

  it('층을 주지 않으면 **보는 트리**다 — 손잡이가 하나도 서지 않는다', () => {
    render(
      <TreePanel title="케이블 품목" selectedId={null} onSelect={() => {}}
        nodes={[row({ id: 'g1', text: '광케이블' })]} />,
    );

    expect(screen.queryByRole('button', { name: /광케이블/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^새 / })).toBeNull();
  });

  it('거절당하면 **치던 줄이 그대로 남고** 그 자리에서 이유를 말한다', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("'구조' 분류가 이미 있습니다"));
    render(<TreePanel title="장비 품목" kinds={CATALOG} nodes={[]} selectedId={null} onSelect={() => {}} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: '새 분류' }));
    const field = screen.getByLabelText('새 분류 이름') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '구조' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', "'구조' 분류가 이미 있습니다");
    /* 치던 이름이 남아 있어야 한다 — 고쳐서 다시 내면 되는 일이다. */
    expect((screen.getByLabelText('새 분류 이름') as HTMLInputElement).value).toBe('구조');
  });

  it('Esc 로 접으면 그 이유도 함께 사라진다 — 그 줄의 것이었다', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('이미 있습니다'));
    render(<TreePanel title="장비 품목" kinds={CATALOG} nodes={[]} selectedId={null} onSelect={() => {}} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: '새 분류' }));
    const field = screen.getByLabelText('새 분류 이름');
    fireEvent.change(field, { target: { value: '구조' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await screen.findByRole('alert');

    fireEvent.keyDown(screen.getByLabelText('새 분류 이름'), { key: 'Escape' });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByLabelText('새 분류 이름')).toBeNull();
  });
});

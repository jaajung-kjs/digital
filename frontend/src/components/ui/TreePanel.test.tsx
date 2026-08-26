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

/* 브라우저가 끌기에 딸려 주는 것 — jsdom 은 만들어 주지 않는다. */
const dataTransfer = { effectAllowed: '', setData: () => {}, getData: () => '' };

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
  it('최상위를 만드는 자리는 **목록 바닥의 글자 줄**이다 — 머리줄에는 아무것도 없다', () => {
    render(<TreePanel title="조직" kinds={ORG} nodes={[]} selectedId={null} onSelect={() => {}} />);

    /* 글자가 있어 설명이 필요 없다 — 예전의 머리줄 아이콘 `+` 는 아무도 찾지 못했다. */
    expect(screen.getByRole('button', { name: '새 본부' }).textContent).toContain('새 본부');
  });

  it('만들 수 없는 층이면 그 줄도 서지 않는다', () => {
    render(
      <TreePanel title="케이블 품목" kinds={[{ label: '케이블 그룹' }]} nodes={[]} selectedId={null} onSelect={() => {}} />,
    );

    expect(screen.queryByRole('button', { name: /새 / })).toBeNull();
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

  it('만들다 말고 딴 데를 누르면 **없던 일이 된다** — 채워 둔 이름은 우리가 넣은 것이다', () => {
    const onCreate = vi.fn();
    render(<TreePanel title="조직" kinds={ORG} nodes={[]} selectedId={null} onSelect={() => {}} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: '새 본부' }));
    fireEvent.blur(screen.getByLabelText('새 본부 이름'));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('새 본부 이름')).toBeNull();
  });

  it('이름을 고치다 딴 데를 누르면 **확정된다** — 이미 있는 것을 고르고 친 것이다', () => {
    const onRename = vi.fn();
    render(
      <TreePanel title="조직" kinds={ORG} selectedId={null} onSelect={() => {}} onRename={onRename}
        nodes={[row({ id: 'hq', text: '강원본부' })]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '강원본부 이름 바꾸기' }));
    const field = screen.getByLabelText('강원본부 이름');
    fireEvent.change(field, { target: { value: '중부본부' } });
    fireEvent.blur(field);

    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'hq' }), '중부본부');
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

  it('끌어서 순서를 바꾸면 **그 부모의 자식 전체**를 새 순서로 알린다', () => {
    const onReorder = vi.fn();
    const KINDS: TreeKind[] = [{ label: '본부', create: 'inline', reorder: true }];
    render(
      <TreePanel title="조직" kinds={KINDS} selectedId={null} onSelect={() => {}} onReorder={onReorder}
        nodes={[row({ id: 'a', text: '가' }), row({ id: 'b', text: '나' }), row({ id: 'c', text: '다' })]} />,
    );

    const rows = screen.getAllByRole('treeitem');
    /* 줄의 **어느 쪽 절반**에 놓았는지가 위·아래를 가른다 — jsdom 은 크기를 안 재므로 준다. */
    const rect = { top: 0, height: 20, bottom: 20, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);

    fireEvent.dragStart(rows[2]!, { dataTransfer });   // 「다」를 집어
    /* jsdom 에는 DragEvent 가 없어 clientY 가 실리지 않는다 — 마우스 이벤트로 직접 보낸다. */
    fireEvent(rows[0]!, new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY: 2 }));
    fireEvent.drop(rows[0]!);

    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null, order: ['c', 'a', 'b'] }),
    );

    /* 아랫절반이면 그 **뒤**로 간다. */
    onReorder.mockClear();
    fireEvent.dragStart(rows[2]!, { dataTransfer });
    fireEvent(rows[0]!, new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY: 18 }));
    fireEvent.drop(rows[0]!);
    expect(onReorder).toHaveBeenCalledWith(expect.objectContaining({ order: ['a', 'c', 'b'] }));
  });

  it('남의 자식들 사이에는 놓이지 않는다 — 순서 바꾸기는 같은 부모 안의 일이다', () => {
    const onReorder = vi.fn();
    const KINDS: TreeKind[] = [
      { label: '본부', reorder: true },
      { label: '전력지사', reorder: true },
    ];
    render(
      <TreePanel title="조직" kinds={KINDS} selectedId={null} onSelect={() => {}} onReorder={onReorder}
        nodes={[
          row({ id: 'hq1', text: '강원' }), row({ id: 'b1', text: '직할', depth: 1 }),
          row({ id: 'hq2', text: '중부' }), row({ id: 'b2', text: '중부지사', depth: 1 }),
        ]} />,
    );

    const rows = screen.getAllByRole('treeitem');
    fireEvent.dragStart(rows[1]!, { dataTransfer });            // 강원의 「직할」을
    fireEvent(rows[3]!, new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY: 2 })); // 중부의 「중부지사」 자리로
    fireEvent.drop(rows[3]!);

    expect(onReorder).not.toHaveBeenCalled();
  });
});

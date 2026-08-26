/**
 * TreePanel — **앱의 모든 트리가 같은 문장을 쓴다**(조직 · 설비 품목 · 장비 품목 · 케이블 품목).
 *
 * 여기서 지키는 것은 그 문장 자체다: 한 줄이 할 수 있는 일은 그 줄의 `⋯` 안에 글자로 있고,
 * 머리줄도 하나의 줄(뿌리)이며, 만들고 이름 고치는 일은 트리 안의 빈 줄에서 끝난다.
 * 예전에는 트리마다 아이콘 구성이 달랐고(조직은 셋, 대장은 하나), 머리줄의 정체불명 `+` 가
 * 어떤 화면에서는 상자를 열고 어떤 화면에서는 줄을 만들었다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreePanel, type TreeNode } from './TreePanel';

const node = (over: Partial<TreeNode> & { id: string; text: string }): TreeNode => ({
  label: over.text, depth: 0, ...over,
});

function open(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('TreePanel — 한 줄이 할 수 있는 일은 ⋯ 안에 글자로 있다', () => {
  it('줄의 ⋯ 에 「<자식> 추가 · 이름 바꾸기 · 삭제」가 이 순서로 선다', () => {
    render(
      <TreePanel
        title="조직"
        selectedId={null}
        onSelect={() => {}}
        nodes={[node({
          id: 'hq', text: '강원본부',
          addChild: { label: '지사', run: () => {} },
          rename: () => {},
          remove: { run: () => {} },
        })]}
      />,
    );

    open('강원본부 관리');
    /* 되돌릴 수 없는 것은 늘 맨 아래 — 손이 미끄러져도 그 자리에 오지 않는다. */
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['지사 추가', '이름 바꾸기', '삭제']);
  });

  it('머리줄도 하나의 줄이다 — 뿌리에 만드는 일이 거기 글자로 있다(정체불명 `+` 없음)', () => {
    const run = vi.fn();
    render(
      <TreePanel title="장비 품목" selectedId={null} onSelect={() => {}} nodes={[]}
        root={{ addChild: { label: '분류', run } }} />,
    );

    open('장비 품목 관리');
    expect(screen.getByRole('menuitem', { name: '분류 추가' })).toBeTruthy();
  });

  it('만들기 → 그 자리에 빈 줄이 서고, 이름을 치면 그 이름으로 만든다', () => {
    const run = vi.fn();
    render(
      <TreePanel title="장비 품목" selectedId={null} onSelect={() => {}} nodes={[]}
        root={{ addChild: { label: '분류', run } }} />,
    );

    open('장비 품목 관리');
    fireEvent.click(screen.getByRole('menuitem', { name: '분류 추가' }));

    const field = screen.getByLabelText('새 분류 이름');
    fireEvent.change(field, { target: { value: '  계측  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    /* 앞뒤 공백은 이름이 아니다. */
    expect(run).toHaveBeenCalledWith('계측');
  });

  it('빈 이름·Esc 는 아무 일도 하지 않는다 — 이름 없는 것을 만들 길을 두지 않는다', () => {
    const run = vi.fn();
    render(
      <TreePanel title="조직" selectedId={null} onSelect={() => {}} nodes={[]}
        root={{ addChild: { label: '본부', run } }} />,
    );

    open('조직 관리');
    fireEvent.click(screen.getByRole('menuitem', { name: '본부 추가' }));
    fireEvent.keyDown(screen.getByLabelText('새 본부 이름'), { key: 'Enter' });
    expect(run).not.toHaveBeenCalled();

    open('조직 관리');
    fireEvent.click(screen.getByRole('menuitem', { name: '본부 추가' }));
    const field = screen.getByLabelText('새 본부 이름');
    fireEvent.change(field, { target: { value: '중부본부' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(run).not.toHaveBeenCalled();
  });

  it('이름 바꾸기 → 그 자리에서 고친다. 그대로면 아무 일도 하지 않는다', () => {
    const rename = vi.fn();
    render(
      <TreePanel title="조직" selectedId={null} onSelect={() => {}}
        nodes={[node({ id: 'hq', text: '강원본부', rename })]} />,
    );

    open('강원본부 관리');
    fireEvent.click(screen.getByRole('menuitem', { name: '이름 바꾸기' }));
    const field = screen.getByLabelText('강원본부 이름');
    fireEvent.keyDown(field, { key: 'Enter' }); // 그대로 확정
    expect(rename).not.toHaveBeenCalled();

    open('강원본부 관리');
    fireEvent.click(screen.getByRole('menuitem', { name: '이름 바꾸기' }));
    const again = screen.getByLabelText('강원본부 이름');
    fireEvent.change(again, { target: { value: '강원본부2' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(rename).toHaveBeenCalledWith('강원본부2');
  });

  it('지울 수 없는 줄은 **왜인지 말한다** — 항목을 감추지 않는다', () => {
    render(
      <TreePanel title="장비 품목" selectedId={null} onSelect={() => {}}
        nodes={[node({ id: 'c1', text: '통신', remove: { run: () => {}, disabledReason: '이 분류에 20개가 들어 있어 지울 수 없습니다' } })]} />,
    );

    open('통신 관리');
    const item = screen.getByRole('menuitem', { name: '삭제' });
    expect(item).toHaveProperty('disabled', true);
    expect(item.title).toBe('이 분류에 20개가 들어 있어 지울 수 없습니다');
  });

  it('할 수 있는 일이 없는 줄에는 ⋯ 가 없다', () => {
    render(
      <TreePanel title="장비 품목" selectedId={null} onSelect={() => {}}
        nodes={[node({ id: 't1', text: 'UTM' })]} />,
    );

    expect(screen.queryByRole('button', { name: 'UTM 관리' })).toBeNull();
  });
});

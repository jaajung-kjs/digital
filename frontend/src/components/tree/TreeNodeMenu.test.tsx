import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeNodeMenu } from './TreeNodeMenu';
import type { TreeNodeData, NodeType } from '../../types/organization';

function makeNode(type: NodeType, overrides: Partial<TreeNodeData> = {}): TreeNodeData {
  return {
    id: `${type}-1`,
    name: type,
    type,
    parentId: null,
    children: [],
    childrenLoaded: false,
    expanded: false,
    ...overrides,
  };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: '노드 메뉴' }));
}

describe('TreeNodeMenu', () => {
  it('substation: 층 추가 / 이름 변경 / 삭제 노출', () => {
    render(
      <TreeNodeMenu
        node={makeNode('substation')}
        onAddChild={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    openMenu();
    expect(screen.getByText('층 추가')).toBeInTheDocument();
    expect(screen.getByText('이름 변경')).toBeInTheDocument();
    expect(screen.getByText('삭제')).toBeInTheDocument();
  });

  it('floor: 이름 변경 / 삭제만, 자식 추가 없음', () => {
    render(
      <TreeNodeMenu
        node={makeNode('floor')}
        onAddChild={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    openMenu();
    expect(screen.getByText('이름 변경')).toBeInTheDocument();
    expect(screen.getByText('삭제')).toBeInTheDocument();
    expect(screen.queryByText('추가')).not.toBeInTheDocument();
  });

  it('삭제 클릭 시 onDelete(node) 호출', () => {
    const node = makeNode('floor');
    const onDelete = vi.fn();
    render(
      <TreeNodeMenu
        node={node}
        onAddChild={vi.fn()}
        onRename={vi.fn()}
        onDelete={onDelete}
      />,
    );
    openMenu();
    fireEvent.click(screen.getByText('삭제'));
    expect(onDelete).toHaveBeenCalledWith(node);
  });
});

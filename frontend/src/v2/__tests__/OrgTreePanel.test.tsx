import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrgTreePanel } from '../components/OrgTreePanel';

const TREE = [
  { id: 'h1', name: '본부1', branches: [{ id: 'b1', name: '지사1', substations: [{ id: 's1', name: '국1' }, { id: 's2', name: '국2' }] }] },
];

vi.mock('../hooks', () => {
  const m = { mutateAsync: vi.fn(), mutate: vi.fn() };
  return {
    useV2OrgTree: () => ({ data: TREE }),
    useOrgMutations: () => ({ createOrgNode: m, renameOrgNode: m, deleteOrgNode: m }),
    useReorder: () => m,
  };
});
vi.mock('../orgTreeSelectors', () => ({
  flattenTree: () => [
    { id: 'h1', name: '본부1', depth: 0, parentId: null },
    { id: 'b1', name: '지사1', depth: 1, parentId: 'h1' },
    { id: 's1', name: '국1', depth: 2, parentId: 'b1' },
    { id: 's2', name: '국2', depth: 2, parentId: 'b1' },
  ],
}));

describe('OrgTreePanel', () => {
  const calls: string[] = [];
  afterEach(() => { calls.length = 0; });
  function watch() {
    Element.prototype.scrollIntoView = function (this: Element) { calls.push(this.textContent ?? ''); };
  }

  it('고른 노드가 화면 밖이면 그 줄로 스크롤한다', () => {
    watch();
    render(<OrgTreePanel selectedId="s2" onSelect={() => {}} />);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('국2');
  });

  it('아무것도 안 골랐으면 스크롤하지 않는다', () => {
    watch();
    render(<OrgTreePanel selectedId={null} onSelect={() => {}} />);
    expect(calls).toEqual([]);
  });

  it('검색 상자는 목록 밖 고정 머리다 — 목록(tree) 안에 들어 있지 않다', () => {
    const { getByRole } = render(<OrgTreePanel selectedId={null} onSelect={() => {}} />);
    expect(getByRole('tree').contains(getByRole('textbox', { name: '조직 검색' }))).toBe(false);
  });
});

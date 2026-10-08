import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrgTreePanel } from '../components/OrgTreePanel';
import { workingCopyStore } from '../model/store/workingCopy';
import { asViewer } from '../../tests/asRole';

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

describe('OrgTreePanel — 고른 변전소 다시 누르기 · 저장 안 한 변경이 닿은 변전소', () => {
  it('고른 변전소를 다시 눌러도 놓지 않는다(작업 공간이 비지 않는다)', () => {
    const onSelect = vi.fn();
    const { getByText } = render(<OrgTreePanel selectedId="s1" onSelect={onSelect} />);
    fireEvent.click(getByText('국1'));
    expect(onSelect).not.toHaveBeenCalledWith(null);
  });

  it('변경안이 닿은 변전소는 삭제 단추가 잠기고 까닭을 말한다', () => {
    workingCopyStore.getState().reset();
    workingCopyStore.getState().create('racks', { id: 'r9', substationId: 's1', name: '랙', rackTypeId: 't', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
    const { getByRole } = render(<OrgTreePanel selectedId={null} onSelect={() => {}} />);
    expect(getByRole('button', { name: /^국1 삭제 — 저장하지 않은 변경이 있는 변전소는 삭제할 수 없습니다/ })).toBeDisabled();
    expect(getByRole('button', { name: '국2 삭제' })).not.toBeDisabled();
    workingCopyStore.getState().reset();
  });
});

describe('OrgTreePanel — 조회 사용자', () => {
  asViewer();
  it('추가·이름 변경·삭제 손잡이가 없다', () => {
    const { queryAllByRole } = render(<OrgTreePanel selectedId={null} onSelect={() => {}} />);
    expect(queryAllByRole('button', { name: /추가$|이름 변경$|삭제$/ })).toEqual([]);
  });
});

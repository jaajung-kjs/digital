import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import type { ChangeEntry, ChangeItem } from '../../../model/types';
import { HistoryTab } from '../HistoryTab';
import { historyLines } from '../historyLines';

const hook = vi.hoisted(() => ({ value: null as unknown, enabled: [] as boolean[] }));
vi.mock('../../../model/hooks', () => ({
  useEquipmentChanges: (_id: string, enabled: boolean) => { hook.enabled.push(enabled); return hook.value; },
}));

const page = (entries: ChangeEntry[], more = false) => ({
  data: { pages: [{ entries, nextCursor: more ? 'c' : null }] },
  isPending: false, isSuccess: true, isError: false, error: null,
  hasNextPage: more, isFetchingNextPage: false, fetchNextPage: vi.fn(),
});

const eqBase = { substationId: 'S1', rackId: 'r1', typeId: 'et', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, panelCount: null, circuitCount: 0 };

beforeEach(() => {
  store.getState().reset();
  hook.enabled = [];
  /* 저장된 설비 하나 — 들른 국의 저장본으로 싣는다. */
  store.setState((s) => ({ saved: { ...s.saved, equipment: [{ ...eqBase, id: 'e', name: '분전반', updatedAt: '2026-10-01T00:00:00.000Z' }] } }));
});

describe('이력 탭', () => {
  it('저장 한 번이 항목 하나 — 일시 · 사용자, 그 아래 바뀐 칸마다 한 줄', () => {
    hook.value = page([{
      id: 'x', at: '2026-10-08T05:03:00.000Z', username: 'admin',
      items: [
        { entity: 'equipment', action: 'update', id: 'e', fields: [{ name: 'status', before: 'normal', after: 'fault' }] },
        { entity: 'circuit', action: 'update', id: 'circuit:e:3', no: 3, fields: [{ name: 'label', before: null, after: 'MCCB3' }] },
      ],
    }]);
    render(<HistoryTab equipmentId="e" />);
    expect(screen.getByText(/ · admin$/)).toBeInTheDocument();
    expect(screen.getByText('상태: 정상 → 고장')).toBeInTheDocument();
    expect(screen.getByText('차단기 3 표기: — → MCCB3')).toBeInTheDocument();
    expect(screen.queryByText('저장 전 변경은 이력에 없습니다')).toBeNull();
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull();
  });

  it('비었으면 한 줄, 더 있으면 「더 보기」가 다음 쪽을 읽는다', () => {
    hook.value = page([]);
    const { unmount } = render(<HistoryTab equipmentId="e" />);
    expect(screen.getByText('변경 이력이 없습니다')).toBeInTheDocument();
    unmount();
    const more = page([{ id: 'x', at: '2026-10-08T05:03:00.000Z', username: 'admin', items: [{ entity: 'equipment', action: 'create', id: 'e', fields: [] }] }], true);
    hook.value = more;
    render(<HistoryTab equipmentId="e" />);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(more.fetchNextPage).toHaveBeenCalled();
  });

  it('이 설비에 저장 전 변경이 있으면 알린다 — 다른 설비의 변경은 상관없다', () => {
    hook.value = page([]);
    store.getState().updateCircuit('other', 1, { label: 'x' });
    const { rerender } = render(<HistoryTab equipmentId="e" />);
    expect(screen.queryByText('저장 전 변경은 이력에 없습니다')).toBeNull();
    store.getState().updateCircuit('e', 1, { label: 'F1' });
    rerender(<HistoryTab equipmentId="e" />);
    expect(screen.getByText('저장 전 변경은 이력에 없습니다')).toBeInTheDocument();
  });

  it('아직 서버에 없는 설비는 묻지 않는다', () => {
    hook.value = { ...page([]), isPending: true, isSuccess: false, data: undefined };
    store.getState().create('equipment', { ...eqBase, id: 'n', name: '새 설비', updatedAt: '' });
    render(<HistoryTab equipmentId="n" />);
    expect(hook.enabled.at(-1)).toBe(false);
    expect(screen.getByText('변경 이력이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('저장 전 변경은 이력에 없습니다')).toBeInTheDocument();
  });
});

describe('historyLines — 문장', () => {
  const it1 = (x: Partial<ChangeItem>): ChangeItem => ({ entity: 'equipment', action: 'update', id: 'e', fields: [], ...x });
  it('연결 — 다른 끝 이름, 차단기·코어 끝, 지금은 없는 끝', () => {
    expect(historyLines(it1({ entity: 'link', action: 'create', peer: { kind: 'equipment', equipmentId: 'l' }, peerName: '부하' }))).toEqual(['연결 추가: 부하']);
    expect(historyLines(it1({ entity: 'link', action: 'delete', peer: { kind: 'circuit', equipmentId: 'p', no: 2 }, peerName: '분전반' }))).toEqual(['연결 삭제: 분전반 차단기 2']);
    expect(historyLines(it1({ entity: 'link', action: 'delete', peer: { kind: 'equipment', equipmentId: 'g' }, peerName: null }))).toEqual(['연결 삭제: (삭제됨)']);
    expect(historyLines(it1({ entity: 'link', peerName: '부하', peer: { kind: 'equipment', equipmentId: 'l' }, fields: [{ name: 'peerLabel', before: 'AC IN', after: null }, { name: 'lengthM', before: 3, after: 5 }] })))
      .toEqual(['연결(부하) 길이: 3 m → 5 m', '연결(부하) 상대 포트: AC IN → —']);
  });

  it('기록 — 등록·삭제는 내용 한 줄, 날짜는 날로', () => {
    expect(historyLines(it1({ entity: 'maintenance', action: 'create', fields: [{ name: 'content', before: null, after: '트립' }] }))).toEqual(['고장 기록 추가: 트립']);
    expect(historyLines(it1({ entity: 'inspection', action: 'delete', fields: [{ name: 'content', before: '외관', after: null }] }))).toEqual(['점검 기록 삭제: 외관']);
    expect(historyLines(it1({ fields: [{ name: 'installDate', before: '2020-01-02T00:00:00.000Z', after: '2021-03-04' }] }))).toEqual(['설치일: 2020-01-02 → 2021-03-04']);
    expect(historyLines(it1({ entity: 'circuit', no: 1, fields: [{ name: 'switch', before: 'on', after: 'off' }] }))).toEqual(['차단기 1 개폐: 투입 → 개방']);
  });

  it('칸 차례는 칸을 그리는 차례다 — 저장 본문의 차례가 아니라', () => {
    expect(historyLines(it1({ fields: [{ name: 'model', before: null, after: 'M1' }, { name: 'status', before: 'normal', after: 'fault' }] })))
      .toEqual(['상태: 정상 → 고장', '모델명: — → M1']);
  });
});

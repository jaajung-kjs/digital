/**
 * CableValueField — **값을 다듬는 규칙이 한 곳인가**.
 *
 * 선번장(`MetaInput`)·계통(`CableFieldInput`)·포트 상세(`CableValueControl`)가 같은 글을
 * 세 벌 갖고 있었다: 숫자면 `Number()`, 빈 값은 `null`, `NaN` 이면 무시, 무변경이면 무시,
 * 그리고 `stageCableUpdate({ specParams })`. 같은 케이블의 같은 칸인데 검증이 세 벌이라
 * 한 곳만 고쳐지기 딱 좋았다 — 이 저장소는 그 사고를 이미 겪었다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { emptyOverlays, v2WorkingCopyStore } from '../store/workingCopyStore';
import { CableValueField } from '../components/CableValueField';
import type { V2Cable } from '../types';

const LENGTH = { key: 'lengthM', label: '길이', type: 'number' as const, unit: 'm' };
const LINE = { key: 'lineName', label: '선로명', type: 'text' as const };

const cable = (specParams: Record<string, unknown>): V2Cable => ({
  id: 'c1', name: null, substationId: 'sub-1', aPortId: 'a', bPortId: 'b',
  categoryId: null, pathPoints: [], specParams, updatedAt: 'v',
});

function setCable(specParams: Record<string, unknown>) {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: { substation: null, floors: [], assets: [], maintenanceLogs: [], inspectionLogs: [], cables: [cable(specParams)], photos: [] },
    overlays: emptyOverlays(),
    baseVersions: {},
  });
}

/** 쌓인 것 — 없으면 `undefined`(아무 일도 안 일어났다는 뜻). */
const staged = () => v2WorkingCopyStore.getState().overlays.cables.updates['c1']?.specParams;

/** 읽는 줄이 기본이라 **먼저 눌러야** 상자가 선다(`InlineEditCell`). */
function edit(label: string, next: string) {
  fireEvent.click(screen.getByRole('button', { name: `${label} 고치기` }));
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: next } });
  fireEvent.blur(input);
}

describe('CableValueField — 값을 다듬는 규칙은 한 곳이다', () => {
  beforeEach(() => setCable({}));

  /* 숫자 칸은 수로 담는다 — 글자로 담으면 합산이 문자열 이어붙이기가 된다. */
  it('숫자 칸은 수로 쌓는다', () => {
    render(<CableValueField cableId="c1" field={LENGTH} value={null} />);
    edit('길이', '120');
    expect(staged()).toEqual({ lengthM: 120 });
  });

  /* 비운 칸은 `null` 이다 — 빈 글자를 넣으면 「0 m」로 읽힌다. */
  it('비우면 null 로 쌓는다', () => {
    setCable({ lengthM: 120 });
    render(<CableValueField cableId="c1" field={LENGTH} value={120} />);
    edit('길이', '');
    expect(staged()).toEqual({ lengthM: null });
  });

  /* 수가 아니면 **아무 일도 하지 않는다** — 세 벌 중 한 벌만 이 검사를 빠뜨리면 NaN 이 쌓인다. */
  it('수가 아니면 쌓지 않는다', () => {
    render(<CableValueField cableId="c1" field={LENGTH} value={null} />);
    edit('길이', '열둘');
    expect(staged()).toBeUndefined();
  });

  /* 바뀐 것이 없으면 쌓지 않는다 — 헛된 「변경 1건」이 저장 바에 뜬다. */
  it('같은 값이면 쌓지 않는다', () => {
    setCable({ lengthM: 120 });
    render(<CableValueField cableId="c1" field={LENGTH} value={120} />);
    edit('길이', '120');
    expect(staged()).toBeUndefined();
  });

  /* 글자 칸은 적힌 그대로, 빈 것은 `null`. */
  it('글자 칸은 다듬어 그대로 쌓는다', () => {
    render(<CableValueField cableId="c1" field={LINE} value={null} />);
    edit('선로명', ' 춘천1호 ');
    expect(staged()).toEqual({ lineName: '춘천1호' });
  });

  /* 다른 칸의 값은 건드리지 않는다 — 통째로 덮어쓰면 옆 칸이 사라진다. */
  it('같은 케이블의 다른 칸은 그대로 둔다', () => {
    setCable({ lineName: '춘천1호' });
    render(<CableValueField cableId="c1" field={LENGTH} value={null} />);
    edit('길이', '40');
    expect(staged()).toEqual({ lineName: '춘천1호', lengthM: 40 });
  });

  /**
   * **무변경 판정은 케이블 제 값과 비교한다 — 화면에 뜬 값이 아니다.**
   *
   * 계통의 회로 줄은 모선이 말한 값을 흐리게 물려 보여 준다(대장의 ditto). 그 줄에 같은 수를
   * 손으로 적는 일은 「이 회로의 값으로 못 박는다」는 뜻이라 쌓여야 한다 — 뜬 값과 비교하면
   * 삼켜진다. 포트 상세의 한 벌이 그렇게 적혀 있었다.
   */
  it('물려받아 뜬 값과 같아도 그 케이블의 것으로 쌓는다', () => {
    setCable({}); // 이 케이블엔 길이가 없다 — 220 은 모선에서 물려온 표시값이다
    render(<CableValueField cableId="c1" field={LENGTH} value={220} muted />);
    edit('길이', '220');
    expect(staged()).toEqual({ lengthM: 220 });
  });

  /* 케이블이 없으면 적을 곳도 없다 — 대시다. */
  it('케이블이 없으면 고칠 수 없다', () => {
    render(<CableValueField cableId={null} field={LENGTH} value={null} />);
    expect(screen.queryByRole('button', { name: '길이 고치기' })).toBeNull();
  });
});

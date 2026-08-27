import { describe, expect, it } from 'vitest';
import { cableToolReducer, connectErrorLabel, connectableAssetIds, initialCableToolState } from '../components/floorplan/cableTool';
import type { V2Asset, V2Cable } from '../types';

/**
 * 케이블 도구 — **상태 기계와 판정**만 본다(그리는 일은 캔버스의 것이다).
 *
 * 도면 파일에서 떼어 내면서 시험도 여기로 옮긴다: 화면을 세우지 않고 값만 견주므로 손짓
 * 없이도 규칙이 지켜지는지 볼 수 있다.
 */
const port = (id: string, medium: string) =>
  ({ id, assetId: 'x', group: 'G', index: 1, name: id, direction: 'BI' as const, medium });

const asset = (id: string, ports: ReturnType<typeof port>[], parentAssetId: string | null = null) =>
  ({ id, name: id, parentAssetId, ports }) as unknown as V2Asset;

const cable = (id: string, a: string, b: string) =>
  ({ id, aPortId: a, bPortId: b }) as unknown as V2Cable;

describe('cableToolReducer', () => {
  it('켜면 첫 끝점부터 다시 받는다 — 지난 손짓이 남지 않는다', () => {
    const mid = { ...initialCableToolState, armed: true, firstPortId: 'p1' };
    expect(cableToolReducer(mid, { type: 'ARM' })).toMatchObject({ armed: true, firstPortId: null, picker: null });
  });

  it('이으면 도구는 그대로 두고 끝점만 비운다 — 연이어 잇는다', () => {
    const mid = { ...initialCableToolState, armed: true, firstPortId: 'p1' };
    expect(cableToolReducer(mid, { type: 'CABLE_STAGED' })).toMatchObject({ armed: true, firstPortId: null });
  });

  it('바뀔 것이 없으면 **같은 객체**를 돌려준다 — 헛된 다시 그리기를 만들지 않는다', () => {
    expect(cableToolReducer(initialCableToolState, { type: 'DISARM' })).toBe(initialCableToolState);
    expect(cableToolReducer(initialCableToolState, { type: 'CLOSE_PICKER' })).toBe(initialCableToolState);
    expect(cableToolReducer(initialCableToolState, { type: 'DESELECT_CABLE' })).toBe(initialCableToolState);
  });
});

/**
 * 경로는 **그리는 김에 그린다**.
 *
 * 예전에는 이을 곳 둘만 고르면 케이블이 그 사이를 곧게 질렀다. 실제 도면에서 케이블은 벽을
 * 타고 트레이를 따라 도니, 곧은 선은 「어디로 가는 케이블인지」를 지운다.
 */
describe('cableToolReducer — 경로 그리기', () => {
  const armedWithFirst = {
    ...initialCableToolState,
    armed: true,
    firstPortId: 'p1',
  };

  it('첫 끝점이 정해진 뒤에만 꺾는다 — 어디서 시작하는지 모르면 그릴 것이 없다', () => {
    const noStart = cableToolReducer({ ...initialCableToolState, armed: true }, { type: 'ADD_WAYPOINT', point: { x: 10, y: 10 } });
    expect(noStart.draftPath).toEqual([]);

    const one = cableToolReducer(armedWithFirst, { type: 'ADD_WAYPOINT', point: { x: 10, y: 10 } });
    const two = cableToolReducer(one, { type: 'ADD_WAYPOINT', point: { x: 10, y: 40 } });
    expect(two.draftPath).toEqual([{ x: 10, y: 10 }, { x: 10, y: 40 }]);
  });

  it('마지막 꺾은점을 하나씩 물린다 — 물릴 것이 없으면 같은 객체다', () => {
    const two = { ...armedWithFirst, draftPath: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };
    expect(cableToolReducer(two, { type: 'UNDO_WAYPOINT' }).draftPath).toEqual([{ x: 1, y: 1 }]);
    expect(cableToolReducer(armedWithFirst, { type: 'UNDO_WAYPOINT' })).toBe(armedWithFirst);
  });

  /**
   * 이 국끼리 이으면 도구가 켜진 채로 남고(한 번 켜고 여러 가닥), **대국으로 이으면 끝난다**
   * — 이 도면에는 더 그릴 것이 없는데 「1/3 이을 설비를 클릭하세요」가 남아 있었다.
   */
  it('대국으로 이으면 도구가 함께 끝난다 — 이 국끼리는 이어서 잇는다', () => {
    const drawn = { ...armedWithFirst, draftPath: [{ x: 1, y: 1 }], remoteModalOpen: true };
    expect(cableToolReducer(drawn, { type: 'REMOTE_CABLE_STAGED' }).armed).toBe(false);
    expect(cableToolReducer(drawn, { type: 'REMOTE_CABLE_STAGED' }).remoteModalOpen).toBe(false);
    expect(cableToolReducer(drawn, { type: 'CABLE_STAGED' }).armed).toBe(true);
  });

  it('그리던 경로는 손짓이 끝나면 사라진다 — 다음 케이블에 새어들지 않는다', () => {
    const drawn = { ...armedWithFirst, draftPath: [{ x: 1, y: 1 }] };
    expect(cableToolReducer(drawn, { type: 'CABLE_STAGED' }).draftPath).toEqual([]);
    expect(cableToolReducer(drawn, { type: 'REMOTE_CABLE_STAGED' }).draftPath).toEqual([]);
    expect(cableToolReducer(drawn, { type: 'DISARM' }).draftPath).toEqual([]);
    expect(cableToolReducer(drawn, { type: 'ABORT_TO_ARMED' }).draftPath).toEqual([]);
    /* 첫 끝점을 새로 정하는 것도 새 손짓이다. */
    expect(cableToolReducer(drawn, { type: 'CONFIRM_FIRST_ENDPOINT', portId: 'p9' }).draftPath).toEqual([]);
  });
});

describe('connectableAssetIds', () => {
  /* 설비는 제 포트가 없고 안에 든 장비가 갖는다 — 그래서 자손까지 세어야 한다. */
  const rack = asset('rack', []);
  const dev = asset('dev', [port('p-fiber', 'fiber'), port('p-net', 'network')], 'rack');
  const lonely = asset('lonely', [port('p-power', 'power')]);
  const all = [rack, dev, lonely];
  const placed = [{ id: 'rack' }, { id: 'lonely' }];

  it('고른 품목의 매체가 있는 설비만 또렷하다', () => {
    const ids = connectableAssetIds({ assets: all, placed, cables: [], mediumKey: 'fiber', firstPortId: undefined });
    expect([...ids]).toEqual(['rack']);
  });

  it('매체를 안 고르면 가리지 않는다', () => {
    const ids = connectableAssetIds({ assets: all, placed, cables: [], mediumKey: undefined, firstPortId: undefined });
    expect([...ids].sort()).toEqual(['lonely', 'rack']);
  });

  it('자리가 찬 포트뿐이면 흐려진다 — 접지는 여러 가닥이 물리므로 남는다', () => {
    const full = connectableAssetIds({
      assets: all, placed, cables: [cable('c1', 'p-power', 'z')], mediumKey: 'power', firstPortId: undefined,
    });
    expect([...full]).toEqual([]);

    const bus = asset('bus', [port('p-gnd', 'ground')]);
    const stillFree = connectableAssetIds({
      assets: [bus], placed: [{ id: 'bus' }], cables: [cable('c2', 'p-gnd', 'z')], mediumKey: 'ground', firstPortId: undefined,
    });
    expect([...stillFree]).toEqual(['bus']);
  });

  it('첫 끝점 자신에게는 잇지 않는다', () => {
    const ids = connectableAssetIds({ assets: all, placed, cables: [], mediumKey: 'power', firstPortId: 'p-power' });
    expect([...ids]).toEqual([]);
  });

  /* 방금 놓은 설비도 포트를 갖는다(화면이 만든다) — 저장은 잇기의 전제가 아니다. */
  it('저장 전 설비도 또렷하다', () => {
    const fresh = { ...asset('fresh', [port('p-new', 'fiber')]), updatedAt: '' } as V2Asset;
    const ids = connectableAssetIds({
      assets: [fresh], placed: [{ id: 'fresh' }], cables: [], mediumKey: 'fiber', firstPortId: undefined,
    });
    expect([...ids]).toEqual(['fresh']);
  });
});

describe('connectErrorLabel', () => {
  it('까닭을 사람 말로 옮긴다 — 모르는 코드는 그대로 보여 준다(삼키지 않는다)', () => {
    expect(connectErrorLabel('port-occupied')).toBe('이미 연결됨');
    expect(connectErrorLabel('core-count-mismatch')).toMatch(/심선 수/);
    expect(connectErrorLabel('무언가-새-코드')).toBe('무언가-새-코드');
  });
});

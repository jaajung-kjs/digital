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

describe('cableToolReducer — 남은 것은 고른 케이블뿐이다', () => {
  /**
   * 「지금 무엇을 잇는 중인가」는 **연결 세션**(`connectSession.ts`)으로 옮겨 갔다.
   *
   * 여기 있던 `armed`·`categoryId`·`firstPortId`·`draftPath`·`remoteModalOpen` 은 같은 사실을
   * 페이지의 `cableStartPortId`·`cablePick` 과 **두 곳에서** 들고 있었고, 그래서 진입점에
   * 따라 첫 끝점 강조가 나왔다 안 나왔다 했다. 도면에 남는 것은 경로점을 편집하려고 **고른
   * 케이블**뿐이다.
   */
  it('고른 케이블을 기억하고, 놓으면 비운다', () => {
    const picked = cableToolReducer(initialCableToolState, { type: 'SELECT_CABLE', id: 'c-1' });
    expect(picked.selectedCableId).toBe('c-1');
    expect(cableToolReducer(picked, { type: 'DESELECT_CABLE' }).selectedCableId).toBeNull();
  });

  /* 바뀔 것이 없으면 **같은 객체**를 돌려준다 — 헛된 다시 그리기를 만들지 않는다. */
  it('놓을 것이 없으면 같은 객체다', () => {
    expect(cableToolReducer(initialCableToolState, { type: 'DESELECT_CABLE' })).toBe(initialCableToolState);
  });
});

describe('connectableAssetIds', () => {
  /* 설비는 제 포트가 없고 안에 든 장비가 갖는다 — 그래서 자손까지 세어야 한다. */
  const rack = asset('rack', []);
  const dev = asset('dev', [port('p-fiber', 'fiber'), port('p-net', 'network')], 'rack');
  const lonely = asset('lonely', [port('p-power', 'power')]);
  const all = [rack, dev, lonely];
  const placed = [{ id: 'rack' }, { id: 'lonely' }];

  it('출발 포트와 이을 수 있는 매체를 가진 설비만 또렷하다', () => {
    const ids = connectableAssetIds({ assets: all, placed, cables: [], fromPortMedium: 'fiber', firstPortId: undefined });
    expect([...ids]).toEqual(['rack']);
  });

  it('출발이 없으면 가리지 않는다', () => {
    const ids = connectableAssetIds({ assets: all, placed, cables: [], fromPortMedium: undefined, firstPortId: undefined });
    expect([...ids].sort()).toEqual(['lonely', 'rack']);
  });

  it('자리가 찬 포트뿐이면 흐려진다 — 접지는 여러 가닥이 물리므로 남는다', () => {
    const full = connectableAssetIds({
      assets: all, placed, cables: [cable('c1', 'p-power', 'z')], fromPortMedium: 'power', firstPortId: undefined,
    });
    expect([...full]).toEqual([]);

    const bus = asset('bus', [port('p-gnd', 'ground')]);
    const stillFree = connectableAssetIds({
      assets: [bus], placed: [{ id: 'bus' }], cables: [cable('c2', 'p-gnd', 'z')], fromPortMedium: 'ground', firstPortId: undefined,
    });
    expect([...stillFree]).toEqual(['bus']);
  });

  it('첫 끝점 자신에게는 잇지 않는다', () => {
    const ids = connectableAssetIds({ assets: all, placed, cables: [], fromPortMedium: 'power', firstPortId: 'p-power' });
    expect([...ids]).toEqual([]);
  });

  /**
   * **짝을 정하는 것은 어휘다**(`portKind.connectsTo`) — 「케이블 품목의 매체」가 아니다.
   *
   * 예전에는 고른 품목의 매체로 걸렀다. 종류를 나중에 고르게 되면서 그 값이 없어졌고,
   * 애초에 기준이 틀렸다. 지금 어휘는 같은 매체끼리만 잇지만(`fiber→fiber`), 어휘가 짝을
   * 넓히면 이 함수는 고칠 것이 없다.
   */
  it('어휘에 없는 매체는 같은 매체끼리로 물러선다 — 자료가 앞서 나가도 잠기지 않는다', () => {
    const odd = asset('odd', [port('p-odd', 'plasma')]);
    const same = connectableAssetIds({
      assets: [odd], placed: [{ id: 'odd' }], cables: [], fromPortMedium: 'plasma', firstPortId: undefined,
    });
    expect([...same]).toEqual(['odd']);
    const other = connectableAssetIds({
      assets: [odd], placed: [{ id: 'odd' }], cables: [], fromPortMedium: 'fiber', firstPortId: undefined,
    });
    expect([...other]).toEqual([]);
  });

  /* 방금 놓은 설비도 포트를 갖는다(화면이 만든다) — 저장은 잇기의 전제가 아니다. */
  it('저장 전 설비도 또렷하다', () => {
    const fresh = { ...asset('fresh', [port('p-new', 'fiber')]), updatedAt: '' } as V2Asset;
    const ids = connectableAssetIds({
      assets: [fresh], placed: [{ id: 'fresh' }], cables: [], fromPortMedium: 'fiber', firstPortId: undefined,
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

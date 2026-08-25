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
    const mid = { ...initialCableToolState, armed: true, firstEndpoint: { portId: 'p1', assetId: 'a1' } };
    expect(cableToolReducer(mid, { type: 'ARM' })).toMatchObject({ armed: true, firstEndpoint: null, picker: null });
  });

  it('이으면 도구는 그대로 두고 끝점만 비운다 — 연이어 잇는다', () => {
    const mid = { ...initialCableToolState, armed: true, firstEndpoint: { portId: 'p1', assetId: 'a1' } };
    expect(cableToolReducer(mid, { type: 'CABLE_STAGED' })).toMatchObject({ armed: true, firstEndpoint: null });
  });

  it('바뀔 것이 없으면 **같은 객체**를 돌려준다 — 헛된 다시 그리기를 만들지 않는다', () => {
    expect(cableToolReducer(initialCableToolState, { type: 'DISARM' })).toBe(initialCableToolState);
    expect(cableToolReducer(initialCableToolState, { type: 'CLOSE_PICKER' })).toBe(initialCableToolState);
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

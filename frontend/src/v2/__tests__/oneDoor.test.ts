import { describe, expect, it, vi } from 'vitest';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { emptyOverlays } from '../store/workingCopyStore';
import { connectCable } from '../cableActions';
import { deleteAssetWithConfirm, deleteCableWithConfirm } from '../deleteActions';
import type { V2Asset, V2Port } from '../types';

/**
 * **같은 일에는 문이 하나다.**
 *
 * 케이블 잇기·지우기는 화면마다 문이 있다(도면 · 포트 탭 · 대국 검색). 그 문마다 글을 따로
 * 적으면 반드시 갈린다 — 실제로 갈렸다: 도면에서는 케이블을 **묻지도 않고** 지웠는데 포트
 * 탭에서는 물었고, 설비 삭제 문구는 문마다 달랐다. 잇고 지우는 일은 여기서 한 번만 한다.
 */
const port = (id: string, assetId: string, medium = 'power', direction: 'IN' | 'OUT' | 'BI' = 'BI'): V2Port =>
  ({ id, assetId, group: 'G', index: 1, name: id, direction, medium }) as V2Port;

const asset = (id: string, ports: V2Port[], parentAssetId: string | null = null): V2Asset =>
  ({ id, name: id, parentAssetId, ports, substationId: 's-1' }) as unknown as V2Asset;

function reset(assets: V2Asset[] = []) {
  v2WorkingCopyStore.setState({
    substationId: 's-1',
    saved: {
      substation: { id: 's-1', name: '변전소', branchId: 'b1', sortOrder: 1 },
      floors: [], assets, maintenanceLogs: [], inspectionLogs: [], cables: [], photos: [],
    },
    overlays: emptyOverlays(),
    baseVersions: {},
  });
}

describe('connectCable — 잇는 일은 한 곳', () => {
  const a = asset('a', [port('pa', 'a', 'power', 'OUT')]);
  const b = asset('b', [port('pb', 'b', 'power', 'IN')]);

  it('이으면 그리던 경로 그대로 스테이지된다', () => {
    reset([a, b]);
    const err = connectCable({
      firstPortId: 'pa', toPort: b.ports[0]!, assets: [a, b], cables: [],
      substationId: 's-1', categoryId: 'cat-1', mediumKey: 'power',
      pathPoints: [{ x: 10, y: 20 }],
    });
    expect(err).toBeNull();
    const creates = Object.values(v2WorkingCopyStore.getState().overlays.cables.creates);
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ aPortId: 'pa', bPortId: 'pb', categoryId: 'cat-1', pathPoints: [{ x: 10, y: 20 }] });
  });

  it('첫 끝점을 잃었으면 잇지 않는다 — 무검증 스테이지 금지', () => {
    reset([a, b]);
    expect(connectCable({ firstPortId: null, toPort: b.ports[0]!, assets: [a, b], cables: [], substationId: 's-1', categoryId: null, mediumKey: 'power', pathPoints: [] })).toBe('no-first');
    expect(connectCable({ firstPortId: '없는포트', toPort: b.ports[0]!, assets: [a, b], cables: [], substationId: 's-1', categoryId: null, mediumKey: 'power', pathPoints: [] })).toBe('no-first');
    expect(Object.keys(v2WorkingCopyStore.getState().overlays.cables.creates)).toHaveLength(0);
  });

  it('못 이을 자리면 까닭을 돌려주고 아무것도 쌓지 않는다 — 어디에 적을지는 부르는 쪽이 정한다', () => {
    reset([a, b]);
    const sameDirection = asset('c', [port('pc', 'c', 'power', 'OUT')]);
    const err = connectCable({
      firstPortId: 'pa', toPort: sameDirection.ports[0]!, assets: [a, sameDirection], cables: [],
      substationId: 's-1', categoryId: null, mediumKey: 'power', pathPoints: [],
    });
    expect(err).toBe('direction-mismatch');
    expect(Object.keys(v2WorkingCopyStore.getState().overlays.cables.creates)).toHaveLength(0);
  });
});

describe('지우는 일은 한 곳 — 어디서 지우든 같은 물음', () => {
  it('설비: 딸린 것이 몇인지 세어 묻고, 예라면 걷어낸다', async () => {
    const rack = asset('rack', []);
    const part = asset('part', [], 'rack');
    reset([rack, part]);
    const confirm = vi.fn(async () => true);

    expect(await deleteAssetWithConfirm({ asset: rack, assets: [rack, part], confirm })).toBe(true);
    expect(confirm.mock.calls[0]![0]).toMatchObject({ title: '설비 삭제', target: 'rack', message: '딸린 장비 1개가 함께 삭제됩니다.' });
    expect(v2WorkingCopyStore.getState().overlays.assets.deletes).toContain('rack');
  });

  it('설비: 아니라고 하면 아무 일도 없다', async () => {
    const lonely = asset('lonely', []);
    reset([lonely]);
    expect(await deleteAssetWithConfirm({ asset: lonely, assets: [lonely], confirm: async () => false })).toBe(false);
    expect(v2WorkingCopyStore.getState().overlays.assets.deletes).toHaveLength(0);
  });

  /* 도면에서는 묻지 않고 지우던 자리 — 이제 같은 물음을 거친다. */
  it('케이블: 묻고 지운다', async () => {
    reset([]);
    const confirm = vi.fn(async () => true);
    expect(await deleteCableWithConfirm({ cableId: 'c-1', target: '판암 광단말 A#1 으로 가는 케이블', confirm })).toBe(true);
    expect(confirm.mock.calls[0]![0]).toMatchObject({ title: '케이블 삭제', danger: true });
    expect(v2WorkingCopyStore.getState().overlays.cables.deletes).toEqual(['c-1']);
  });
});

/**
 * **저장 전 케이블도 고치면 그대로 남는다** — 꺾은 경로가 create 안으로 합쳐진다.
 *
 * 방금 이은 케이블(아직 저장 전)을 끌어 꺾으면 그 경로는 「고침」이 아니라 **처음부터 그런
 * 케이블**이어야 한다. 스토어가 그렇게 합쳐 두지 않으면 저장할 때 없는 케이블을 고치라는
 * 요청이 되어 서버가 튕긴다.
 */
describe('저장 전 케이블 고치기', () => {
  it('꺾은 경로가 create 에 합쳐진다 — 저장할 것은 여전히 하나다', () => {
    reset([]);
    const st = () => v2WorkingCopyStore.getState();
    st().stageCableCreate({
      id: 'c-new', name: null, substationId: 's-1', aPortId: 'pa', bPortId: 'pb',
      categoryId: 'cat', pathPoints: [], specParams: {}, updatedAt: '',
    });
    expect(st().dirtyCount()).toBe(1);

    st().stageCableUpdate('c-new', { pathPoints: [{ x: 10, y: 20 }] });

    /* 화면이 보는 것에는 꺾임이 있고 */
    expect(st().effectiveCables()[0]).toMatchObject({ id: 'c-new', pathPoints: [{ x: 10, y: 20 }] });
    /* 저장할 것은 여전히 **하나**다(고침이 따로 쌓이지 않는다) */
    expect(st().dirtyCount()).toBe(1);
    expect(st().overlays.cables.creates['c-new']).toMatchObject({ pathPoints: [{ x: 10, y: 20 }] });
    expect(st().overlays.cables.updates['c-new']).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { buildCableRegister } from './cableRegister';

const asset = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, name: id, parentAssetId: null, assetType: { code: null, placementKind: null, connectionKind: null }, ...over }) as never;
const cat = () => ({ key: '광', label: '광케이블', color: '#a78bfa' });
const graphOf = (cables: unknown[], assets: { id: string; name: string }[]) =>
  ({
    cables,
    nameById: new Map(assets.map((a) => [a.id, a.name])),
    subNameById: new Map(), subById: new Map(), parentById: new Map(),
    kindById: new Map(), codeById: new Map(), placementKindById: new Map(),
    roleById: new Map(assets.map((a) => [a.id, (a as { assetType?: { role?: string } }).assetType?.role ?? null])),
    slotIndexById: new Map(), assets: [],
  }) as never;

describe('buildCableRegister', () => {
  it('종류별 평면 리스트 — 내게 닿는 케이블만', () => {
    const assets = [asset('dev'), asset('slot', { parentAssetId: 'ofd' })];
    const cables = [
      { id: 'core1', sourceAssetId: 'slot', targetAssetId: 'dev', sourceRole: 'OUT', targetRole: null, number: 1, categoryId: null, cableType: 'FIBER' },
      { id: 'other', sourceAssetId: 'x', targetAssetId: 'y', number: 9, cableType: 'FIBER' },
    ];
    const secs = buildCableRegister({ graph: graphOf(cables, assets as never), assets: assets as never, assetId: 'dev', categoryGroupOf: cat });
    expect(secs).toHaveLength(1);
    expect(secs[0].label).toBe('광케이블');
    expect(secs[0].rows.map((r) => r.cable.id)).toEqual(['core1']);
    expect(secs[0].feeders).toEqual([]);
    expect(secs[0].rows[0].selfId).toBe('dev');
    expect(secs[0].rows[0].remoteId).toBe('slot');
    // 저장은 slot→dev 지만, dev 관점에서 보므로 항상 self(dev) 가 먼저.
    expect(secs[0].rows[0].fromName).toBe('dev');
    expect(secs[0].rows[0].toName).toBe('slot');
  });

  it('표시 방향은 보는 자산 관점 — 같은 케이블도 상대 자산에서 보면 그쪽이 먼저', () => {
    const assets = [asset('dev'), asset('slot', { parentAssetId: 'ofd' })];
    const cables = [{ id: 'core1', sourceAssetId: 'slot', targetAssetId: 'dev', sourceRole: 'OUT', targetRole: null, number: 1, categoryId: null, cableType: 'FIBER' }];
    const secs = buildCableRegister({ graph: graphOf(cables, assets as never), assets: assets as never, assetId: 'slot', categoryGroupOf: cat });
    expect(secs[0].rows[0].fromName).toBe('slot'); // slot 관점 → slot 먼저
    expect(secs[0].rows[0].toName).toBe('dev');
  });

  it('피더(distributor) → IN 부모 + OUT 자식 중첩', () => {
    const assets = [
      asset('panel', { assetType: { role: 'panel' } }),
      asset('fA', { parentAssetId: 'panel', assetType: { role: 'feeder' } }),
    ];
    const cables = [
      { id: 'in', sourceAssetId: 'src', targetAssetId: 'fA', sourceRole: 'OUT', targetRole: 'IN', cableType: 'POWER', categoryId: null },
      { id: 'cb1', sourceAssetId: 'fA', targetAssetId: 'load1', sourceRole: 'OUT', targetRole: null, number: 1, cableType: 'POWER', categoryId: null },
      { id: 'cb2', sourceAssetId: 'fA', targetAssetId: 'load2', sourceRole: 'OUT', targetRole: null, number: 2, cableType: 'POWER', categoryId: null },
    ];
    const secs = buildCableRegister({
      graph: graphOf(cables, assets as never), assets: assets as never, assetId: 'panel',
      categoryGroupOf: () => ({ key: '전원', label: '전원케이블', color: '#ef4444' }),
    });
    expect(secs[0].feeders).toHaveLength(1);
    const fg = secs[0].feeders[0];
    expect(fg.feederId).toBe('fA');
    expect(fg.inRow?.cable.id).toBe('in');
    expect(fg.outRows.map((r) => r.cable.id)).toEqual(['cb1', 'cb2']);
    expect(secs[0].rows).toEqual([]);
  });

  it('역할 정렬 — 슬롯 보기: OPGW(IN) 위, 코어패치(OUT) 아래', () => {
    const assets = [asset('slot', { parentAssetId: 'ofd' }), asset('dev')];
    const cables = [
      { id: 'patch', sourceAssetId: 'dev', targetAssetId: 'slot', sourceRole: null, targetRole: 'OUT', number: 1, categoryId: null, cableType: 'FIBER' },
      { id: 'opgw', sourceAssetId: 'slot', targetAssetId: 'remote', sourceRole: 'IN', targetRole: 'IN', number: null, categoryId: null, cableType: 'FIBER' },
    ];
    const secs = buildCableRegister({ graph: graphOf(cables, assets as never), assets: assets as never, assetId: 'slot', categoryGroupOf: cat });
    // OPGW(IN) 가 먼저, 코어패치(OUT) 가 뒤.
    expect(secs[0].rows.map((r) => r.cable.id)).toEqual(['opgw', 'patch']);
  });

  it('자식 집계 — 컨테이너(OFD)는 산하 슬롯 케이블까지 포함', () => {
    const assets = [
      asset('ofd', { assetType: { role: 'ofd' } }),
      asset('slot', { parentAssetId: 'ofd', assetType: { role: 'slot' } }),
    ];
    const cables = [{ id: 'opgw', sourceAssetId: 'slot', targetAssetId: 'remoteSlot', sourceRole: 'IN', targetRole: 'IN', cableType: 'FIBER', categoryId: null }];
    const secs = buildCableRegister({ graph: graphOf(cables, assets as never), assets: assets as never, assetId: 'ofd', categoryGroupOf: cat });
    expect(secs[0].rows.map((r) => r.cable.id)).toEqual(['opgw']);
  });
});

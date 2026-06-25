import { describe, it, expect } from 'vitest';
import { buildTraceGraph, traceRemoteEndpoints, remoteSlotSubstation, ofdAssets, equipmentInSubstation } from './traceGraph';
import type { Asset } from '../../types/asset';

// buildTraceGraph 는 effective(=saved∪overlay−deletes) 단일 배열을 입력으로 받는다.
// 자산은 완전한 Asset 형태(assetType 중첩). 변전소명은 substationNames(org 트리 맵)로만 해소.
type AInput = {
  id: string; name?: string; substationId?: string; parentAssetId?: string | null;
  role?: string; code?: string | null; slotIndex?: number | null;
};
const roleFor = (o: AInput): string =>
  o.role ?? (o.code === 'OFD-SLOT' ? 'slot' : o.code === 'OFD' ? 'ofd' : o.code === 'DIST' ? 'panel' : 'device');
const A = (o: AInput): Asset => ({
  id: o.id, name: o.name ?? o.id, substationId: o.substationId ?? 'subW',
  parentAssetId: o.parentAssetId ?? null, slotIndex: o.slotIndex ?? null,
  assetType: { code: o.code ?? null, role: roleFor(o) },
} as unknown as Asset);

// 원주 slotA ──OPGW── 홍천 slotB. eqA─OUT#5─slotA ; eqB─OUT#5─slotB ; eqC─OUT#6─slotB
const assets = [
  A({ id: 'slotA', name: 'OFD', substationId: 'subW', parentAssetId: 'ofdW', code: 'OFD-SLOT' }),
  A({ id: 'slotB', name: 'OFD', substationId: 'subH', parentAssetId: 'ofdH', code: 'OFD-SLOT' }),
  A({ id: 'eqA', name: '광단말A', substationId: 'subW', code: 'OPT-TRANS' }),
  A({ id: 'eqB', name: '광단말B', substationId: 'subH', code: 'OPT-TRANS' }),
  A({ id: 'eqC', name: '광단말C', substationId: 'subH', code: 'OPT-TRANS' }),
];
const cables = [
  { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null, specParams: { cores: 24 }, categoryName: 'HIV 2.5sq', categoryId: 'cat1' },
  { id: 'oA5', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 5 },
  { id: 'oB5', cableType: 'FIBER', sourceAssetId: 'slotB', targetAssetId: 'eqB', sourceRole: 'OUT', targetRole: null, number: 5 },
  { id: 'oB6', cableType: 'FIBER', sourceAssetId: 'slotB', targetAssetId: 'eqC', sourceRole: 'OUT', targetRole: null, number: 6 },
];
const NAMES = new Map([['subW', '원주S/S'], ['subH', '홍천S/S']]);

describe('buildTraceGraph + projections', () => {
  it('effective 단일 입력으로 그래프를 만들고 같은 번호 대국 설비를 투영한다', () => {
    const g = buildTraceGraph({ assets, cables, substationNames: NAMES });
    expect(g.assets.find((a) => a.id === 'slotA')?.role).toBe('slot');
    expect(g.cables.find((c) => c.id === 'oA5')?.number).toBe(5);
    const remote = traceRemoteEndpoints('eqA', g);
    expect(remote).toContain('eqB');
    expect(remote).not.toContain('eqC');
    expect(remote).not.toContain('eqA');
    expect(remote).not.toContain('slotA');
    expect(remoteSlotSubstation('slotA', g)).toBe('홍천S/S');
    expect(g.parentById.get('slotA')).toBe('ofdW');
    expect(g.codeById.get('slotA')).toBe('OFD-SLOT');
    expect(g.parentById.get('eqA')).toBe(null);
  });

  it('입력 케이블 집합을 그대로 반영(effective 가 상위에서 추가/삭제 처리)', () => {
    const g = buildTraceGraph({
      assets,
      cables: [...cables.filter((c) => c.id !== 'oA5'), { id: 'tmp-new', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 7 }],
      substationNames: NAMES,
    });
    expect(g.cables.some((c) => c.id === 'oA5')).toBe(false);
    expect(g.cables.some((c) => c.id === 'tmp-new')).toBe(true);
  });

  it('toTraceCable 이 specParams 를 보존한다 (OPGW cores 회귀 가드)', () => {
    const g = buildTraceGraph({ assets, cables, substationNames: NAMES });
    const opgw = g.cables.find((c) => c.id === 'opgw');
    expect(opgw?.specParams).toEqual({ cores: 24 });
    expect((opgw?.specParams as { cores?: number } | undefined)?.cores).toBe(24);
  });

  it('toTraceCable 가 categoryName/categoryId 를 보존한다 (계통 규격)', () => {
    const g = buildTraceGraph({ assets, cables, substationNames: NAMES });
    expect(g.cables.find((c) => c.id === 'opgw')).toMatchObject({ categoryName: 'HIV 2.5sq', categoryId: 'cat1' });
  });

  it('입력 자산 집합을 그대로 반영(effective 삭제는 상위에서) — 빠진 자산은 투영 안됨', () => {
    const g = buildTraceGraph({ assets: assets.filter((a) => a.id !== 'eqB'), cables, substationNames: NAMES });
    expect(g.assets.some((a) => a.id === 'eqB')).toBe(false);
    expect(traceRemoteEndpoints('eqA', g)).not.toContain('eqB');
  });

  it('subById: 자산 → substationId 매핑을 노출한다', () => {
    const g = buildTraceGraph({ assets: [A({ id: 'x', substationId: 'subA' })], cables: [], substationNames: NAMES });
    expect(g.subById.get('x')).toBe('subA');
  });
});

describe('buildTraceGraph 변전소명 해소(org 트리 맵)', () => {
  it('자산 변전소명을 substationNames 로 해소', () => {
    const g = buildTraceGraph({
      assets: [A({ id: 'a1', substationId: 'sub-A', code: 'OFD-SLOT', name: '새슬롯' })],
      cables: [], substationNames: new Map([['sub-A', 'A변전소']]),
    });
    expect(g.subById.get('a1')).toBe('sub-A');
    expect(g.subNameById.get('a1')).toBe('A변전소');
    expect(g.nameById.get('a1')).toBe('새슬롯');
  });

  it('substationNames 에 없으면 subNameById 미설정(폴백 없음)', () => {
    const g = buildTraceGraph({ assets: [A({ id: 'a1', substationId: 'sub-NEW' })], cables: [], substationNames: new Map() });
    expect(g.subById.get('a1')).toBe('sub-NEW');
    expect(g.subNameById.get('a1')).toBeUndefined();
  });

  it('타 본부→강원 라벨 붕괴 회귀(Bug1): 자국·대국 변전소명 모두 해소', () => {
    const g = buildTraceGraph({
      assets: [
        A({ id: 'slotB', substationId: 'sub-GW', parentAssetId: 'ofdGW', code: 'OFD-SLOT' }),
        A({ id: 'ofdA', substationId: 'sub-B', name: 'OFD', code: 'OFD' }),
        A({ id: 'slotA', substationId: 'sub-B', name: '(구)춘천S/S', parentAssetId: 'ofdA', code: 'OFD-SLOT' }),
      ],
      cables: [{ id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null, specParams: { cores: 24 } }],
      substationNames: new Map([['sub-B', 'B변전소'], ['sub-GW', '(구)춘천S/S']]),
    });
    expect(g.subNameById.get('ofdA')).toBe('B변전소');
    expect(g.subNameById.get('slotA')).toBe('B변전소');
    expect(remoteSlotSubstation('slotA', g)).toBe('(구)춘천S/S');
  });
});

describe('ofdAssets / equipmentInSubstation (staged 가 저장 전에도 후보에 보임)', () => {
  it('ofdAssets: 모든 OFD 자산 열거(이름 해소 포함)', () => {
    const g = buildTraceGraph({
      assets: [
        A({ id: 'ofdGW', substationId: 'sub-GW', code: 'OFD' }),
        A({ id: 'ofdNEW', substationId: 'sub-B', name: 'OFD', code: 'OFD' }),
      ],
      cables: [],
      substationNames: new Map([['sub-B', 'B변전소'], ['sub-GW', '(구)춘천S/S']]),
    });
    const ids = ofdAssets(g).map((o) => o.id).sort();
    expect(ids).toEqual(['ofdGW', 'ofdNEW']);
    const neu = ofdAssets(g).find((o) => o.id === 'ofdNEW')!;
    expect(neu.substationId).toBe('sub-B');
    expect(neu.substationName).toBe('B변전소');
  });

  it('ofdAssets: 스테이징 OFD(code 없이 role=ofd)도 열거 — 저장 전 경로슬롯 추가 가능', () => {
    const g = buildTraceGraph({
      assets: [
        // 에디터로 막 만든 OFD: code 없음, role='ofd' 만 있음(staged 생성이 role 부여).
        { id: 'ofdStaged', name: 'OFD', substationId: 'sub-B', parentAssetId: null, slotIndex: null, assetType: { role: 'ofd' } },
      ],
      cables: [],
      substationNames: new Map([['sub-B', 'B변전소']]),
    });
    const ids = ofdAssets(g).map((o) => o.id);
    expect(ids).toEqual(['ofdStaged']);
    expect(ofdAssets(g)[0].substationName).toBe('B변전소');
  });

  it('equipmentInSubstation: 스테이징 OFD(role)도 후보에서 제외', () => {
    const g = buildTraceGraph({
      assets: [
        { id: 'eqNEW', substationId: 'sub-B', name: '통합단말', parentAssetId: null, slotIndex: null, assetType: { code: 'OPT-COT', role: 'device' } },
        { id: 'ofdStaged', substationId: 'sub-B', name: 'OFD', parentAssetId: null, slotIndex: null, assetType: { role: 'ofd' } },
      ],
      cables: [],
      substationNames: new Map([['sub-B', 'B변전소']]),
    });
    expect(equipmentInSubstation(g, 'sub-B').map((c) => c.id)).toEqual(['eqNEW']);
  });

  it('equipmentInSubstation: 설비만 포함, OFD·conduit 제외', () => {
    const g = buildTraceGraph({
      assets: [
        A({ id: 'eqNEW', substationId: 'sub-B', name: '통합단말', code: 'OPT-COT' }),
        A({ id: 'ofdB', substationId: 'sub-B', name: 'OFD', code: 'OFD' }),
        A({ id: 'slotB', substationId: 'sub-B', name: '슬롯', code: 'OFD-SLOT' }),
      ],
      cables: [],
      substationNames: new Map([['sub-B', 'B변전소']]),
    });
    const cand = equipmentInSubstation(g, 'sub-B');
    expect(cand.map((c) => c.id)).toEqual(['eqNEW']);
    expect(cand[0].name).toBe('통합단말');
  });
});

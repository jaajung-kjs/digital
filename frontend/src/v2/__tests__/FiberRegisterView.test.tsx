/**
 * FiberRegisterView — 배선(wiring) 테스트
 *
 * 셀렉터 단위 테스트만으로는 콜사이트가 types 인자를 빠뜨려도 통과하는 갭이 있었다
 * (R-3 리뷰 P1: buildFiberRows 4번째 인자 누락 → 프로덕션에서 meta 전부 비활성).
 * 이 테스트는 컴포넌트를 실제 렌더해 카탈로그 lineSide 선언이 meta 입력까지
 * 관통하는지 단언한다 — 배선이 끊기면 실패한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { emptyOverlay } from '../store/overlay';
import { FiberRegisterView } from '../components/FiberRegisterView';
import type { V2Asset, V2AssetType, V2Cable } from '../types';

// useV2Catalog 만 목킹 — lineSide 선언이 담긴 카탈로그를 공급
const mockTypes: V2AssetType[] = [
  {
    id: 't', key: 'SLOT-X', name: '광슬롯', categoryId: 'c', sortOrder: 1, isActive: true,
    assetCount: 0, placeable: false, defaultWidth: null, defaultHeight: null,
    laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
    fieldDefs: [], containerSpecs: [], linkRules: [],
    portTemplates: [
      { id: 'pt-a', group: 'A', count: 2, direction: 'BI', medium: 'fiber', namePattern: '성단 {n}', sortOrder: 1, lineSide: false },
      { id: 'pt-b', group: 'B', count: 2, direction: 'BI', medium: 'fiber', namePattern: '선로 {n}', sortOrder: 2, lineSide: true },
    ],
  },
];

vi.mock('../hooks', () => ({
  useV2Catalog: () => ({ data: { categories: [], types: mockTypes, cableGroups: [] } }),
}));

const port = (id: string, assetId: string, group: string, index: number) =>
  ({ id, assetId, group, index, name: `${group} ${index}`, direction: 'BI' as const, medium: 'fiber' });
const asset = (id: string, name: string, extra: Partial<V2Asset> = {}): V2Asset => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const cable = (id: string, a: string, b: string, extra: Partial<V2Cable> = {}): V2Cable => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

const ofd = asset('ofd', 'OFD-1');
const slot = asset('slot', '슬롯1', {
  parentAssetId: 'ofd',
  ports: [port('a1', 'slot', 'A', 1), port('a2', 'slot', 'A', 2), port('b1', 'slot', 'B', 1), port('b2', 'slot', 'B', 2)],
});

function setStore(assets: V2Asset[], cables: V2Cable[]) {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: { substation: null, floors: [], assets, maintenanceLogs: [], inspectionLogs: [], cables },
    overlays: { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), cables: emptyOverlay() },
    baseVersions: {},
  });
}

describe('FiberRegisterView 배선 — 카탈로그 lineSide → meta 입력 관통', () => {
  beforeEach(() => {
    setStore([], []);
  });

  it('lineSide(B) 그룹 케이블의 specParams가 meta 입력에 채워진다 (types 배선 회귀 핀)', () => {
    const c = cable('c1', 'b1', 'x', { specParams: { lengthM: 12.5, lossDb: 0.3 } });
    setStore([ofd, slot], [c]);

    render(<FiberRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    // meta 길이 입력이 활성(input)이고 값이 채워져 있어야 한다.
    // 콜사이트가 types 를 빠뜨리면 lineSide 판독 불가 → cableId null → 입력 대신 '—' 렌더 → 실패.
    expect(screen.getByDisplayValue('12.5')).toBeTruthy();
    expect(screen.getByDisplayValue('0.3')).toBeTruthy();
  });

  it('A 그룹(비-lineSide)에만 케이블이 있으면 meta 입력은 비활성 (폴백 부재)', () => {
    const c = cable('c2', 'a2', 'x', { specParams: { lengthM: 7 } });
    setStore([ofd, slot], [c]);

    render(<FiberRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    // 비-lineSide 그룹 케이블의 값이 meta 로 새어들면 안 된다.
    expect(screen.queryByDisplayValue('7')).toBeNull();
  });
});

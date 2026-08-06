import { describe, expect, it } from 'vitest';
import { buildFiberRows, fiberContainers } from '../fiberSelectors';
import type { V2AssetType } from '../types';

const port = (id: string, assetId: string, group: string, index: number, medium = 'fiber', name?: string) =>
  ({ id, assetId, group, index, name: name ?? `${group === 'A' ? '성단' : '선로'} ${index}`, direction: 'BI' as const, medium });
const asset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const cable = (id: string, a: string, b: string, extra: object = {}) => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

// Type with B group declared as lineSide (OFD-SLOT 시드 구조)
const typeWithLineSide: V2AssetType = {
  id: 't', key: 'OFD-SLOT', name: '광슬롯', categoryId: 'c', sortOrder: 1, isActive: true,
  assetCount: 0, placeable: false, defaultWidth: null, defaultHeight: null,
  laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
  fieldDefs: [], containerSpecs: [], linkRules: [],
  portTemplates: [
    { id: 'pt-a', group: 'A', count: 2, direction: 'BI', medium: 'fiber', namePattern: '성단 {n}', sortOrder: 1, lineSide: false },
    { id: 'pt-b', group: 'B', count: 2, direction: 'BI', medium: 'fiber', namePattern: '선로 {n}', sortOrder: 2, lineSide: true },
  ],
};

// Type with NO lineSide declared
const typeNoLineSide: V2AssetType = {
  ...typeWithLineSide,
  id: 't2',
  portTemplates: typeWithLineSide.portTemplates.map((p) => ({ ...p, lineSide: false })),
};

const ofd = asset('ofd', 'OFD-1');
const slot = asset('slot', '슬롯1', {
  parentAssetId: 'ofd',
  typeId: 't',
  ports: [port('a1', 'slot', 'A', 1), port('a2', 'slot', 'A', 2), port('b1', 'slot', 'B', 1), port('b2', 'slot', 'B', 2)],
});
const dev = asset('dev', '장비1', { ports: [port('d1', 'dev', 'P', 1, 'fiber', '포트 1')] });

describe('fiberContainers', () => {
  it('광 포트 자식을 실보유한 자산만', () => {
    expect(fiberContainers([ofd, slot, dev] as never).map((c) => c.asset.id)).toEqual(['ofd']);
  });
});

describe('buildFiberRows', () => {
  it('그룹 동적 컬럼 + 코어별 행 + 로컬 peer 해소', () => {
    const cables = [cable('c1', 'd1', 'a1')];
    const { groups, rows } = buildFiberRows(ofd as never, [ofd, slot, dev] as never, cables as never, [typeWithLineSide]);
    expect(groups).toEqual(['A', 'B']);
    expect(rows).toHaveLength(2); // core 1, 2
    const r1 = rows[0]!;
    expect(r1.cells[0]).toMatchObject({ group: 'A', cableId: 'c1', peer: { assetName: '장비1', portName: '포트 1', remote: false } });
    expect(r1.cells[1]).toMatchObject({ group: 'B', cableId: null, peer: null });
  });

  it('로컬 미해소 시 saved refs로 대국 표시', () => {
    const remoteCable = cable('c2', 'b2', 'remote-port', {
      aRef: { portName: '선로 2', portGroup: 'B', portIndex: 2, assetId: 'slot', assetName: '슬롯1', substationId: 'sub-1', substationName: '국사A' },
      bRef: { portName: '성단 7', portGroup: 'A', portIndex: 7, assetId: 'r-a', assetName: '원격슬롯', substationId: 'sub-2', substationName: '국사B' },
    });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [remoteCable] as never, [typeWithLineSide]);
    const r2 = rows[1]!;
    expect(r2.cells[1]!.peer).toMatchObject({ assetName: '원격슬롯', substationName: '국사B', remote: true });
  });

  // ── A-V1 휴리스틱 제거 관련 테스트 ─────────────────────────────────────────

  it('[lineSide 선언] B 그룹(lineSide=true)에 케이블 있으면 meta에 해당 케이블 선정', () => {
    // 구 테스트명: 'meta는 마지막 그룹 케이블의 specParams' → 선언 기반으로 대체
    const c = cable('c3', 'b1', 'x', { specParams: { lengthM: 12.5, lossDb: 0.3, inspectedAt: '2026-07-01' } });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [c as never] as never, [typeWithLineSide]);
    // B 그룹이 lineSide=true → c3가 meta 케이블
    expect(rows[0]!.meta).toMatchObject({ cableId: 'c3', lengthM: 12.5, lossDb: 0.3, inspectedAt: '2026-07-01' });
    // core 2에는 b2에 케이블 없음 → meta null
    expect(rows[1]!.meta).toMatchObject({ cableId: null, lengthM: null });
  });

  it('[lineSide 미선언] lineSide 그룹이 없으면 meta.cableId는 null', () => {
    // 구 테스트명: 없음(신규) — B 그룹에 케이블 있어도 lineSide 미선언이면 meta null
    const slotNoLineSide = { ...slot, typeId: 't2' };
    const c = cable('c5', 'b1', 'x', { specParams: { lengthM: 5 } });
    const { rows } = buildFiberRows(
      ofd as never,
      [ofd, slotNoLineSide as never, dev as never] as never,
      [c as never] as never,
      [typeNoLineSide],
    );
    expect(rows[0]!.meta).toMatchObject({ cableId: null, lengthM: null });
  });

  it('[폴백 부재 단언] A 그룹에만 케이블 있고 B 그룹(lineSide=true)엔 없으면 meta는 null (위치 폴백 없음)', () => {
    // 구 테스트명: 'meta 폴백: 마지막 그룹에 케이블 없으면 앞 그룹 케이블' → 역동작 단언으로 대체
    // 이 케이스가 OLD 폴백의 회귀 핀: A 그룹만 케이블 있어도 meta null이어야 함
    const c = cable('c4', 'a2', 'x', { specParams: { lengthM: 7 } }); // A그룹 index2에만 연결
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [c as never] as never, [typeWithLineSide]);
    // B 그룹(lineSide=true)에 케이블 없음 → meta null (위치 폴백으로 A 케이블 선정 금지)
    expect(rows[1]!.meta).toMatchObject({ cableId: null, lengthM: null });
  });

  it('슬롯별 core max — 작은 슬롯은 빈 필러 행 없음', () => {
    const small = asset('slot2', '슬롯2', { parentAssetId: 'ofd', ports: [port('s2a1', 'slot2', 'A', 1), port('s2b1', 'slot2', 'B', 1)] });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot, small] as never, [] as never, [typeWithLineSide]);
    expect(rows.filter((r) => r.slotId === 'slot2')).toHaveLength(1);
    expect(rows.filter((r) => r.slotId === 'slot')).toHaveLength(2);
  });
});

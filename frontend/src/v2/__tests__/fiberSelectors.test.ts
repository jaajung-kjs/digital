import { describe, expect, it } from 'vitest';
import { buildFiberRows, fiberContainers } from '../fiberSelectors';

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

const ofd = asset('ofd', 'OFD-1');
const slot = asset('slot', '슬롯1', {
  parentAssetId: 'ofd',
  ports: [port('a1', 'slot', 'A', 1), port('a2', 'slot', 'A', 2), port('b1', 'slot', 'B', 1), port('b2', 'slot', 'B', 2)],
});
const dev = asset('dev', '장비1', { ports: [port('d1', 'dev', 'P', 1, 'fiber', '포트 1')] });

describe('fiberContainers', () => {
  it('광 포트 자식을 실보유한 자산만', () => {
    expect(fiberContainers([ofd, slot, dev] as never).map((a) => a.id)).toEqual(['ofd']);
  });
});

describe('buildFiberRows', () => {
  it('그룹 동적 컬럼 + 코어별 행 + 로컬 peer 해소', () => {
    const cables = [cable('c1', 'd1', 'a1')];
    const { groups, rows } = buildFiberRows(ofd as never, [ofd, slot, dev] as never, cables as never);
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
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [remoteCable] as never);
    const r2 = rows[1]!;
    expect(r2.cells[1]!.peer).toMatchObject({ assetName: '원격슬롯', substationName: '국사B', remote: true });
  });

  it('meta는 마지막 그룹 케이블의 specParams', () => {
    const c = cable('c3', 'b1', 'x', { specParams: { lengthM: 12.5, lossDb: 0.3, inspectedAt: '2026-07-01' } });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [c as never] as never);
    expect(rows[0]!.meta).toMatchObject({ cableId: 'c3', lengthM: 12.5, lossDb: 0.3, inspectedAt: '2026-07-01' });
    expect(rows[1]!.meta).toMatchObject({ cableId: null, lengthM: null });
  });

  it('meta 폴백: 마지막 그룹에 케이블 없으면 앞 그룹 케이블', () => {
    const c = cable('c4', 'a2', 'x', { specParams: { lengthM: 7 } }); // A그룹 index2에만 연결
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [c as never] as never);
    expect(rows[1]!.meta).toMatchObject({ cableId: 'c4', lengthM: 7 });
  });
});

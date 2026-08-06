import { describe, expect, it } from 'vitest';
import { buildPowerRows, powerContainers } from '../powerSelectors';

const port = (id: string, assetId: string, group: string, index: number, direction: 'IN' | 'OUT' | 'BI', medium = 'power', name?: string) =>
  ({ id, assetId, group, index, name: name ?? `${group}${index}`, direction, medium });
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

const panel = asset('panel', '분전반1');
const feeder = asset('f1', '피더1', {
  parentAssetId: 'panel',
  fieldValues: { breakerNo: 'NFB-3', switchState: 'ON' },
  ports: [port('f1in', 'f1', 'IN', 1, 'IN', 'power', 'IN'), port('f1out', 'f1', 'OUT', 1, 'OUT', 'power', 'OUT')],
});
const ups = asset('ups', 'UPS-1', { ports: [port('upsOut', 'ups', 'P', 1, 'OUT')] });
const load = asset('load', '부하장비', { ports: [port('loadIn', 'load', 'P', 1, 'IN')] });

describe('powerContainers', () => {
  it('전원 포트 자식 보유 컨테이너만', () => {
    expect(powerContainers([panel, feeder, ups] as never).map((a) => a.id)).toEqual(['panel']);
  });
});

describe('buildPowerRows', () => {
  it('피더 행 — IN/OUT 연결·차단기·전압', () => {
    const cables = [
      cable('cin', 'upsOut', 'f1in', { specParams: { voltage: 'AC 220V' } }),
      cable('cout', 'f1out', 'loadIn'),
    ];
    const rows = buildPowerRows(panel as never, [panel, feeder, ups, load] as never, cables as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feederName: '피더1', breakerNo: 'NFB-3', switchState: 'ON',
      inCell: { cableId: 'cin', voltage: 'AC 220V', peer: { assetName: 'UPS-1', remote: false } },
      outCell: { cableId: 'cout', peer: { assetName: '부하장비' } },
    });
  });

  it('연결 없는 피더 — 셀 null, 필드만', () => {
    const rows = buildPowerRows(panel as never, [panel, feeder] as never, [] as never);
    expect(rows[0]!.inCell).toMatchObject({ cableId: null, peer: null, voltage: null });
  });
});

describe('패널 스케줄 — 회로 자리', () => {
  // 전기 도면의 패널 스케줄은 회로 번호가 곧 패널에서의 위치이고,
  // 쓰지 않는 자리도 SPARE 로 보여준다. 그 두 성질을 붙잡는다.
  const mk = (id: string, name: string, breakerNo: string | null, slotIndex: number | null) =>
    asset(id, name, {
      parentAssetId: 'panel',
      slotIndex,
      fieldValues: breakerNo == null ? {} : { breakerNo },
      ports: [port(`${id}in`, id, 'IN', 1, 'IN'), port(`${id}out`, id, 'OUT', 1, 'OUT')],
    });

  it('이름순이 아니라 차단기 번호순으로 읽는다', () => {
    const assets = [panel, mk('c', '가피더', '10', null), mk('a', '나피더', '2', null)];
    const rows = buildPowerRows(panel, assets, []);
    expect(rows.map((r) => r.breakerNo)).toEqual(['2', '10']); // 문자열 정렬이면 '10' 이 앞선다
  });

  it('차단기 번호가 없으면 슬롯 자리로 물러선다 — 순서를 잃지 않게', () => {
    const assets = [panel, mk('x', '나중', null, 4), mk('y', '먼저', null, 1)];
    expect(buildPowerRows(panel, assets, []).map((r) => r.feederName)).toEqual(['먼저', '나중']);
  });

  it('회로 수를 선언하면 빈 자리도 행이 된다 — 12회로에 2개만 물린 것이 보여야 한다', () => {
    const assets = [panel, mk('a', '피더A', null, 0), mk('b', '피더B', null, 5)];
    const rows = buildPowerRows(panel, assets, [], 12);
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.slotNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rows.filter((r) => r.empty)).toHaveLength(10);
    expect(rows[0]?.feederName).toBe('피더A');
    expect(rows[5]?.feederName).toBe('피더B');
    expect(rows[1]?.empty).toBe(true);
  });

  it('자유형(회로 수 미선언)이면 있는 것만 나열한다 — 빈 자리를 지어내지 않는다', () => {
    const assets = [panel, mk('a', '피더A', null, 0)];
    const rows = buildPowerRows(panel, assets, [], null);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.empty).toBe(false);
  });
});

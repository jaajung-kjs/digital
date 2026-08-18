import { describe, expect, it } from 'vitest';
import { buildPowerRows, powerContainers } from '../powerSelectors';

const port = (
  id: string, assetId: string, group: string, index: number, direction: 'IN' | 'OUT' | 'BI',
  medium = 'power', name?: string, fieldValues: Record<string, unknown> = {},
) => ({ id, assetId, group, index, name: name ?? `${group}${index}`, direction, medium, positions: 1, fieldValues });
const asset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, assemblyId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const cable = (id: string, a: string, b: string, extra: object = {}) => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

const panel = asset('panel', '분전반1');
const feeder = asset('f1', '피더1', {
  parentAssetId: 'panel',
  /* 개폐는 **출력 포트**에 담긴다 — 자산의 필드가 아니다(회로의 상태다). */
  ports: [
    port('f1in', 'f1', 'IN', 1, 'IN', 'power', 'IN'),
    port('f1out', 'f1', 'OUT', 1, 'OUT', 'power', 'OUT', { closed: true }),
  ],
});
const ups = asset('ups', 'UPS-1', { ports: [port('upsOut', 'ups', 'P', 1, 'OUT')] });
const load = asset('load', '부하장비', { ports: [port('loadIn', 'load', 'P', 1, 'IN')] });

describe('powerContainers', () => {
  it('전원 포트 자식 보유 컨테이너만', () => {
    expect(powerContainers([panel, feeder, ups] as never).map((c) => c.id)).toEqual(['panel']);
  });
});

describe('buildPowerRows', () => {
  it('피더 행 — IN/OUT 연결·상태·전압', () => {
    const cables = [
      cable('cin', 'upsOut', 'f1in', { specParams: { voltage: 'AC 220V' } }),
      cable('cout', 'f1out', 'loadIn'),
    ];
    const rows = buildPowerRows(panel as never, [panel, feeder, ups, load] as never, cables as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feederName: '피더1', closed: true,
      inCell: { cableId: 'cin', values: { voltage: 'AC 220V' }, peer: { assetName: 'UPS-1', remote: false } },
      outCell: { cableId: 'cout', peer: { assetName: '부하장비' } },
    });
  });

  it('연결 없는 피더 — 셀 null, 필드만', () => {
    const rows = buildPowerRows(panel as never, [panel, feeder] as never, [] as never);
    expect(rows[0]!.inCell).toMatchObject({ cableId: null, peer: null, values: {} });
  });
});

describe('패널 스케줄 — 회로 자리', () => {
  // 전기 도면의 패널 스케줄은 회로 번호가 곧 패널에서의 위치이고,
  // 쓰지 않는 자리도 SPARE 로 보여준다. 그 두 성질을 붙잡는다.
  const mk = (id: string, name: string, breakerNo: string | null, slotIndex: number | null) =>
    asset(id, name, {
      parentAssetId: 'panel',
      // 1열 격자에서는 행이 곧 자리 번호(0-based)다.
      col: slotIndex == null ? null : 0,
      row: slotIndex,
      fieldValues: breakerNo == null ? {} : { breakerNo },
      ports: [port(`${id}in`, id, 'IN', 1, 'IN'), port(`${id}out`, id, 'OUT', 1, 'OUT')],
    });

  /* 회로 번호 = 패널에서의 자리. 예전에는 커스텀 필드 `breakerNo` 를 먼저 봤는데,
     그러면 표에 보이는 번호(자리)와 정렬 기준이 서로 달랐다. */
  it('자리 번호순으로 읽는다 — 이름순이 아니다', () => {
    const assets = [panel, mk('x', '나중', null, 4), mk('y', '먼저', null, 1)];
    expect(buildPowerRows(panel, assets, []).map((r) => r.feederName)).toEqual(['먼저', '나중']);
  });

  it('자리 번호는 문자열이 아니라 수로 센다 — 10이 2보다 앞서면 안 된다', () => {
    const assets = [panel, mk('c', '열번', null, 9), mk('a', '두번', null, 1)];
    expect(buildPowerRows(panel, assets, []).map((r) => r.slotNo)).toEqual([2, 10]);
  });

  it('자리 번호가 없으면(자유형) 이름순으로 물러선다', () => {
    const assets = [panel, mk('x', '나피더', null, null), mk('y', '가피더', null, null)];
    expect(buildPowerRows(panel, assets, []).map((r) => r.feederName)).toEqual(['가피더', '나피더']);
  });

  it('빈 회로를 지어내지 않는다 — 실제로 놓인 피더만 나열한다', () => {
    /* 예전에는 격자 칸 수만큼 빈 행을 만들어 「12회로 분전반」을 표현했다. 도화지 칸 수를
       회로 수라고 우긴 것이라, 모든 설비가 같은 판을 쓰게 된 지금은 200행이 된다. */
    const assets = [panel, mk('a', '피더A', null, 0), mk('b', '피더B', null, 5)];
    const rows = buildPowerRows(panel, assets, [], { cols: 1, rows: 12 });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.feederName)).toEqual(['피더A', '피더B']);
  });
});

/* 분전반 조서는 좌우 두 줄이다 — 격자가 2열이면 번호는 행 우선으로 1·2가 첫 행이다.
   예전에는 이것을 컨테이너 두 개로 표현해서 양쪽 다 0번 자리를 갖는 표가 둘로 갈렸다.
   격자 하나로 두면 한 표 안에서 번호가 이어진다. */
describe('2열 격자', () => {
  const twoCol = asset('panel2', '분전반2');
  const left = asset('L', '좌측 1번', {
    parentAssetId: 'panel2', col: 0, row: 0,
    ports: [port('Lin', 'L', 'IN', 1, 'IN')],
  });
  const right = asset('R', '우측 1번', {
    parentAssetId: 'panel2', col: 1, row: 0,
    ports: [port('Rin', 'R', 'IN', 1, 'IN')],
  });

  it('같은 행의 옆 칸은 다음 회로 번호다', () => {
    const rows = buildPowerRows(twoCol as never, [twoCol, left, right] as never, [] as never, { cols: 2, rows: 1 });
    expect(rows.map((r) => [r.slotNo, r.feederName])).toEqual([[1, '좌측 1번'], [2, '우측 1번']]);
  });

  it('격자 크기와 무관하게 놓인 것만 나온다', () => {
    const rows = buildPowerRows(twoCol as never, [twoCol, left] as never, [] as never, { cols: 2, rows: 2 });
    expect(rows.map((r) => r.feederName)).toEqual(['좌측 1번']);
  });
});

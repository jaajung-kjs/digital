import { describe, expect, it } from 'vitest';
import { buildFiberRows, fiberContainers } from '../fiberSelectors';

const port = (
  id: string, assetId: string, group: string, index: number,
  extra: { medium?: string; name?: string; positions?: number; fieldValues?: Record<string, unknown> } = {},
) => ({
  id, assetId, group, index,
  name: extra.name ?? `광 ${index}`,
  direction: 'BI' as const,
  medium: extra.medium ?? 'fiber',
  positions: extra.positions ?? 1,
  fieldValues: extra.fieldValues ?? {},
});
/** 다심 인입 포트 하나 — 코어 수만큼 심선을 나른다. */
const trunk = (id: string, assetId: string, positions: number, fieldValues: Record<string, unknown> = {}) =>
  port(id, assetId, 'TRUNK', 1, { medium: 'fiber', name: 'OPGW', positions, fieldValues });

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

const ofd = asset('ofd', 'OFD-1');
/** 2심짜리 경로슬롯 — 성단 2 + 인입 1. */
const slot = asset('slot', '슬롯1', {
  parentAssetId: 'ofd',
  ports: [
    port('a1', 'slot', 'CORE', 1),
    port('a2', 'slot', 'CORE', 2),
    trunk('t1', 'slot', 2, { 1: { lossDb: 0.3 } }),
  ],
});
const dev = asset('dev', '장비1', { ports: [port('d1', 'dev', 'P', 1, { name: '포트 1' })] });
/** 그 판에 들어온 광 — 선번장은 **인입이 물린 판만** 적으므로 어느 시험에나 이것이 있어야 한다. */
const trunkCable = cable('in', 't1', 'far-trunk');

describe('fiberContainers', () => {
  /* 예전에는 "광 포트를 가진 자식" 이면 다 걸려서 장비쪽 광 포트만 있는 광단말까지 대상이 됐다.
     선번장에 적는 것은 OTDR 로 재는 인입 심선의 값이라, 인입이 없는 자산에는 적을 것이 없다. */
  it('인입 포트를 가진 자식을 보유한 자산만 — 단심 광만 있는 자산은 아니다', () => {
    const optTerm = asset('opt', '광단말-1', {
      parentAssetId: 'rack',
      ports: [port('o1', 'opt', 'CORE', 1)],
    });
    const rack = asset('rack', '통신랙 A');
    expect(fiberContainers([ofd, slot, dev, rack, optTerm] as never).map((c) => c.id)).toEqual(['ofd']);
  });
});

describe('buildFiberRows', () => {
  it('행은 인입의 코어 수만큼 — 성단 열은 단심 광 그룹에서 나온다', () => {
    const cables = [trunkCable, cable('c1', 'd1', 'a1')];
    const { groups, rows } = buildFiberRows(ofd as never, [ofd, slot, dev] as never, cables as never);
    expect(groups).toEqual(['CORE']);
    expect(rows).toHaveLength(2); // 인입 positions=2
    expect(rows[0]!.cells[0]).toMatchObject({
      group: 'CORE', cableId: 'c1', peer: { assetName: '장비1', portName: '포트 1', remote: false },
    });
    expect(rows[1]!.cells[0]).toMatchObject({ cableId: null, peer: null });
  });

  /* 손실은 인입 포트 하나에 코어 번호 아래 담긴다 — 심선마다 포트를 만들지 않는다. */
  it('심선 값은 인입 포트에서 코어 번호로 갈라져 나온다', () => {
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [trunkCable] as never);
    expect(rows[0]!.meta.portId).toBe('t1');
    expect(rows[0]!.meta.portValues).toEqual({ lossDb: 0.3 });
    expect(rows[1]!.meta.portValues).toEqual({}); // 코어 2는 아직 안 잼
  });

  /* 40m 짜리 OPGW 는 24심이어도 40m 다 — 길이는 케이블 한 가닥의 값이라 모든 심선이 같은 수를 본다.
     예전 모델은 심선마다 케이블을 뒀기 때문에 이 40m 가 심선 수만큼 곱해져 집계됐다. */
  it('길이는 인입 케이블 한 가닥의 값 — 모든 코어 행이 같은 케이블을 가리킨다', () => {
    const c = cable('trunk-c', 't1', 'far-trunk', { specParams: { lengthM: 40 } });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [c] as never);
    expect(rows.map((r) => r.meta.cableId)).toEqual(['trunk-c', 'trunk-c']);
    expect(rows.map((r) => r.meta.cableValues)).toEqual([{ lengthM: 40 }, { lengthM: 40 }]);
  });

  /* 예전 모델에서는 대국을 슬롯 하나 더 만들어 표현해 추적이 거기서 끊겼다. */
  it('대국은 인입 건너편 슬롯의 같은 번호 심선을 지나 그 장비까지 이어진다', () => {
    const farSlot = asset('far', '슬롯3', {
      parentAssetId: 'ofd2',
      ports: [port('f1', 'far', 'CORE', 1), port('f2', 'far', 'CORE', 2), trunk('ft', 'far', 2)],
    });
    const farDev = asset('fdev', '대국장비', { ports: [port('fd1', 'fdev', 'P', 1, { name: '포트 5' })] });
    const cables = [
      cable('trunk-c', 't1', 'ft', { specParams: { lengthM: 40 } }),
      cable('far-jumper', 'f1', 'fd1'),
    ];
    const { rows } = buildFiberRows(ofd as never, [ofd, slot, farSlot, farDev] as never, cables as never);
    expect(rows[0]!.farEnd).toMatchObject({ assetName: '대국장비', portName: '포트 5' });
    /* 코어 2는 건너편 성단까지는 왔지만 거기서 장비로 안 나갔다 — 닿은 장비가 없다.
       한때 그 성단 포트(`슬롯3 광 2`)를 적었는데, 그것은 판의 자리이지 대국이 아니다. */
    expect(rows[1]!.farEnd).toBeNull();
  });

  /**
   * 대국 칸은 **장비만** 적는다 — 서버가 코어별로 풀어 준 것이 없으면 비어 있는 것이 답이다.
   *
   * 한때 그 자리에 구간 케이블 건너편의 **슬롯**을 적었다. 그러나 그것은 이 OPGW 가 어디에
   * 꽂혔나일 뿐 이 심선이 무엇에 닿았나가 아니다 — 성단되지 않은 스물두 줄이 전부 `원격슬롯#1`
   * 로 채워져, 심선이 다 이어진 것처럼(게다가 다 같은 곳으로) 읽혔다.
   */
  it('대국이 풀려 있지 않으면 대국 칸은 비어 있다 — 슬롯은 대국이 아니다', () => {
    const ref = (assetId: string, assetName: string, substationId: string, substationName: string) =>
      ({ portName: 'OPGW', portGroup: 'TRUNK', portIndex: 1, assetId, assetName, substationId, substationName });
    const remote = cable('rc', 't1', 'remote-trunk', {
      aRef: ref('slot', '슬롯1', 'sub-1', '국사A'),
      bRef: ref('r-a', '원격슬롯', 'sub-2', '국사B'),
    });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [remote] as never);
    expect(rows[0]!.farEnd).toBeNull();
  });

  /* 서버가 코어별 대국을 풀어 실어 주면 그 **장비**가 대국이다. */
  it('국을 넘는 코어는 서버가 풀어 준 장비를 코어마다 적는다', () => {
    const remote = cable('rc', 't1', 'remote-trunk', {
      aRef: { portName: 'OPGW', portGroup: 'TRUNK', portIndex: 1, assetId: 'slot', assetName: '슬롯1', substationId: 'sub-1', substationName: '국사A' },
      bRef: {
        portName: 'OPGW', portGroup: 'TRUNK', portIndex: 1, assetId: 'r-a', assetName: '원격슬롯',
        substationId: 'sub-2', substationName: '국사B',
        cores: [{ index: 2, assemblyName: '송광치', assetName: '광단말 B', portName: '광 2', portIndex: 2 }],
      },
    });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [remote] as never);
    expect(rows[0]!.farEnd).toBeNull();
    expect(rows[1]!.farEnd).toMatchObject({ assetName: '광단말 B', portIndex: 2, substationName: '국사B', remote: true });
  });

  /* 선번장은 **들어온 광의 성단표**다 — 아직 아무 광도 안 물린 판은 코어마다 빈 줄만
     스물넉 줄을 만들어, 정작 읽을 줄을 파묻는다. 판이 서 있는 것과 적히는 것은 다르다. */
  it('인입 케이블이 없는 판은 적지 않는다 — 자리는 서 있어도 적을 것이 없다', () => {
    const empty = asset('slot3', '슬롯3', {
      parentAssetId: 'ofd',
      ports: [port('s3a1', 'slot3', 'CORE', 1), trunk('t3', 'slot3', 2)],
    });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot, empty] as never, [trunkCable] as never);
    expect(rows.map((r) => r.slotId)).toEqual(['slot', 'slot']);
  });

  /* 12심 판과 24심 판이 한 함체에 섞여 있어도 각자 자기 코어 수만큼만 나온다 —
     예전에는 그 슬롯의 포트 최대 번호로 셌기 때문에 열의 정의와 행의 정의가 따로 놀았다. */
  it('행 수는 그 슬롯 인입의 코어 수 — 판마다 다르다', () => {
    const big = asset('slot2', '슬롯2', {
      parentAssetId: 'ofd',
      ports: [port('s2a1', 'slot2', 'CORE', 1), trunk('t2', 'slot2', 4)],
    });
    const cables = [trunkCable, cable('in2', 't2', 'far-trunk2')];
    const { rows } = buildFiberRows(ofd as never, [ofd, slot, big] as never, cables as never);
    expect(rows.filter((r) => r.slotId === 'slot')).toHaveLength(2);
    expect(rows.filter((r) => r.slotId === 'slot2')).toHaveLength(4);
    // 성단 포트가 없는 코어도 행은 있다 — 아직 안 나간 심선에도 손실을 적어야 한다.
    expect(rows.filter((r) => r.slotId === 'slot2').at(-1)!.cells[0]).toMatchObject({ portId: null });
  });
});

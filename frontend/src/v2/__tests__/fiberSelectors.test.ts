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
  port(id, assetId, 'TRUNK', 1, { medium: 'fiber-trunk', name: '광 인입', positions, fieldValues });

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

describe('fiberContainers', () => {
  /* 예전에는 "광 포트를 가진 자식" 이면 다 걸려서 장비쪽 광 포트만 있는 광단말까지 대상이 됐다.
     선번장에 적는 것은 OTDR 로 재는 인입 심선의 값이라, 인입이 없는 자산에는 적을 것이 없다. */
  it('인입 포트를 가진 자식을 보유한 자산만 — 단심 광만 있는 자산은 아니다', () => {
    const optTerm = asset('opt', '광단말-1', {
      parentAssetId: 'rack',
      ports: [port('o1', 'opt', 'CORE', 1)],
    });
    const rack = asset('rack', '통신랙 A');
    expect(fiberContainers([ofd, slot, dev, rack, optTerm] as never).map((c) => c.asset.id)).toEqual(['ofd']);
  });
});

describe('buildFiberRows', () => {
  it('행은 인입의 코어 수만큼 — 성단 열은 단심 광 그룹에서 나온다', () => {
    const cables = [cable('c1', 'd1', 'a1')];
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
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [] as never);
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
    // 코어 2는 건너편 심선까지는 있으나 아직 장비로 안 나갔다 — 성단까지가 끝이다.
    expect(rows[1]!.farEnd).toMatchObject({ assetName: '슬롯3', portName: '광 2' });
  });

  it('인입 건너편이 로컬에 없으면 saved refs 로 대국 슬롯까지 표시', () => {
    const remote = cable('rc', 't1', 'remote-trunk', {
      aRef: { portName: '광 인입', portGroup: 'TRUNK', portIndex: 1, assetId: 'slot', assetName: '슬롯1', substationId: 'sub-1', substationName: '국사A' },
      bRef: { portName: '광 인입', portGroup: 'TRUNK', portIndex: 1, assetId: 'r-a', assetName: '원격슬롯', substationId: 'sub-2', substationName: '국사B' },
    });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [remote] as never);
    expect(rows[0]!.farEnd).toMatchObject({ assetName: '원격슬롯', substationName: '국사B', remote: true });
  });

  /* 12심 판과 24심 판이 한 함체에 섞여 있어도 각자 자기 코어 수만큼만 나온다 —
     예전에는 그 슬롯의 포트 최대 번호로 셌기 때문에 열의 정의와 행의 정의가 따로 놀았다. */
  it('행 수는 그 슬롯 인입의 코어 수 — 판마다 다르다', () => {
    const big = asset('slot2', '슬롯2', {
      parentAssetId: 'ofd',
      ports: [port('s2a1', 'slot2', 'CORE', 1), trunk('t2', 'slot2', 4)],
    });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot, big] as never, [] as never);
    expect(rows.filter((r) => r.slotId === 'slot')).toHaveLength(2);
    expect(rows.filter((r) => r.slotId === 'slot2')).toHaveLength(4);
    // 성단 포트가 없는 코어도 행은 있다 — 아직 안 나간 심선에도 손실을 적어야 한다.
    expect(rows.filter((r) => r.slotId === 'slot2').at(-1)!.cells[0]).toMatchObject({ portId: null });
  });
});

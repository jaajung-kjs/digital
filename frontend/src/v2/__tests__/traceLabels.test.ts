import { describe, expect, it } from 'vitest';
import { traceLabeller } from '../traceLabels';
import type { PortIndex } from '../peerResolve';
import type { V2Cable } from '../types';

/** 이 카피 안의 포트 하나 — 이름을 짓는 데 필요한 만큼만. */
const local = (portId: string, assetName: string, portName: string, assemblyName: string | null) =>
  [portId, {
    port: { id: portId, name: portName } as never,
    asset: { id: `a-${assetName}`, name: assetName } as never,
    assemblyName,
  }] as const;

const index = (...rows: ReturnType<typeof local>[]): PortIndex =>
  new Map(rows) as unknown as PortIndex;

/** 국을 넘는 케이블 — 건너편은 이 카피에 없고 저장된 ref 가 아는 전부다. */
const remoteCable = (portId: string, ref: Record<string, unknown>): V2Cable =>
  ({ aPortId: portId, bPortId: 'x', aRef: ref, bRef: null } as unknown as V2Cable);

describe('traceLabeller — 추적 마디의 이름', () => {
  it('굵은 줄은 **장비 이름만**, 포트는 아랫줄로', () => {
    const label = traceLabeller({
      portIndex: index(local('p1', 'IR-48 50A #1', '전원 출력', '통신용 충전기 #1')),
      cablesByPortId: new Map(), tracedAssembly: '통신용 충전기 #1', localSubstationId: 's1',
    });
    expect(label('p1')).toEqual({ primary: 'IR-48 50A #1', secondary: '전원 출력' });
  });

  /* 번호는 묶음 안에서만 매겨져 한 장비의 `#1` 이 넷일 수 있다 — 이름은 그 넷을 가른다. */
  it('한 장비의 포트 넷이 이름으로 갈린다', () => {
    const label = traceLabeller({
      portIndex: index(
        local('p1', 'IRCU', '전원 입력', 'A'), local('p2', 'IRCU', '접지', 'A'),
        local('p3', 'IRCU', 'LAN 1', 'A'), local('p4', 'IRCU', '경보 접점 1', 'A'),
      ),
      cablesByPortId: new Map(), tracedAssembly: 'A', localSubstationId: 's1',
    });
    expect(['p1', 'p2', 'p3', 'p4'].map((p) => label(p).secondary))
      .toEqual(['전원 입력', '접지', 'LAN 1', '경보 접점 1']);
  });

  /* 랙 한 대 안에서 도는 추적은 마디가 넷이면 같은 설비 이름이 넷 선다 — 군더더기다. */
  it('같은 설비 안이면 설비 이름을 생략한다', () => {
    const src = {
      portIndex: index(local('p1', 'SID-125', '전원 입력', '통신용 충전기 #1')),
      cablesByPortId: new Map(), localSubstationId: 's1',
    };
    expect(traceLabeller({ ...src, tracedAssembly: '통신용 충전기 #1' })('p1').secondary)
      .toBe('전원 입력');
    expect(traceLabeller({ ...src, tracedAssembly: '다른 설비' })('p1').secondary)
      .toBe('전원 입력 · 통신용 충전기 #1');
  });

  it('설비 밖의 장비는 붙일 설비 이름이 없다', () => {
    const label = traceLabeller({
      portIndex: index(local('p1', '소내배전반', '전원 출력 3', null)),
      cablesByPortId: new Map(), tracedAssembly: 'A', localSubstationId: 's1',
    });
    expect(label('p1')).toEqual({ primary: '소내배전반', secondary: '전원 출력 3' });
  });

  /* 이 카피에 없는 끝점 — 케이블에 저장된 ref 가 아는 전부다. */
  it('국을 넘는 끝점은 저장된 ref 로 부르고, **다른 국일 때만** 국 이름을 붙인다', () => {
    const ref = { assetName: '광단말 A', portName: '광 3', assemblyName: 'OFD', substationName: '북춘천S/S', substationId: 's2' };
    const src = { portIndex: index(), tracedAssembly: null };
    const remote = traceLabeller({
      ...src, localSubstationId: 's1',
      cablesByPortId: new Map([['p9', [{ cable: remoteCable('p9', ref) }]]]),
    });
    expect(remote('p9')).toEqual({ primary: '광단말 A', secondary: '광 3 · 북춘천S/S · OFD' });

    /* 같은 국이면 국 이름은 군더더기다. */
    const same = traceLabeller({
      ...src, localSubstationId: 's2',
      cablesByPortId: new Map([['p9', [{ cable: remoteCable('p9', ref) }]]]),
    });
    expect(same('p9').secondary).toBe('광 3 · OFD');
  });

  /** 케이블도 없고 이 카피에도 없다 — 이름을 지어내지 않는다. */
  it('아무것도 모르는 자리는 이름을 지어내지 않는다', () => {
    const label = traceLabeller({
      portIndex: index(), cablesByPortId: new Map(), tracedAssembly: null, localSubstationId: 's1',
    });
    expect(label('없는포트')).toEqual({ primary: '포트 —', secondary: null });
  });
});

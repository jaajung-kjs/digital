import { traceFromCore } from '@twin/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { deleteRows } from '../../../model/store/deleteActions';
import { effectiveNetwork } from '../networkSelectors';
import { pathSteps, pathSummary, pathTitle, shortStationName } from '../pathChain';
import { LINKS, linkRow, loadSubstations, serverNetwork } from './fixture';

const AT = { lineId: 'L1', coreNo: 9, side: 'A' as const };
const view = (without: string[] = []) => effectiveNetwork(serverNetwork(without), store.getState());
const trace = (without: string[] = []) => { const v = view(without); return { v, p: traceFromCore(v.input, AT) }; };

describe('국 이름 줄임(현장 회선현황 표기)', () => {
  it('S/S·S/Y 는 떼고, 다른 끝 약어는 빗금만 뗀다, (구)·(신)은 괄호만 뗀다 — 회선현황 「구춘천」「춘천HP」「열병합」', () => {
    expect(shortStationName('북춘천S/S')).toBe('북춘천');
    expect(shortStationName('춘천H/P')).toBe('춘천HP');
    expect(shortStationName('열병합S/Y')).toBe('열병합');
    expect(shortStationName('(구)춘천S/S')).toBe('구춘천');
    expect(shortStationName('(신)춘천S/S')).toBe('신춘천');
    expect(shortStationName('청평P/P')).toBe('청평PP');
    expect(shortStationName('S/S')).toBe('S/S');
  });
});

describe('중계경로 사슬 — RTU 예비회선', () => {
  beforeEach(() => loadSubstations(['BC']));

  it('요약은 현장 표기 그대로, 예비회선, 완결', () => {
    const { v, p } = trace();
    /* SCADA 「회선현황」 G7 과 같은 꼴 — 국(떠나는 끝의 접속 설비:어댑터)-…-닿는 국. */
    expect(pathSummary(v, p)).toBe('북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원');
    expect(p.duty).toBe('backup');
    expect(p.complete).toBe(true);
    expect(pathTitle(v, p, AT)).toBe('중계경로 — RTU 광스위치 · FX-TX:1');
  });

  it('요약의 수는 떠나는 끝의 어댑터 번호(시작 번호 + 코어 − 1) — 코어 번호가 아니다', () => {
    loadSubstations([]); // 들른 국 없음 — 서버 광선로(시작 번호)를 그대로 읽는다
    const server = serverNetwork();
    server.lines = server.lines.map((l) => (l.id === 'L1' ? { ...l, aStartNo: 25 } : l.id === 'L4' ? { ...l, bStartNo: 13 } : l));
    const v = effectiveNetwork(server, store.getState());
    const p = traceFromCore(v.input, AT);
    expect(pathSummary(v, p)).toBe('북춘천(OFD:33)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:49)-철원');
  });

  it('Tx/Rx 두 경로를 함께 주면 홉마다 어댑터를 `1·2` 로', () => {
    const { v, p } = trace();
    const twin = { ...p, hops: p.hops.map((h) => ({ ...h, coreNo: h.coreNo + 1 })) };
    expect(pathSummary(v, [twin, p])).toBe('북춘천(OFD:9·10)-춘천HP(OFD:20·21)-화천HP(OFD:1·2)-화천(OFD:37·38)-철원');
  });

  it('세로 사슬 — 끝 설비, 슬롯·어댑터·코어, 광선로(길이), 국 바뀌는 끝, 중계 패치 … 끝 설비', () => {
    const { v, p } = trace();
    const steps = pathSteps(v, p);
    expect(steps.slice(0, 5)).toEqual([
      { kind: 'end', station: '북춘천S/S', equipment: 'RTU 광스위치', port: 'FX-TX:1', at: { substationId: 'BC', lineId: 'L1', side: 'A' } },
      { kind: 'terminal', station: '북춘천S/S', showStation: false, place: 'OFD · 슬롯 2', adapter: 9, coreNo: 9, at: { substationId: 'BC', lineId: 'L1', side: 'A' } },
      { kind: 'line', text: '154kV 춘천수력T/L (8.500 km)' },
      { kind: 'terminal', station: '춘천H/P', showStation: true, place: 'OFD · 슬롯 3', adapter: 9, coreNo: 9, at: { substationId: 'CHP', lineId: 'L1', side: 'B' } },
      { kind: 'patch' },
    ]);
    expect(steps.filter((s) => s.kind === 'patch')).toHaveLength(3);
    expect(steps[steps.length - 1]).toMatchObject({ kind: 'end', station: '철원S/S', equipment: 'RTU', port: null });
  });
});

describe('저장 전 변경을 겹친다(effectiveNetwork)', () => {
  it('서버에 없는 패치도 들른 국에서 등록했으면 추적에 든다', () => {
    /* 화천S/S 패치(k4)가 서버에 없다 → 미완결. */
    loadSubstations(['BC'], []);
    expect(trace(['k4']).p.complete).toBe(false);
    /* 화천S/S 를 들러 그 패치를 저장 전에 등록하면 — 완결. */
    loadSubstations(['BC', 'HC'], ['k4']);
    expect(trace(['k4']).p.complete).toBe(false);
    store.getState().create('links', { ...linkRow(LINKS.find((l) => l.id === 'k4')!), id: 'new-k4', updatedAt: '' });
    const { v, p } = trace(['k4']);
    expect(p.complete).toBe(true);
    expect(pathSummary(v, p)).toBe('북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원');
  });

  it('들른 국에서 삭제한 연결은 서버에 있어도 빠진다 — 끊긴 자리가 그 코어 끝', () => {
    loadSubstations(['BC', 'HC']);
    deleteRows({ links: ['k4'] });
    const { v, p } = trace();
    expect(p.complete).toBe(false);
    expect(p.end).toBeNull();
    const steps = pathSteps(v, p);
    expect(steps[steps.length - 1]).toEqual({ kind: 'broken', station: '화천S/S', coreNo: 1, cause: 'open', at: { substationId: 'HC', lineId: 'L3', side: 'A' } });
  });

  it('끊긴 까닭 — 서버가 깊이 상한에서 멈춘 코어면 「경로가 길어 일부만」', () => {
    loadSubstations(['BC']);
    const server = { ...serverNetwork(['k4']), truncated: true, truncatedCores: [{ lineId: 'L3', no: 1 }] };
    const v = effectiveNetwork(server, store.getState());
    const p = traceFromCore(v.input, AT);
    const steps = pathSteps(v, p);
    expect(steps[steps.length - 1]).toMatchObject({ kind: 'broken', cause: 'truncated' });
    expect(v.truncated).toBe(true);
  });

  it('저장 전 코어 주/예비 값이 서버 값을 이긴다', () => {
    loadSubstations(['BC']);
    store.getState().updateCore('L1', 9, { role: 'main' });
    /* 한 코어만 주 — 사슬이 섞였으므로 배지 없음(null). */
    expect(trace().p.duty).toBeNull();
  });

  it('들르지 않은 국에서 시작이 끊기면 첫 줄이 경로 미완결 — 그 코어 끝', () => {
    loadSubstations(['CHP']);
    const v = view(['k1']);
    const p = traceFromCore(v.input, AT);
    expect(p.start).toBeNull();
    expect(pathSteps(v, p)[0]).toEqual({ kind: 'broken', station: '북춘천S/S', coreNo: 9, cause: 'open', at: { substationId: 'BC', lineId: 'L1', side: 'A' } });
    expect(pathTitle(v, p, AT)).toBe('중계경로 — OFD · 슬롯 2 · 어댑터 9 · 코어 9');
  });
});

describe('저장 전 광선로·연결 변경(effectiveNetwork)', () => {
  it('새로 등록한 광선로와 그 패치가 사슬에 든다(서버에는 아직 없다)', () => {
    loadSubstations(['BC']);
    const s = store.getState();
    /* 북춘천에서 끝나던 사슬을 뒤로 늘린다 — RTU 를 떼고 새 광선로 L9(가평 → 북춘천) 코어 5 에 패치. */
    s.create('fiberLines', {
      id: 'L9', name: '새 선로', lengthKm: null, cableTypeId: 'opgw', coreCount: 12, segments: [],
      aSubstationId: 'GP', aEquipmentId: null, aPanel: null, aStartNo: 1,
      bSubstationId: 'BC', bEquipmentId: 'ofd-bc', bPanel: 4, bStartNo: 1,
      aSubstationName: '가평S/S', bSubstationName: '북춘천S/S', updatedAt: '',
    });
    deleteRows({ links: ['k1'] });
    s.create('links', { ...linkRow(LINKS[0]!), id: 'p9', a: { kind: 'core', lineId: 'L9', no: 5, side: 'B' }, updatedAt: '' });
    const { v, p } = trace();
    expect(p.hops.map((h) => `${h.lineId}:${h.coreNo}`)).toEqual(['L9:5', 'L1:9', 'L2:20', 'L3:1', 'L4:37']);
    expect(pathSummary(v, p)).toBe('가평(5)-북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원');
    expect(p.start).toBeNull();
    expect(pathSteps(v, p)[0]).toMatchObject({ kind: 'broken', station: '가평S/S', at: { substationId: 'GP', lineId: 'L9', side: 'A' } });
  });

  it('들른 국에 닿은 광선로를 삭제하면 서버에 있어도 빠진다 — 그 선의 코어도, 그 선에 닿은 연결도', () => {
    loadSubstations(['BC']);
    deleteRows({ fiberLines: ['L1'] });
    const v = view();
    expect(v.input.lines.map((l) => l.id)).not.toContain('L1');
    expect(v.input.cores.some((c) => c.lineId === 'L1')).toBe(false);
    expect(v.input.links.map((l) => l.id)).not.toContain('k1');
  });

  it('연결 끝을 바꾸면(저장 전) 바뀐 끝으로 추적한다', () => {
    loadSubstations(['BC']);
    /* k1 의 코어 끝을 L1 코어 9 → 코어 10 으로. 코어 9 의 자국 끝은 비고, 코어 10 은 RTU 에서 시작한다. */
    store.getState().update('links', 'k1', { b: { kind: 'core', lineId: 'L1', no: 10, side: 'A' } });
    const { p } = trace();
    expect(p.start).toBeNull();
    const v = view();
    const p10 = traceFromCore(v.input, { lineId: 'L1', coreNo: 10, side: 'A' });
    expect(p10.start).toMatchObject({ equipmentId: 'rtu-bc', port: 'FX-TX:1' });
  });
});

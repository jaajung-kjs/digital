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
  it('S/S 는 떼고, 다른 끝 약어는 빗금만 뗀다, (구)·(신)은 둔다', () => {
    expect(shortStationName('북춘천S/S')).toBe('북춘천');
    expect(shortStationName('춘천H/P')).toBe('춘천HP');
    expect(shortStationName('열병합S/Y')).toBe('열병합SY');
    expect(shortStationName('(구)춘천S/S')).toBe('(구)춘천');
    expect(shortStationName('S/S')).toBe('S/S');
  });
});

describe('중계경로 사슬 — RTU 예비회선', () => {
  beforeEach(() => loadSubstations(['BC']));

  it('요약은 현장 표기 그대로, 예비회선, 완결', () => {
    const { v, p } = trace();
    expect(pathSummary(v, p)).toBe('북춘천-(9)-춘천HP-(20)-화천HP-(1)-화천-(37)-철원');
    expect(p.role).toBe('backup');
    expect(p.complete).toBe(true);
    expect(pathTitle(v, p, AT)).toBe('중계경로 — RTU 광스위치 · FX-TX:1');
  });

  it('세로 사슬 — 끝 설비, 슬롯·코어, 광선로(길이), 국 바뀌는 끝, 중계 패치 … 끝 설비', () => {
    const { v, p } = trace();
    const steps = pathSteps(v, p);
    expect(steps.slice(0, 5)).toEqual([
      { kind: 'end', station: '북춘천S/S', equipment: 'RTU 광스위치', port: 'FX-TX:1', at: { substationId: 'BC', lineId: 'L1', side: 'A' } },
      { kind: 'terminal', station: null, place: 'OFD 슬롯 2', coreNo: 9, at: { substationId: 'BC', lineId: 'L1', side: 'A' } },
      { kind: 'line', text: '154kV 춘천수력T/L (8.5 km)' },
      { kind: 'terminal', station: '춘천H/P', place: 'OFD 슬롯 3', coreNo: 9, at: { substationId: 'CHP', lineId: 'L1', side: 'B' } },
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
    expect(pathSummary(v, p)).toBe('북춘천-(9)-춘천HP-(20)-화천HP-(1)-화천-(37)-철원');
  });

  it('들른 국에서 삭제한 연결은 서버에 있어도 빠진다 — 끊긴 자리가 그 코어 끝', () => {
    loadSubstations(['BC', 'HC']);
    deleteRows({ links: ['k4'] });
    const { v, p } = trace();
    expect(p.complete).toBe(false);
    expect(p.end).toBeNull();
    const steps = pathSteps(v, p);
    expect(steps[steps.length - 1]).toEqual({ kind: 'broken', station: '화천S/S', coreNo: 1, at: { substationId: 'HC', lineId: 'L3', side: 'A' } });
  });

  it('저장 전 코어 주/예비 값이 서버 값을 이긴다', () => {
    loadSubstations(['BC']);
    store.getState().updateCore('L1', 9, { role: 'main' });
    /* 한 코어만 주 — 사슬이 섞였으므로 배지 없음(null). */
    expect(trace().p.role).toBeNull();
  });

  it('들르지 않은 국에서 시작이 끊기면 첫 줄이 경로 미완결 — 그 코어 끝', () => {
    loadSubstations(['CHP']);
    const v = view(['k1']);
    const p = traceFromCore(v.input, AT);
    expect(p.start).toBeNull();
    expect(pathSteps(v, p)[0]).toEqual({ kind: 'broken', station: '북춘천S/S', coreNo: 9, at: { substationId: 'BC', lineId: 'L1', side: 'A' } });
    expect(pathTitle(v, p, AT)).toBe('중계경로 — OFD 슬롯 2 · 코어 9');
  });
});

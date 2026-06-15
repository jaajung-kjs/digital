import { describe, it, expect } from 'vitest';
import { buildFeederCircuits, feederGridSlots, type FeederCircuit } from './feederCircuits';

const FEEDER = 'f1';
const cb1 = { id: 'c1', sourceAssetId: FEEDER, targetAssetId: 'eqpA', sourceRole: 'OUT', targetRole: null, number: 1, categoryName: 'HIV 2.5sq', categoryId: 'cat1', specParams: { capacity: '20A', switchState: 'ON' } };
const cb4 = { id: 'c4', sourceAssetId: FEEDER, targetAssetId: 'eqpB', sourceRole: 'OUT', targetRole: null, number: 4, categoryName: 'HIV 4sq', categoryId: 'cat2', specParams: { capacity: '16A', switchState: 'OFF' } };
const nameById = new Map([['eqpA', '복도등'], ['eqpB', '옥외등']]);

describe('buildFeederCircuits (점유 회로만)', () => {
  it('점유된 CB 만 cbNumber 오름차순으로 반환', () => {
    const cs = buildFeederCircuits({ id: FEEDER }, [cb4, cb1], nameById);
    expect(cs).toHaveLength(2);
    expect(cs.map((c) => c.cbNumber)).toEqual([1, 4]);
    expect(cs.every((c) => c.occupied)).toBe(true);
  });
  it('점유 CB 는 부하/용량/개폐/규격을 담는다', () => {
    const cs = buildFeederCircuits({ id: FEEDER }, [cb1, cb4], nameById);
    const c1 = cs.find((c) => c.cbNumber === 1)!;
    expect(c1.cableId).toBe('c1');
    expect(c1.loadAssetId).toBe('eqpA');
    expect(c1.loadName).toBe('복도등');
    expect(c1.capacity).toBe('20A');
    expect(c1.switchState).toBe('ON');
    expect(c1.spec).toBe('HIV 2.5sq');
    expect(c1.categoryId).toBe('cat1');
  });
  it('CB 없으면 빈 배열', () => {
    expect(buildFeederCircuits({ id: FEEDER }, [], nameById)).toEqual([]);
  });
});

const occ = (n: number): FeederCircuit => ({
  cbNumber: n, occupied: true, cableId: `c${n}`, loadAssetId: `l${n}`, loadName: `부하${n}`,
  capacity: '20A', switchState: 'ON', spec: 'HIV', categoryId: 'cat',
});

describe('feederGridSlots (고정 그리드 패딩)', () => {
  it('점유 0개 → 기본 24칸(6×4) 빈 슬롯', () => {
    const slots = feederGridSlots([]);
    expect(slots).toHaveLength(24);
    expect(slots.every((s) => !s.occupied)).toBe(true);
    expect(slots.map((s) => s.cbNumber)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });
  it('점유 회로는 cbNumber 위치에, 나머지는 빈 슬롯', () => {
    const slots = feederGridSlots([occ(1), occ(4)]);
    expect(slots).toHaveLength(24);
    expect(slots[0].occupied).toBe(true);
    expect(slots[0].cbNumber).toBe(1);
    expect(slots[3].occupied).toBe(true); // CB 4
    expect(slots[1].occupied).toBe(false); // CB 2 빈
  });
  it('점유가 24 이상이면 줄(6) 단위로 늘리고 빈 슬롯을 남긴다', () => {
    const slots = feederGridSlots([occ(24)]);
    expect(slots).toHaveLength(30); // ceil(25/6)*6
    expect(slots.some((s) => !s.occupied)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { buildFeederCircuits } from './feederCircuits';

const FEEDER = 'f1';
const cb1 = { id: 'c1', sourceAssetId: FEEDER, targetAssetId: 'eqpA', sourceRole: 'OUT', targetRole: null, number: 1, categoryName: 'HIV 2.5sq', categoryId: 'cat1', specParams: { capacity: '20A', switchState: 'ON' } };
const cb4 = { id: 'c4', sourceAssetId: FEEDER, targetAssetId: 'eqpB', sourceRole: 'OUT', targetRole: null, number: 4, categoryName: 'HIV 4sq', categoryId: 'cat2', specParams: { capacity: '16A', switchState: 'OFF' } };
const nameById = new Map([['eqpA', '복도등'], ['eqpB', '옥외등']]);

describe('buildFeederCircuits', () => {
  it('점유 CB + 빈 위치를 1..N 으로 채운다 (N = max(점유최대+2, 6))', () => {
    const cs = buildFeederCircuits({ id: FEEDER }, [cb1, cb4], nameById);
    expect(cs).toHaveLength(6); // max(4+2, 6)
    expect(cs.map((c) => c.cbNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('점유 CB 는 부하/용량/개폐/규격을 담는다', () => {
    const cs = buildFeederCircuits({ id: FEEDER }, [cb1, cb4], nameById);
    const c1 = cs.find((c) => c.cbNumber === 1)!;
    expect(c1.occupied).toBe(true);
    expect(c1.cableId).toBe('c1');
    expect(c1.loadAssetId).toBe('eqpA');
    expect(c1.loadName).toBe('복도등');
    expect(c1.capacity).toBe('20A');
    expect(c1.switchState).toBe('ON');
    expect(c1.spec).toBe('HIV 2.5sq');
    expect(c1.categoryId).toBe('cat1');
  });
  it('빈 위치는 occupied=false, 필드 비움', () => {
    const cs = buildFeederCircuits({ id: FEEDER }, [cb1, cb4], nameById);
    const c2 = cs.find((c) => c.cbNumber === 2)!;
    expect(c2.occupied).toBe(false);
    expect(c2.cableId).toBeNull();
    expect(c2.loadAssetId).toBeNull();
    expect(c2.capacity).toBe('');
    expect(c2.switchState).toBe('');
  });
  it('점유 최대가 크면 그 + 2 까지', () => {
    const cb10 = { ...cb1, id: 'c10', number: 10 };
    const cs = buildFeederCircuits({ id: FEEDER }, [cb10], nameById);
    expect(cs).toHaveLength(12); // max(10+2, 6)
  });
  it('CB 없으면 빈 6칸', () => {
    const cs = buildFeederCircuits({ id: FEEDER }, [], nameById);
    expect(cs).toHaveLength(6);
    expect(cs.every((c) => !c.occupied)).toBe(true);
  });
});

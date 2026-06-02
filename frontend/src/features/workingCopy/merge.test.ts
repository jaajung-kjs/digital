import { describe, it, expect } from 'vitest';
import { mergeFiberPaths, mergeCables } from './merge';
import type { FiberPathDetail } from '../fiber/types';
import type { LocalCable } from '../editor/stores/editorStore';
import type { OfdDirectoryEntry } from '../fiber/hooks/useOfdDirectory';

const emptyDir = new Map<string, OfdDirectoryEntry>();

describe('mergeFiberPaths', () => {
  const savedA: FiberPathDetail = { id: 'fp-saved-A' } as FiberPathDetail;
  const savedB: FiberPathDetail = { id: 'fp-saved-B' } as FiberPathDetail;

  it('빈 overlay 면 saved 그대로 반환', () => {
    expect(
      mergeFiberPaths([savedA, savedB], { deletedFiberPathIds: [], pendingFiberPaths: [] }, emptyDir),
    ).toEqual([savedA, savedB]);
  });

  it('deleted 에 있는 saved 는 제외된다', () => {
    expect(
      mergeFiberPaths([savedA, savedB], { deletedFiberPathIds: ['fp-saved-A'], pendingFiberPaths: [] }, emptyDir),
    ).toEqual([savedB]);
  });

  it('pending 은 saved 뒤에 추가된다', () => {
    const pending = { id: 'fp-pending-X', ofdAId: 'a', ofdBId: 'b', portCount: 24 };
    const result = mergeFiberPaths(
      [savedA],
      { deletedFiberPathIds: [], pendingFiberPaths: [pending] },
      emptyDir,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(savedA);
    expect(result[1].id).toBe('fp-pending-X');
  });

  it('deleted + pending 동시 적용', () => {
    const pending = { id: 'fp-pending-X', ofdAId: 'a', ofdBId: 'b', portCount: 24 };
    const result = mergeFiberPaths(
      [savedA, savedB],
      { deletedFiberPathIds: ['fp-saved-A'], pendingFiberPaths: [pending] },
      emptyDir,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(savedB);
    expect(result[1].id).toBe('fp-pending-X');
  });
});

describe('mergeCables', () => {
  const savedA = { id: 'cb-saved-A' } as LocalCable;
  const savedB = { id: 'cb-saved-B' } as LocalCable;
  const pendingX = { id: 'cb-pending-X' } as LocalCable;

  it('빈 overlay 면 saved 그대로', () => {
    expect(
      mergeCables([savedA, savedB], { deletedCableIds: [], localCables: [] }),
    ).toEqual([savedA, savedB]);
  });

  it('deletedCableIds 에 있는 saved 는 제외', () => {
    expect(
      mergeCables([savedA, savedB], { deletedCableIds: ['cb-saved-A'], localCables: [] }),
    ).toEqual([savedB]);
  });

  it('localCables 중 saved 에 없는 것(=tempId pending) 만 뒤에 추가', () => {
    const result = mergeCables(
      [savedA],
      { deletedCableIds: [], localCables: [savedA, pendingX] },
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(savedA);
    expect(result[1]).toBe(pendingX);
  });

  it('deleted 된 saved 가 localCables 에도 있으면 결과에 재포함된다 — upstream 동작 회귀 방지', () => {
    const result = mergeCables(
      [savedA, savedB],
      { deletedCableIds: ['cb-saved-A'], localCables: [savedA, pendingX] },
    );
    // savedA 는 deleted 로 제외. localCables[0]=savedA 는 savedB filter 후 savedIds 에 없어 추가됨 — 회귀 방지 확인.
    expect(result.map((c) => c.id)).toEqual(['cb-saved-B', 'cb-saved-A', 'cb-pending-X']);
  });
});

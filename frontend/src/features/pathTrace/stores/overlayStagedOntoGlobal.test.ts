import { describe, it, expect } from 'vitest';
import { overlayStagedOntoGlobal } from './pathHighlightStore';
import type { LocalCable } from '../../editor/stores/editorStore';

function cable(id: string, extra: Partial<LocalCable> = {}): LocalCable {
  return {
    id,
    sourceAssetId: `${id}-src`,
    targetAssetId: `${id}-tgt`,
    sourceModuleId: null,
    targetModuleId: null,
    sourceCircuitId: null,
    targetCircuitId: null,
    cableType: 'FIBER',
    categoryId: null,
    categoryCode: null,
    categoryName: null,
    displayColor: null,
    label: null,
    pathPoints: null,
    pathLength: null,
    bufferLength: undefined,
    totalLength: null,
    ...extra,
  };
}

describe('overlayStagedOntoGlobal', () => {
  it('keeps other-substation global cables untouched', () => {
    const global = [cable('remote-1'), cable('remote-2')];
    const merged = overlayStagedOntoGlobal(global, [], []);
    expect(merged.map((c) => c.id).sort()).toEqual(['remote-1', 'remote-2']);
  });

  it('replaces a saved cable with its staged (edited) version', () => {
    const global = [cable('c1', { label: 'old' }), cable('remote')];
    const staged = [cable('c1', { label: 'new' })];
    const merged = overlayStagedOntoGlobal(global, staged, []);
    expect(merged.find((c) => c.id === 'c1')?.label).toBe('new');
    // remote untouched
    expect(merged.find((c) => c.id === 'remote')?.label).toBeNull();
  });

  it('adds staged-created (temp id) cables not present in global', () => {
    const global = [cable('remote')];
    const staged = [cable('temp-new')];
    const merged = overlayStagedOntoGlobal(global, staged, []);
    expect(merged.map((c) => c.id).sort()).toEqual(['remote', 'temp-new']);
  });

  it('drops cables listed in deletes even if they exist globally', () => {
    const global = [cable('c1'), cable('remote')];
    const merged = overlayStagedOntoGlobal(global, [], ['c1']);
    expect(merged.map((c) => c.id)).toEqual(['remote']);
  });

  it('does not re-add a deleted cable that also appears in staged', () => {
    const global = [cable('c1'), cable('remote')];
    // staged still has c1 (effective wouldn't, but guard anyway)
    const merged = overlayStagedOntoGlobal(global, [cable('c1')], ['c1']);
    expect(merged.map((c) => c.id)).toEqual(['remote']);
  });

  it('a just-drawn staged cable (temp seed) is resolvable in the merged list', () => {
    const global: LocalCable[] = [cable('remote')];
    const staged = [cable('temp-seed', { number: 3 })];
    const merged = overlayStagedOntoGlobal(global, staged, []);
    const seed = merged.find((c) => c.id === 'temp-seed');
    expect(seed).toBeDefined();
    expect(seed?.number).toBe(3);
  });
});

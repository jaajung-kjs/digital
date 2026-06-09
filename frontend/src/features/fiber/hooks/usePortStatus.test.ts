import { describe, it, expect } from 'vitest';
import { overlayEffectiveCables, type EffectiveCable } from './usePortStatus';
import type { FiberPathDetail } from '../types';

function makePath(): FiberPathDetail {
  return {
    id: 'path-1',
    ofdA: { id: 'ofd-a', name: 'OFD A', substationName: 'SS1', floorId: 'f1' },
    ofdB: { id: 'ofd-b', name: 'OFD B', substationName: 'SS2', floorId: 'f2' },
    portCount: 2,
    description: null,
    ports: [
      { portNumber: 1, sideA: null, sideB: null },
      { portNumber: 2, sideA: null, sideB: null },
    ],
    createdAt: '',
    updatedAt: '',
  };
}

const names = new Map<string, string>([
  ['eq-x', 'Switch X'],
  ['mod-y', 'Rack Module Y'],
]);
const resolveName = (id: string): string => names.get(id) ?? '?';

describe('overlayEffectiveCables — both sides fill', () => {
  it('fills sideA from the ofdA cable and sideB from the ofdB cable regardless of viewing OFD', () => {
    // Cable touching ofdA at its source; remote = target (equipment eq-x).
    const cableA: EffectiveCable = {
      id: 'cable-a',
      cableType: 'FIBER',
      fiberPathId: 'path-1',
      fiberPortNumber: 1,
      source: { equipmentId: 'ofd-a' },
      target: { equipmentId: 'eq-x' },
    };
    // Cable touching ofdB at its target; remote = source (rack module mod-y).
    const cableB: EffectiveCable = {
      id: 'cable-b',
      cableType: 'FIBER',
      fiberPathId: 'path-1',
      fiberPortNumber: 1,
      source: { moduleId: 'mod-y' },
      target: { equipmentId: 'ofd-b' },
    };

    const [path] = overlayEffectiveCables([makePath()], [cableA, cableB], resolveName);
    const port1 = path.ports.find((p) => p.portNumber === 1)!;

    // Both sides filled — the bug previously left the remote side null.
    expect(port1.sideA).toEqual({ cableId: 'cable-a', equipmentId: 'eq-x', equipmentName: 'Switch X' });
    expect(port1.sideB).toEqual({ cableId: 'cable-b', equipmentId: 'mod-y', equipmentName: 'Rack Module Y' });

    // Untouched port stays empty.
    const port2 = path.ports.find((p) => p.portNumber === 2)!;
    expect(port2.sideA).toBeNull();
    expect(port2.sideB).toBeNull();
  });

  it('resolves polymorphic moduleId endpoints and falls back to "?" for unknown names', () => {
    const cable: EffectiveCable = {
      id: 'cable-z',
      cableType: 'FIBER',
      fiberPathId: 'path-1',
      fiberPortNumber: 1,
      source: { equipmentId: 'ofd-b' },
      target: { moduleId: 'mod-unknown' },
    };
    const [path] = overlayEffectiveCables([makePath()], [cable], resolveName);
    const port1 = path.ports.find((p) => p.portNumber === 1)!;
    expect(port1.sideB).toEqual({ cableId: 'cable-z', equipmentId: 'mod-unknown', equipmentName: '?' });
    expect(port1.sideA).toBeNull();
  });

  it('ignores non-fiber cables and cables without a path/port assignment', () => {
    const cables: EffectiveCable[] = [
      { id: 'c1', cableType: 'COPPER', fiberPathId: 'path-1', fiberPortNumber: 1, source: { equipmentId: 'ofd-a' }, target: { equipmentId: 'eq-x' } },
      { id: 'c2', cableType: 'FIBER', fiberPathId: null, fiberPortNumber: 1, source: { equipmentId: 'ofd-a' }, target: { equipmentId: 'eq-x' } },
      { id: 'c3', cableType: 'FIBER', fiberPathId: 'path-1', fiberPortNumber: null, source: { equipmentId: 'ofd-a' }, target: { equipmentId: 'eq-x' } },
    ];
    const [path] = overlayEffectiveCables([makePath()], cables, resolveName);
    expect(path.ports.every((p) => p.sideA === null && p.sideB === null)).toBe(true);
  });
});

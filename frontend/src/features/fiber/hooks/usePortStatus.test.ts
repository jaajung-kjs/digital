import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { overlayLocalStagedCables, usePortStatus, type EffectiveCable } from './usePortStatus';
import type { FiberPathDetail } from '../types';

// ── mock the backend hook + effective hooks so usePortStatus is hermetic ──
const mockUseFiberPaths = vi.fn();
const mockUseEffectiveFiberPaths = vi.fn();
const mockUseEffectiveCables = vi.fn();
const mockUseEffectiveAssets = vi.fn();
const mockUseOfdDirectory = vi.fn();

vi.mock('./useFiberPaths', () => ({
  useFiberPaths: (ofdId: string) => mockUseFiberPaths(ofdId),
}));
vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveFiberPaths: () => mockUseEffectiveFiberPaths(),
  useEffectiveCables: () => mockUseEffectiveCables(),
  useEffectiveAssets: () => mockUseEffectiveAssets(),
}));
vi.mock('./useOfdDirectory', () => ({
  useOfdDirectory: () => mockUseOfdDirectory(),
}));

function makePort(portNumber: number, sideA: FiberPathDetail['ports'][0]['sideA'] = null, sideB: FiberPathDetail['ports'][0]['sideB'] = null) {
  return { portNumber, sideA, sideB };
}

function makePath(over: Partial<FiberPathDetail> = {}): FiberPathDetail {
  return {
    id: 'path-1',
    ofdA: { id: 'ofd-a', name: 'OFD A', substationName: 'SS1', floorId: 'f1' },
    ofdB: { id: 'ofd-b', name: 'OFD B', substationName: 'SS2', floorId: 'f2' },
    portCount: 2,
    description: null,
    ports: [makePort(1), makePort(2)],
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

const names = new Map<string, string>([
  ['eq-x', 'Switch X'],
  ['mod-y', 'Rack Module Y'],
]);
const resolveName = (id: string): string => names.get(id) ?? '?';

// ── pure overlay: only the LOCAL side (viewed OFD) is recomputed from effective ──
describe('overlayLocalStagedCables — local side only', () => {
  it('fills the local side (ofd-a → sideA) and LEAVES the remote (backend) side intact', () => {
    // backend already computed sideB (remote, cross-substation).
    const path = makePath({
      ports: [
        makePort(1, null, { cableId: 'remote-cable', assetId: 'remote-eq', assetName: 'Remote Switch' }),
        makePort(2),
      ],
    });
    // staged local cable touching ofd-a, remote end = eq-x.
    const cable: EffectiveCable = {
      id: 'cable-a', cableType: 'FIBER', fiberPathId: 'path-1', fiberPortNumber: 1,
      sourceAssetId: 'ofd-a', targetAssetId: 'eq-x',
    };

    const [out] = overlayLocalStagedCables([path], [cable], resolveName, 'ofd-a');
    const port1 = out.ports.find((p) => p.portNumber === 1)!;

    // local side (A) overlaid from the staged cable.
    expect(port1.sideA).toEqual({ cableId: 'cable-a', assetId: 'eq-x', assetName: 'Switch X' });
    // remote side (B) untouched — stays from backend.
    expect(port1.sideB).toEqual({ cableId: 'remote-cable', assetId: 'remote-eq', assetName: 'Remote Switch' });
  });

  it('maps local side to sideB when the viewed OFD is ofdB', () => {
    const path = makePath();
    const cable: EffectiveCable = {
      id: 'cable-b', cableType: 'FIBER', fiberPathId: 'path-1', fiberPortNumber: 1,
      sourceAssetId: 'mod-y', targetAssetId: 'ofd-b',
    };
    const [out] = overlayLocalStagedCables([path], [cable], resolveName, 'ofd-b');
    const port1 = out.ports.find((p) => p.portNumber === 1)!;
    expect(out.ports[0].portNumber).toBe(1);
    expect(port1.sideB).toEqual({ cableId: 'cable-b', assetId: 'mod-y', assetName: 'Rack Module Y' });
  });

  it('clears the local side when no effective cable matches (staged deletion)', () => {
    // backend had sideA filled, but the local cable was staged-deleted (not in effective).
    const path = makePath({
      ports: [makePort(1, { cableId: 'gone', assetId: 'eq-x', assetName: 'Switch X' }, null)],
      portCount: 1,
    });
    const [out] = overlayLocalStagedCables([path], [], resolveName, 'ofd-a');
    expect(out.ports[0].sideA).toBeNull();
  });

  it('ignores non-fiber cables and cables without a path/port assignment', () => {
    const cables: EffectiveCable[] = [
      { id: 'c1', cableType: 'COPPER', fiberPathId: 'path-1', fiberPortNumber: 1, sourceAssetId: 'ofd-a', targetAssetId: 'eq-x' },
      { id: 'c2', cableType: 'FIBER', fiberPathId: null, fiberPortNumber: 1, sourceAssetId: 'ofd-a', targetAssetId: 'eq-x' },
      { id: 'c3', cableType: 'FIBER', fiberPathId: 'path-1', fiberPortNumber: null, sourceAssetId: 'ofd-a', targetAssetId: 'eq-x' },
    ];
    const [out] = overlayLocalStagedCables([makePath()], cables, resolveName, 'ofd-a');
    expect(out.ports.every((p) => p.sideA === null)).toBe(true);
  });
});

// ── hybrid hook: backend base + staged path add/delete + local cable overlay ──
describe('usePortStatus — hybrid (backend base + this-substation staged overlay)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEffectiveAssets.mockReturnValue([{ id: 'eq-x', name: 'Switch X' }]);
    mockUseOfdDirectory.mockReturnValue(
      new Map([
        ['ofd-a', { id: 'ofd-a', name: 'OFD A', substationName: 'SS1', floorId: 'f1' }],
        ['ofd-c', { id: 'ofd-c', name: 'OFD C', substationName: 'SS3', floorId: 'f3' }],
      ]),
    );
    mockUseEffectiveCables.mockReturnValue([]);
  });

  it('(a) passes backend ports through (both sides) when nothing is staged', () => {
    const backendPath = makePath({
      ports: [makePort(1,
        { cableId: 'ca', assetId: 'eq-x', assetName: 'Switch X' },
        { cableId: 'cb', assetId: 'remote', assetName: 'Remote' },
      ), makePort(2)],
    });
    mockUseFiberPaths.mockReturnValue({ data: [backendPath], isLoading: false });
    // effective has the saved path (so it isn't dropped as a deletion).
    mockUseEffectiveFiberPaths.mockReturnValue([
      { id: 'path-1', ofdAId: 'ofd-a', ofdBId: 'ofd-b', portCount: 2 },
    ]);

    const { result } = renderHook(() => usePortStatus('ofd-a'));
    expect(result.current.mergedPaths).toHaveLength(1);
    const port1 = result.current.mergedPaths[0].ports.find((p) => p.portNumber === 1)!;
    // remote (B) still from backend.
    expect(port1.sideB).toEqual({ cableId: 'cb', assetId: 'remote', assetName: 'Remote' });
    // local (A) recomputed from effective — no staged cable → cleared.
    expect(port1.sideA).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('(b) overlays a staged local cable onto the local side, remote stays from backend', () => {
    const backendPath = makePath({
      ports: [makePort(1, null,
        { cableId: 'cb', assetId: 'remote', assetName: 'Remote' }), makePort(2)],
    });
    mockUseFiberPaths.mockReturnValue({ data: [backendPath], isLoading: false });
    mockUseEffectiveFiberPaths.mockReturnValue([
      { id: 'path-1', ofdAId: 'ofd-a', ofdBId: 'ofd-b', portCount: 2 },
    ]);
    mockUseEffectiveCables.mockReturnValue([
      { id: 'cable-a', cableType: 'FIBER', fiberPathId: 'path-1', fiberPortNumber: 1, sourceAssetId: 'ofd-a', targetAssetId: 'eq-x' },
    ]);

    const { result } = renderHook(() => usePortStatus('ofd-a'));
    const port1 = result.current.mergedPaths[0].ports.find((p) => p.portNumber === 1)!;
    expect(port1.sideA).toEqual({ cableId: 'cable-a', assetId: 'eq-x', assetName: 'Switch X' });
    expect(port1.sideB).toEqual({ cableId: 'cb', assetId: 'remote', assetName: 'Remote' });
  });

  it('(c) drops a staged-deleted path (in backend, no longer in effective)', () => {
    mockUseFiberPaths.mockReturnValue({ data: [makePath()], isLoading: false });
    mockUseEffectiveFiberPaths.mockReturnValue([]); // path-1 staged-deleted.

    const { result } = renderHook(() => usePortStatus('ofd-a'));
    expect(result.current.mergedPaths).toHaveLength(0);
  });

  it('(d) adds a staged-new path (in effective, not in backend)', () => {
    mockUseFiberPaths.mockReturnValue({ data: [], isLoading: false });
    mockUseEffectiveFiberPaths.mockReturnValue([
      { id: 'temp-new', ofdAId: 'ofd-a', ofdBId: 'ofd-c', portCount: 24 },
    ]);

    const { result } = renderHook(() => usePortStatus('ofd-a'));
    expect(result.current.mergedPaths).toHaveLength(1);
    expect(result.current.mergedPaths[0].id).toBe('temp-new');
    // brand-new path: both sides empty until a cable is drawn.
    expect(result.current.mergedPaths[0].ports.every((p) => p.sideA === null && p.sideB === null)).toBe(true);
  });

  it('reflects backend loading state', () => {
    mockUseFiberPaths.mockReturnValue({ data: undefined, isLoading: true });
    mockUseEffectiveFiberPaths.mockReturnValue([]);
    const { result } = renderHook(() => usePortStatus('ofd-a'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.mergedPaths).toHaveLength(0);
  });
});

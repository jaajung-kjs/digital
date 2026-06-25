import { describe, it, expect, beforeEach } from 'vitest';
import { useInteractionStore, getCableDrawing } from './interactionStore';
import type { EndpointRef } from '../cableEndpoint';
const ep = (over: Partial<EndpointRef> = {}): EndpointRef => ({ containerAssetId: 'c', position: { x: 1, y: 2 }, ...over });
const cat = { id: 'cat', name: 'X' };
beforeEach(() => useInteractionStore.getState().cancel());
describe('cable FSM — 종류 우선', () => {
  it('cableActivate() → selectingType', () => {
    useInteractionStore.getState().cableActivate();
    expect(getCableDrawing()?.phase).toBe('selectingType');
  });
  it('category 주입 시 → selectingSource', () => {
    useInteractionStore.getState().cableActivate({ category: cat });
    expect(getCableDrawing()?.phase).toBe('selectingSource');
  });
  it('source 주입 후 cableSetType → drawingPath, source 보존', () => {
    useInteractionStore.getState().cableActivate({ source: ep({ role: 'OUT', innerAssetId: 'f1' }) });
    expect(getCableDrawing()?.phase).toBe('selectingType');
    useInteractionStore.getState().cableSetType(cat);
    const d = getCableDrawing()!;
    expect(d.phase).toBe('drawingPath');
    expect(d.source?.innerAssetId).toBe('f1');
    expect(d.source?.role).toBe('OUT');
  });
  it('selectingSource → cableSetSource(ref) → drawingPath', () => {
    useInteractionStore.getState().cableActivate({ category: cat });
    useInteractionStore.getState().cableSetSource(ep({ innerAssetId: 'm1' }));
    expect(getCableDrawing()?.phase).toBe('drawingPath');
  });
  it('drawingPath → cableSetTarget(ref) → ready', () => {
    const s = useInteractionStore.getState();
    s.cableActivate({ category: cat });
    s.cableSetSource(ep({ containerAssetId: 'a' }));
    s.cableSetTarget(ep({ containerAssetId: 'b', role: 'OUT' }));
    const d = getCableDrawing()!;
    expect(d.phase).toBe('ready');
    expect(d.target?.containerAssetId).toBe('b');
  });
});

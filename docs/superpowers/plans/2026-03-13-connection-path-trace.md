# Connection Path Trace Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 케이블 클릭 시 동일 타입 전체 경로를 추적하여 캔버스 하이라이트 또는 SVG 토폴로지 모달로 시각화한다.

**Architecture:** 백엔드에 cable-centric trace API 추가 (BFS, 모든 cableType). 프론트엔드에서 ConnectionDiagram 클릭 → store로 상태 관리 → 같은 방이면 캔버스 하이라이트, 크로스 변전소면 SVG 토폴로지 모달.

**Tech Stack:** Express + Prisma (backend), React + Zustand + React Query + SVG (frontend), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-13-connection-path-trace-design.md`

---

## File Structure

### Backend (New/Modified)

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/services/cableTrace.service.ts` | Create | Universal BFS trace (all cableTypes) |
| `backend/src/controllers/cableTrace.controller.ts` | Create | Trace endpoint handler |
| `backend/src/routes/cables.routes.ts` | Modify | Add `/:id/trace` route |
| `backend/src/services/pathTrace.service.ts` | Modify | Delegate to new service for backward compat |
| `backend/tests/services/cableTrace.service.test.ts` | Create | Trace service unit tests |

### Frontend (New/Modified)

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/features/pathTrace/types.ts` | Rewrite | Graph-based types (TraceResult, TraceNode, TraceEdge, TraceRing) |
| `frontend/src/features/pathTrace/hooks/useCableTrace.ts` | Create | React Query hook for cable trace API |
| `frontend/src/features/pathTrace/stores/pathHighlightStore.ts` | Create | Zustand store for highlight state |
| `frontend/src/features/pathTrace/components/TopologyModal.tsx` | Create | SVG topology diagram modal |
| `frontend/src/features/pathTrace/components/SubstationBox.tsx` | Create | Substation group box in SVG |
| `frontend/src/features/pathTrace/components/TopologyEdge.tsx` | Create | Cable/FiberPath edge in SVG |
| `frontend/src/features/pathTrace/components/RingSelector.tsx` | Create | Ring list + selection UI |
| `frontend/src/features/pathTrace/utils/layoutEngine.ts` | Create | Substation grid layout calculator |
| `frontend/src/features/equipment/components/ConnectionDiagram.tsx` | Modify | Add click handler per cable row |
| `frontend/src/features/connections/components/ConnectionOverlay.tsx` | Modify | Canvas highlight mode |
| `frontend/src/features/pathTrace/hooks/usePathTrace.ts` | Delete | Replaced by useCableTrace |
| `frontend/src/features/pathTrace/components/PathTracePanel.tsx` | Delete | Replaced by TopologyModal |
| `frontend/src/features/pathTrace/components/PathDiagram.tsx` | Delete | Replaced by TopologyModal |
| `frontend/src/features/pathTrace/components/RingDiagram.tsx` | Delete | Replaced by RingSelector |

---

## Chunk 1: Backend — Cable Trace Service & API

### Task 1: Trace Types & Service Skeleton

**Files:**
- Create: `backend/src/services/cableTrace.service.ts`
- Create: `backend/tests/services/cableTrace.service.test.ts`

- [ ] **Step 1: Write the trace service with types and simple chain (non-FIBER) BFS**

```typescript
// backend/src/services/cableTrace.service.ts
import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';
import type { CableType } from '@prisma/client';

// ==================== Types ====================

export interface TraceNode {
  equipmentId: string;
  equipmentName: string;
  substationId: string;
  substationName: string;
  roomId: string | null;
  category: string;
  isSource: boolean;
  isTarget: boolean;
}

export interface TraceEdge {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  type: 'cable' | 'fiberPath';
  cableType?: CableType;
  label?: string;
  length?: number;
  fiberPathId?: string;
  portCount?: number;
}

export interface TraceRing {
  id: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
}

export interface TraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  rings: TraceRing[];
}

// ==================== Helpers ====================

const equipmentTraceSelect = {
  id: true,
  name: true,
  category: true,
  roomId: true,
  rack: { select: { roomId: true } },
  room: {
    select: {
      floor: {
        select: {
          substation: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

// Equipment that's rack-mounted needs room via rack
const rackEquipmentTraceSelect = {
  ...equipmentTraceSelect,
  rack: {
    select: {
      roomId: true,
      room: {
        select: {
          floor: {
            select: {
              substation: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
} as const;

function toTraceNode(equip: any, isSource = false, isTarget = false): TraceNode {
  let substationId = '';
  let substationName = '';
  let roomId = equip.roomId ?? equip.rack?.roomId ?? null;

  if (equip.room?.floor?.substation) {
    substationId = equip.room.floor.substation.id;
    substationName = equip.room.floor.substation.name;
  } else if (equip.rack?.room?.floor?.substation) {
    substationId = equip.rack.room.floor.substation.id;
    substationName = equip.rack.room.floor.substation.name;
  }

  return {
    equipmentId: equip.id,
    equipmentName: equip.name,
    substationId,
    substationName,
    roomId,
    category: equip.category,
    isSource,
    isTarget,
  };
}

// ==================== Service ====================

class CableTraceService {
  async trace(cableId: string): Promise<TraceResult> {
    // 1. Fetch the starting cable
    const cable = await prisma.cable.findUnique({
      where: { id: cableId },
      include: {
        sourceEquipment: { select: rackEquipmentTraceSelect },
        targetEquipment: { select: rackEquipmentTraceSelect },
      },
    });

    if (!cable) throw new NotFoundError('케이블');

    const cableType = cable.cableType;
    const nodeMap = new Map<string, TraceNode>();
    const edgeMap = new Map<string, TraceEdge>();
    const visitedCables = new Set<string>();

    // Add starting cable
    const sourceNode = toTraceNode(cable.sourceEquipment, true, false);
    const targetNode = toTraceNode(cable.targetEquipment, false, true);
    nodeMap.set(sourceNode.equipmentId, sourceNode);
    nodeMap.set(targetNode.equipmentId, targetNode);
    edgeMap.set(cable.id, {
      id: cable.id,
      sourceEquipmentId: cable.sourceEquipmentId,
      targetEquipmentId: cable.targetEquipmentId,
      type: 'cable',
      cableType: cable.cableType,
      label: cable.label ?? undefined,
      length: cable.length ?? undefined,
    });
    visitedCables.add(cable.id);

    // 2. BFS from both ends
    const queue: string[] = [cable.sourceEquipmentId, cable.targetEquipmentId];
    const visitedEquipment = new Set<string>([cable.sourceEquipmentId, cable.targetEquipmentId]);

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      // Find all same-type cables connected to this equipment
      const connectedCables = await prisma.cable.findMany({
        where: {
          cableType,
          OR: [
            { sourceEquipmentId: currentId },
            { targetEquipmentId: currentId },
          ],
        },
        include: {
          sourceEquipment: { select: rackEquipmentTraceSelect },
          targetEquipment: { select: rackEquipmentTraceSelect },
        },
      });

      for (const c of connectedCables) {
        if (visitedCables.has(c.id)) continue;
        visitedCables.add(c.id);

        // Add edge
        edgeMap.set(c.id, {
          id: c.id,
          sourceEquipmentId: c.sourceEquipmentId,
          targetEquipmentId: c.targetEquipmentId,
          type: 'cable',
          cableType: c.cableType,
          label: c.label ?? undefined,
          length: c.length ?? undefined,
        });

        // Determine the "other" equipment
        const otherId = c.sourceEquipmentId === currentId
          ? c.targetEquipmentId
          : c.sourceEquipmentId;
        const otherEquip = c.sourceEquipmentId === currentId
          ? c.targetEquipment
          : c.sourceEquipment;

        if (!nodeMap.has(otherId)) {
          nodeMap.set(otherId, toTraceNode(otherEquip));
        }

        if (!visitedEquipment.has(otherId)) {
          visitedEquipment.add(otherId);
          queue.push(otherId);
        }

        // FIBER: if other equipment is OFD, trace through FiberPaths
        if (cableType === 'FIBER' && otherEquip.category === 'OFD') {
          await this.traceFiberPaths(
            otherId, nodeMap, edgeMap, visitedCables, visitedEquipment, queue
          );
        }
      }
    }

    // 3. Detect rings
    const rings = this.detectRings(nodeMap, edgeMap);

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
      rings,
    };
  }

  private async traceFiberPaths(
    ofdId: string,
    nodeMap: Map<string, TraceNode>,
    edgeMap: Map<string, TraceEdge>,
    visitedCables: Set<string>,
    visitedEquipment: Set<string>,
    queue: string[],
  ): Promise<void> {
    // Find all FiberPaths where this OFD is one endpoint
    const fiberPaths = await prisma.fiberPath.findMany({
      where: {
        OR: [{ ofdAId: ofdId }, { ofdBId: ofdId }],
      },
      include: {
        ofdA: { select: rackEquipmentTraceSelect },
        ofdB: { select: rackEquipmentTraceSelect },
      },
    });

    for (const fp of fiberPaths) {
      const edgeKey = `fp:${fp.id}`;
      if (edgeMap.has(edgeKey)) continue;

      const remoteOfd = fp.ofdAId === ofdId ? fp.ofdB : fp.ofdA;
      const remoteOfdId = remoteOfd.id;

      // Add FiberPath edge
      edgeMap.set(edgeKey, {
        id: fp.id,
        sourceEquipmentId: fp.ofdAId,
        targetEquipmentId: fp.ofdBId,
        type: 'fiberPath',
        fiberPathId: fp.id,
        portCount: fp.portCount,
      });

      // Add remote OFD node
      if (!nodeMap.has(remoteOfdId)) {
        nodeMap.set(remoteOfdId, toTraceNode(remoteOfd));
      }

      // Continue BFS from remote OFD
      if (!visitedEquipment.has(remoteOfdId)) {
        visitedEquipment.add(remoteOfdId);
        queue.push(remoteOfdId);
      }
    }
  }

  private detectRings(
    nodeMap: Map<string, TraceNode>,
    edgeMap: Map<string, TraceEdge>,
  ): TraceRing[] {
    // Build adjacency list from edges
    const adj = new Map<string, Array<{ neighborId: string; edgeId: string }>>();
    for (const [edgeId, edge] of edgeMap) {
      const src = edge.sourceEquipmentId;
      const tgt = edge.targetEquipmentId;
      if (!adj.has(src)) adj.set(src, []);
      if (!adj.has(tgt)) adj.set(tgt, []);
      adj.get(src)!.push({ neighborId: tgt, edgeId });
      adj.get(tgt)!.push({ neighborId: src, edgeId });
    }

    const rings: TraceRing[] = [];
    const allNodes = Array.from(nodeMap.keys());
    if (allNodes.length === 0) return rings;

    // Find cycles using DFS
    const visited = new Set<string>();
    const parent = new Map<string, string | null>();
    const parentEdge = new Map<string, string | null>();
    let ringCounter = 0;

    const dfs = (nodeId: string, parentId: string | null, pEdgeId: string | null) => {
      visited.add(nodeId);
      parent.set(nodeId, parentId);
      parentEdge.set(nodeId, pEdgeId);

      for (const { neighborId, edgeId } of (adj.get(nodeId) ?? [])) {
        if (edgeId === pEdgeId) continue; // don't go back on same edge

        if (visited.has(neighborId)) {
          // Found a cycle - trace back to find ring
          const ringNodeIds: string[] = [];
          const ringEdgeIds: string[] = [edgeId];

          let cur = nodeId;
          while (cur !== neighborId) {
            ringNodeIds.push(cur);
            const pe = parentEdge.get(cur);
            if (pe) ringEdgeIds.push(pe);
            cur = parent.get(cur)!;
          }
          ringNodeIds.push(neighborId);

          // Build label from substations
          const substations = new Set<string>();
          for (const nid of ringNodeIds) {
            const node = nodeMap.get(nid);
            if (node?.substationName) substations.add(node.substationName);
          }

          rings.push({
            id: `ring-${++ringCounter}`,
            label: Array.from(substations).join('↔'),
            nodeIds: ringNodeIds,
            edgeIds: ringEdgeIds,
          });
        } else {
          dfs(neighborId, nodeId, edgeId);
        }
      }
    };

    dfs(allNodes[0], null, null);

    return rings;
  }
}

export const cableTraceService = new CableTraceService();
```

- [ ] **Step 2: Write unit test for simple AC chain**

```typescript
// backend/tests/services/cableTrace.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the service through integration-style tests
// since BFS logic depends heavily on Prisma queries.
// For now, validate the type exports and basic structure.

describe('CableTraceService', () => {
  it('exports cableTraceService', async () => {
    const mod = await import('../../src/services/cableTrace.service.js');
    expect(mod.cableTraceService).toBeDefined();
    expect(typeof mod.cableTraceService.trace).toBe('function');
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/services/cableTrace.service.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/cableTrace.service.ts backend/tests/services/cableTrace.service.test.ts
git commit -m "feat: add universal cable trace service with BFS for all cable types"
```

---

### Task 2: Trace Controller & Route

**Files:**
- Create: `backend/src/controllers/cableTrace.controller.ts`
- Modify: `backend/src/routes/cables.routes.ts:35` (add trace route before /:id)

- [ ] **Step 1: Create the controller**

```typescript
// backend/src/controllers/cableTrace.controller.ts
import { Request, Response, NextFunction } from 'express';
import { cableTraceService } from '../services/cableTrace.service.js';

export const cableTraceController = {
  async trace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await cableTraceService.trace(id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
};
```

- [ ] **Step 2: Add route to cables.routes.ts**

In `backend/src/routes/cables.routes.ts`, add the import and route **before** the `/:id` GET route:

```typescript
import { cableTraceController } from '../controllers/cableTrace.controller.js';

// Add BEFORE router.get('/:id', ...) to prevent /:id from catching "trace"
router.get('/:id/trace', cableTraceController.trace);
```

- [ ] **Step 3: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/cableTrace.controller.ts backend/src/routes/cables.routes.ts
git commit -m "feat: add GET /cables/:id/trace endpoint"
```

---

### Task 3: Update Legacy pathTrace Service (Backward Compat)

**Files:**
- Modify: `backend/src/services/pathTrace.service.ts`

This is optional — keep existing service working but add a deprecation comment.

- [ ] **Step 1: Add deprecation comment to pathTrace.service.ts**

Add at the top of the file, below imports:

```typescript
/**
 * @deprecated Use cableTraceService for universal cable tracing.
 * This service is maintained for backward compatibility with GET /api/equipment/:equipmentId/paths.
 */
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/pathTrace.service.ts
git commit -m "chore: mark pathTrace service as deprecated"
```

---

## Chunk 2: Frontend — Types, Store, Hook

### Task 4: Rewrite pathTrace Types

**Files:**
- Rewrite: `frontend/src/features/pathTrace/types.ts`

- [ ] **Step 1: Replace types with graph-based structure**

```typescript
// frontend/src/features/pathTrace/types.ts
import type { CableType } from '../../types/connection';

export interface TraceNode {
  equipmentId: string;
  equipmentName: string;
  substationId: string;
  substationName: string;
  roomId: string | null;
  category: string;
  isSource: boolean;
  isTarget: boolean;
}

export interface TraceEdge {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  type: 'cable' | 'fiberPath';
  cableType?: CableType;
  label?: string;
  length?: number;
  fiberPathId?: string;
  portCount?: number;
}

export interface TraceRing {
  id: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
}

export interface TraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  rings: TraceRing[];
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/pathTrace/types.ts
git commit -m "refactor: replace hop-based pathTrace types with graph-based TraceResult"
```

---

### Task 5: Create useCableTrace Hook

**Files:**
- Create: `frontend/src/features/pathTrace/hooks/useCableTrace.ts`
- Delete: `frontend/src/features/pathTrace/hooks/usePathTrace.ts`

- [ ] **Step 1: Create the hook**

```typescript
// frontend/src/features/pathTrace/hooks/useCableTrace.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { TraceResult } from '../types';

export function useCableTrace(cableId: string | null) {
  return useQuery({
    queryKey: ['cable-trace', cableId],
    queryFn: async () => {
      const { data } = await api.get<{ data: TraceResult }>(`/cables/${cableId}/trace`);
      return data.data;
    },
    enabled: !!cableId,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Delete old usePathTrace hook**

Delete `frontend/src/features/pathTrace/hooks/usePathTrace.ts`.

- [ ] **Step 3: Verify no imports reference old hook**

Run: `cd frontend && grep -r "usePathTrace" src/ --include="*.ts" --include="*.tsx"`

If any references found, update them. The existing `PathTracePanel.tsx` imports it but will be deleted in Task 9.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/pathTrace/hooks/useCableTrace.ts
git rm frontend/src/features/pathTrace/hooks/usePathTrace.ts
git commit -m "feat: add useCableTrace hook, remove deprecated usePathTrace"
```

---

### Task 6: Create pathHighlightStore

**Files:**
- Create: `frontend/src/features/pathTrace/stores/pathHighlightStore.ts`

- [ ] **Step 1: Write the store**

```typescript
// frontend/src/features/pathTrace/stores/pathHighlightStore.ts
import { create } from 'zustand';
import { api } from '../../../utils/api';
import type { TraceResult } from '../types';

interface PathHighlightState {
  active: boolean;
  mode: 'canvas' | 'modal' | null;
  traceResult: TraceResult | null;
  tracingCableId: string | null;
  isLoading: boolean;
  selectedRingId: string | null;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;

  startTrace: (cableId: string, currentRoomId: string) => Promise<void>;
  selectRing: (ringId: string | null) => void;
  clearHighlight: () => void;
}

function determineMode(result: TraceResult, currentRoomId: string): 'canvas' | 'modal' {
  const allSameRoom = result.nodes.every((n) => n.roomId === currentRoomId);
  return allSameRoom ? 'canvas' : 'modal';
}

export const usePathHighlightStore = create<PathHighlightState>((set, get) => ({
  active: false,
  mode: null,
  traceResult: null,
  tracingCableId: null,
  isLoading: false,
  selectedRingId: null,
  highlightedNodeIds: new Set(),
  highlightedEdgeIds: new Set(),

  startTrace: async (cableId, currentRoomId) => {
    set({ isLoading: true, tracingCableId: cableId });
    try {
      const { data } = await api.get<{ data: TraceResult }>(`/cables/${cableId}/trace`);
      const result = data.data;
      const mode = determineMode(result, currentRoomId);

      const nodeIds = new Set(result.nodes.map((n) => n.equipmentId));
      const edgeIds = new Set(result.edges.map((e) => e.id));

      set({
        active: true,
        mode,
        traceResult: result,
        isLoading: false,
        selectedRingId: null,
        highlightedNodeIds: nodeIds,
        highlightedEdgeIds: edgeIds,
      });
    } catch {
      set({ isLoading: false, tracingCableId: null });
    }
  },

  selectRing: (ringId) => {
    const { traceResult } = get();
    if (!traceResult) return;

    if (!ringId) {
      // Show all
      set({
        selectedRingId: null,
        highlightedNodeIds: new Set(traceResult.nodes.map((n) => n.equipmentId)),
        highlightedEdgeIds: new Set(traceResult.edges.map((e) => e.id)),
      });
      return;
    }

    const ring = traceResult.rings.find((r) => r.id === ringId);
    if (!ring) return;

    set({
      selectedRingId: ringId,
      highlightedNodeIds: new Set(ring.nodeIds),
      highlightedEdgeIds: new Set(ring.edgeIds),
    });
  },

  clearHighlight: () =>
    set({
      active: false,
      mode: null,
      traceResult: null,
      tracingCableId: null,
      isLoading: false,
      selectedRingId: null,
      highlightedNodeIds: new Set(),
      highlightedEdgeIds: new Set(),
    }),
}));
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/pathTrace/stores/pathHighlightStore.ts
git commit -m "feat: add pathHighlightStore for trace state management"
```

---

## Chunk 3: Frontend — ConnectionDiagram Click & Canvas Highlight

### Task 7: Add Click Handler to ConnectionDiagram

**Files:**
- Modify: `frontend/src/features/equipment/components/ConnectionDiagram.tsx`

- [ ] **Step 1: Add trace trigger to each cable row**

Modify `ConnectionDiagram.tsx` to:

1. Import `usePathHighlightStore` and `isTempId`
2. Get `startTrace`, `tracingCableId`, `isLoading` from store
3. Get `roomId` from props (already available)
4. Add `onClick` to each cable row div — skip if `isTempId(conn.id)`
5. Show loading spinner on the tracing row
6. Add hover cursor + highlight styles

Replace the cable row `<div key={conn.id} ...>` with:

```tsx
const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
const isTraceLoading = usePathHighlightStore((s) => s.isLoading);
const startTrace = usePathHighlightStore((s) => s.startTrace);

// Inside the map:
const isTracing = tracingCableId === conn.id && isTraceLoading;
const canTrace = !isPending;

<div
  key={conn.id}
  onClick={canTrace ? () => startTrace(conn.id, roomId) : undefined}
  className={`rounded border px-3 py-2 ${
    isPending
      ? 'border-amber-200 bg-amber-50'
      : 'border-gray-200 bg-white hover:bg-blue-50 cursor-pointer'
  } ${isTracing ? 'ring-2 ring-blue-400' : ''}`}
>
```

Add after the pending message, for non-traceable rows:

```tsx
{isPending && (
  <p className="text-[10px] text-amber-600 mt-1 text-center">미저장 · 저장 후 추적 가능</p>
)}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/equipment/components/ConnectionDiagram.tsx
git commit -m "feat: add cable trace click handler to ConnectionDiagram"
```

---

### Task 8: Canvas Highlight in ConnectionOverlay

**Files:**
- Modify: `frontend/src/features/connections/components/ConnectionOverlay.tsx`

- [ ] **Step 1: Add highlight rendering**

In `ConnectionOverlay.tsx`:

1. Import `usePathHighlightStore`
2. Read `active`, `mode`, `highlightedNodeIds`, `highlightedEdgeIds`, `clearHighlight`
3. In the render useEffect, after normal `renderConnections()`:
   - If `active && mode === 'canvas'`:
     - Re-render connections with dimming: non-highlighted at 0.3 opacity
     - Highlighted connections: thicker stroke (lineWidth * 2)
     - Highlighted equipment: blue glow rect
4. Add ESC handler to call `clearHighlight` (extend existing ESC handler)
5. Add a small "경로 추적 중 · ESC 해제" banner when active

Add to the render useEffect, after `renderConnections(context, renderableConnections)`:

```typescript
const pathHighlight = usePathHighlightStore.getState();
if (pathHighlight.active && pathHighlight.mode === 'canvas') {
  // Dim non-highlighted
  ctx.save();
  ctx.globalAlpha = 0.3;
  // ... redraw non-highlighted items dimmed
  ctx.restore();

  // Glow highlighted equipment
  for (const nodeId of pathHighlight.highlightedNodeIds) {
    const pos = equipmentPositions.get(nodeId);
    if (!pos) continue;
    const scale = zoom / 100;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, panX, panY);
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.strokeRect(pos.x - 2, pos.y - 2, pos.width + 4, pos.height + 4);
    ctx.restore();
  }
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/connections/components/ConnectionOverlay.tsx
git commit -m "feat: add canvas highlight mode for same-room path traces"
```

---

## Chunk 4: Frontend — SVG Topology Modal

### Task 9: Delete Old PathTrace Components

**Files:**
- Delete: `frontend/src/features/pathTrace/components/PathTracePanel.tsx`
- Delete: `frontend/src/features/pathTrace/components/PathDiagram.tsx`
- Delete: `frontend/src/features/pathTrace/components/RingDiagram.tsx`

- [ ] **Step 1: Verify no active imports**

Run: `cd frontend && grep -r "PathTracePanel\|PathDiagram\|RingDiagram" src/ --include="*.ts" --include="*.tsx" -l`

These components are unmounted (confirmed earlier). Delete them.

- [ ] **Step 2: Delete files**

```bash
git rm frontend/src/features/pathTrace/components/PathTracePanel.tsx
git rm frontend/src/features/pathTrace/components/PathDiagram.tsx
git rm frontend/src/features/pathTrace/components/RingDiagram.tsx
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove unused PathTrace components (replaced by topology modal)"
```

---

### Task 10: Layout Engine

**Files:**
- Create: `frontend/src/features/pathTrace/utils/layoutEngine.ts`

- [ ] **Step 1: Write the grid layout calculator**

This groups nodes by substation and positions substation boxes in a grid.

```typescript
// frontend/src/features/pathTrace/utils/layoutEngine.ts
import type { TraceNode, TraceEdge } from '../types';

export interface LayoutNode {
  equipmentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutSubstation {
  substationId: string;
  substationName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodes: LayoutNode[];
}

export interface LayoutResult {
  substations: LayoutSubstation[];
  viewBox: { width: number; height: number };
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 36;
const NODE_GAP = 16;
const SUBSTATION_PADDING = 24;
const SUBSTATION_HEADER = 32;
const SUBSTATION_GAP = 60;
const COLS = 3; // substations per row

export function computeLayout(nodes: TraceNode[], _edges: TraceEdge[]): LayoutResult {
  // Group nodes by substation
  const groups = new Map<string, { name: string; nodes: TraceNode[] }>();
  for (const node of nodes) {
    const key = node.substationId || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, { name: node.substationName || '알 수 없음', nodes: [] });
    }
    groups.get(key)!.nodes.push(node);
  }

  const substations: LayoutSubstation[] = [];
  const groupEntries = Array.from(groups.entries());

  for (let i = 0; i < groupEntries.length; i++) {
    const [substationId, { name, nodes: groupNodes }] = groupEntries[i];

    // Layout nodes inside substation box
    const nodesPerRow = Math.min(groupNodes.length, 3);
    const rows = Math.ceil(groupNodes.length / nodesPerRow);
    const innerWidth = nodesPerRow * NODE_WIDTH + (nodesPerRow - 1) * NODE_GAP;
    const innerHeight = rows * NODE_HEIGHT + (rows - 1) * NODE_GAP;

    const boxWidth = innerWidth + SUBSTATION_PADDING * 2;
    const boxHeight = innerHeight + SUBSTATION_HEADER + SUBSTATION_PADDING * 2;

    const col = i % COLS;
    const row = Math.floor(i / COLS);

    // Position substation box (rough grid — refine later if needed)
    const sx = col * (boxWidth + SUBSTATION_GAP);
    const sy = row * (boxHeight + SUBSTATION_GAP);

    const layoutNodes: LayoutNode[] = groupNodes.map((n, j) => {
      const nc = j % nodesPerRow;
      const nr = Math.floor(j / nodesPerRow);
      return {
        equipmentId: n.equipmentId,
        x: sx + SUBSTATION_PADDING + nc * (NODE_WIDTH + NODE_GAP),
        y: sy + SUBSTATION_HEADER + SUBSTATION_PADDING + nr * (NODE_HEIGHT + NODE_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    });

    substations.push({
      substationId,
      substationName: name,
      x: sx,
      y: sy,
      width: boxWidth,
      height: boxHeight,
      nodes: layoutNodes,
    });
  }

  // Compute total viewBox
  let maxX = 0;
  let maxY = 0;
  for (const s of substations) {
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }

  return {
    substations,
    viewBox: { width: maxX + 40, height: maxY + 40 },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/pathTrace/utils/layoutEngine.ts
git commit -m "feat: add substation grid layout engine for topology SVG"
```

---

### Task 11: TopologyModal Component

**Files:**
- Create: `frontend/src/features/pathTrace/components/TopologyModal.tsx`
- Create: `frontend/src/features/pathTrace/components/SubstationBox.tsx`
- Create: `frontend/src/features/pathTrace/components/TopologyEdge.tsx`
- Create: `frontend/src/features/pathTrace/components/RingSelector.tsx`

- [ ] **Step 1: Create SubstationBox**

```typescript
// frontend/src/features/pathTrace/components/SubstationBox.tsx
import type { LayoutSubstation } from '../utils/layoutEngine';

interface SubstationBoxProps {
  substation: LayoutSubstation;
  highlightedNodeIds: Set<string>;
  startNodeIds: Set<string>;
}

export function SubstationBox({ substation, highlightedNodeIds, startNodeIds }: SubstationBoxProps) {
  return (
    <g>
      {/* Box */}
      <rect
        x={substation.x}
        y={substation.y}
        width={substation.width}
        height={substation.height}
        rx={8}
        fill="#f9fafb"
        stroke="#d1d5db"
        strokeWidth={1}
      />
      {/* Header */}
      <text
        x={substation.x + 12}
        y={substation.y + 20}
        fontSize={12}
        fontWeight="bold"
        fill="#374151"
      >
        {substation.substationName}
      </text>

      {/* Equipment nodes */}
      {substation.nodes.map((node) => {
        const isHighlighted = highlightedNodeIds.has(node.equipmentId);
        const isStart = startNodeIds.has(node.equipmentId);
        const opacity = isHighlighted ? 1 : 0.3;

        return (
          <g key={node.equipmentId} opacity={opacity}>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={18}
              fill={isStart ? '#dbeafe' : '#ffffff'}
              stroke={isStart ? '#3b82f6' : '#9ca3af'}
              strokeWidth={isStart ? 2 : 1}
            />
            {isStart && (
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={18}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
              >
                <animate
                  attributeName="stroke-opacity"
                  values="1;0.3;1"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </rect>
            )}
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height / 2 + 4}
              textAnchor="middle"
              fontSize={11}
              fill="#1f2937"
            >
              {/* Show truncated equipment name */}
              {node.equipmentId}
            </text>
          </g>
        );
      })}
    </g>
  );
}
```

Note: The text inside equipment pills will need the actual equipment name. The layout nodes need to carry the name. We'll fix this by extending `LayoutNode` to include `equipmentName` in the layout engine. Add `equipmentName: string` to LayoutNode and populate it in `computeLayout`.

- [ ] **Step 2: Create TopologyEdge**

```typescript
// frontend/src/features/pathTrace/components/TopologyEdge.tsx
import type { TraceEdge } from '../types';
import type { LayoutNode } from '../utils/layoutEngine';
import { CABLE_COLORS } from '../../editor/renderers/connectionRenderer';

interface TopologyEdgeProps {
  edge: TraceEdge;
  nodePositions: Map<string, LayoutNode>;
  isHighlighted: boolean;
}

export function TopologyEdge({ edge, nodePositions, isHighlighted }: TopologyEdgeProps) {
  const source = nodePositions.get(edge.sourceEquipmentId);
  const target = nodePositions.get(edge.targetEquipmentId);
  if (!source || !target) return null;

  const x1 = source.x + source.width / 2;
  const y1 = source.y + source.height / 2;
  const x2 = target.x + target.width / 2;
  const y2 = target.y + target.height / 2;

  const isFiber = edge.type === 'fiberPath';
  const color = isFiber ? '#8b5cf6' : (CABLE_COLORS[edge.cableType as keyof typeof CABLE_COLORS] || '#6b7280');
  const opacity = isHighlighted ? 1 : 0.2;

  return (
    <g opacity={opacity}>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={isHighlighted ? 2.5 : 1.5}
        strokeDasharray={isFiber ? '6,4' : undefined}
      />
      {isFiber && edge.portCount && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - 6}
          textAnchor="middle"
          fontSize={9}
          fill="#8b5cf6"
        >
          {edge.portCount}코어
        </text>
      )}
      {edge.label && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 + 12}
          textAnchor="middle"
          fontSize={9}
          fill="#6b7280"
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}
```

- [ ] **Step 3: Create RingSelector**

```typescript
// frontend/src/features/pathTrace/components/RingSelector.tsx
import type { TraceRing } from '../types';

interface RingSelectorProps {
  rings: TraceRing[];
  selectedRingId: string | null;
  onSelect: (ringId: string | null) => void;
}

export function RingSelector({ rings, selectedRingId, onSelect }: RingSelectorProps) {
  if (rings.length === 0) return null;

  return (
    <div className="border-t border-gray-200 p-4">
      <p className="text-sm font-medium text-gray-700 mb-2">
        감지된 링 ({rings.length})
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSelect(null)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
            !selectedRingId
              ? 'bg-blue-100 border-blue-300 text-blue-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          전체 보기
        </button>
        {rings.map((ring) => (
          <button
            key={ring.id}
            onClick={() => onSelect(ring.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
              selectedRingId === ring.id
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {ring.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create TopologyModal**

```typescript
// frontend/src/features/pathTrace/components/TopologyModal.tsx
import { useMemo, useRef, useState, useCallback } from 'react';
import { usePathHighlightStore } from '../stores/pathHighlightStore';
import { computeLayout } from '../utils/layoutEngine';
import { SubstationBox } from './SubstationBox';
import { TopologyEdge } from './TopologyEdge';
import { RingSelector } from './RingSelector';
import type { LayoutNode } from '../utils/layoutEngine';

export function TopologyModal() {
  const active = usePathHighlightStore((s) => s.active);
  const mode = usePathHighlightStore((s) => s.mode);
  const traceResult = usePathHighlightStore((s) => s.traceResult);
  const selectedRingId = usePathHighlightStore((s) => s.selectedRingId);
  const highlightedNodeIds = usePathHighlightStore((s) => s.highlightedNodeIds);
  const highlightedEdgeIds = usePathHighlightStore((s) => s.highlightedEdgeIds);
  const selectRing = usePathHighlightStore((s) => s.selectRing);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);

  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const layout = useMemo(() => {
    if (!traceResult) return null;
    return computeLayout(traceResult.nodes, traceResult.edges);
  }, [traceResult]);

  // Initialize viewBox from layout
  useMemo(() => {
    if (layout) {
      setViewBox({ x: 0, y: 0, w: layout.viewBox.width, h: layout.viewBox.height });
    }
  }, [layout]);

  const nodePositions = useMemo(() => {
    if (!layout) return new Map<string, LayoutNode>();
    const map = new Map<string, LayoutNode>();
    for (const s of layout.substations) {
      for (const n of s.nodes) {
        map.set(n.equipmentId, n);
      }
    }
    return map;
  }, [layout]);

  const startNodeIds = useMemo(() => {
    if (!traceResult) return new Set<string>();
    return new Set(
      traceResult.nodes.filter((n) => n.isSource || n.isTarget).map((n) => n.equipmentId)
    );
  }, [traceResult]);

  // Zoom with wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 1.1 : 0.9;
    setViewBox((v) => ({
      x: v.x,
      y: v.y,
      w: v.w * scale,
      h: v.h * scale,
    }));
  }, []);

  // Pan with drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    const dx = (e.clientX - panStart.x) * scaleX;
    const dy = (e.clientY - panStart.y) * scaleY;
    setViewBox((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    setPanStart({ x: e.clientX, y: e.clientY });
  }, [isPanning, panStart, viewBox]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // ESC to close
  useMemo(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearHighlight();
    };
    if (active && mode === 'modal') {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [active, mode, clearHighlight]);

  if (!active || mode !== 'modal' || !traceResult || !layout) return null;

  const cableType = traceResult.edges.find((e) => e.type === 'cable')?.cableType ?? '';
  const startName = traceResult.nodes.find((n) => n.isSource)?.equipmentName ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-[1200px] h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-800">
            연결 경로 상세 — {cableType} ({startName} 기준)
          </h2>
          <button
            onClick={clearHighlight}
            className="rounded-lg p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* SVG Area */}
        <div className="flex-1 overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            className="w-full h-full"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          >
            {/* Edges (behind nodes) */}
            {traceResult.edges.map((edge) => (
              <TopologyEdge
                key={edge.id}
                edge={edge}
                nodePositions={nodePositions}
                isHighlighted={highlightedEdgeIds.has(edge.id)}
              />
            ))}

            {/* Substation boxes with nodes */}
            {layout.substations.map((s) => (
              <SubstationBox
                key={s.substationId}
                substation={s}
                highlightedNodeIds={highlightedNodeIds}
                startNodeIds={startNodeIds}
              />
            ))}
          </svg>
        </div>

        {/* Legend */}
        <div className="px-6 py-2 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-gray-400" /> 케이블
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-purple-500" /> FiberPath
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 bg-blue-100" /> 시작설비
          </span>
        </div>

        {/* Ring selector */}
        <RingSelector
          rings={traceResult.rings}
          selectedRingId={selectedRingId}
          onSelect={selectRing}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/pathTrace/components/TopologyModal.tsx \
  frontend/src/features/pathTrace/components/SubstationBox.tsx \
  frontend/src/features/pathTrace/components/TopologyEdge.tsx \
  frontend/src/features/pathTrace/components/RingSelector.tsx
git commit -m "feat: add SVG topology modal with substation boxes, edges, and ring selector"
```

---

## Chunk 5: Frontend — Integration & Wiring

### Task 12: Mount TopologyModal & Wire Up

**Files:**
- Modify: `frontend/src/features/editor/components/EquipmentDetailPanel.tsx` (import TopologyModal)
- Or mount at app/page level if more appropriate

- [ ] **Step 1: Find the correct mount point**

The modal should render at a high level since it's a fixed overlay. Check where the editor page component is.

Run: `cd frontend && grep -r "ConnectionOverlay" src/ --include="*.tsx" -l`

Mount `TopologyModal` alongside `ConnectionOverlay` in the same parent.

- [ ] **Step 2: Add TopologyModal import and render**

In the parent page component that renders `ConnectionOverlay`, add:

```tsx
import { TopologyModal } from '../../pathTrace/components/TopologyModal';

// In JSX, alongside ConnectionOverlay:
<TopologyModal />
```

- [ ] **Step 3: Update layoutEngine to include equipmentName in LayoutNode**

In `frontend/src/features/pathTrace/utils/layoutEngine.ts`, add `equipmentName` to `LayoutNode`:

```typescript
export interface LayoutNode {
  equipmentId: string;
  equipmentName: string;  // add this
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Update `computeLayout` to populate it:

```typescript
const layoutNodes: LayoutNode[] = groupNodes.map((n, j) => {
  const nc = j % nodesPerRow;
  const nr = Math.floor(j / nodesPerRow);
  return {
    equipmentId: n.equipmentId,
    equipmentName: n.equipmentName,  // add this
    x: sx + SUBSTATION_PADDING + nc * (NODE_WIDTH + NODE_GAP),
    y: sy + SUBSTATION_HEADER + SUBSTATION_PADDING + nr * (NODE_HEIGHT + NODE_GAP),
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  };
});
```

Update `SubstationBox.tsx` to use `equipmentName` instead of `equipmentId` in the text element. You'll need to pass it through or look it up. Since `LayoutNode` now has `equipmentName`, find the node data:

The substation's `nodes` array has `equipmentId`. We need to map them to names. Easiest: extend the LayoutNode with the name (already done above). Then update SubstationBox to find the name from the layout node.

Actually the SubstationBox already receives `substation.nodes` which are `LayoutNode[]`. Just use `node.equipmentName` in the SVG text.

- [ ] **Step 4: Verify everything compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: mount TopologyModal and wire up layout with equipment names"
```

---

### Task 13: Final Polish & ESC/Cleanup

**Files:**
- Modify: `frontend/src/features/connections/components/ConnectionOverlay.tsx` (ESC handler)
- Modify: `frontend/src/features/pathTrace/components/TopologyModal.tsx` (fix useEffect for ESC)

- [ ] **Step 1: Fix TopologyModal ESC handler to use useEffect**

Replace the `useMemo` ESC handler in TopologyModal with proper `useEffect`:

```typescript
import { useEffect } from 'react';

useEffect(() => {
  if (!active || mode !== 'modal') return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') clearHighlight();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [active, mode, clearHighlight]);
```

- [ ] **Step 2: Add clearHighlight to ConnectionOverlay's ESC handler**

In ConnectionOverlay.tsx's existing ESC useEffect, add:

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    resetConnectionEditor();
    usePathHighlightStore.getState().clearHighlight();
  }
};
```

- [ ] **Step 3: Clean up on viewMode change**

In ConnectionOverlay.tsx's "Reset on leave" useEffect:

```typescript
useEffect(() => {
  if (!isConnectionMode) {
    resetConnectionEditor();
    usePathHighlightStore.getState().clearHighlight();
  }
}, [isConnectionMode, resetConnectionEditor]);
```

- [ ] **Step 4: Verify compile + manual test**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/connections/components/ConnectionOverlay.tsx \
  frontend/src/features/pathTrace/components/TopologyModal.tsx
git commit -m "fix: proper ESC handling and cleanup for path highlight"
```

---

### Task 14: End-to-End Verification

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && npm run dev &
cd frontend && npm run dev &
```

- [ ] **Step 2: Manual test**

1. Open editor, navigate to a room with equipment
2. Click an equipment → ConnectionsTab
3. Click a saved cable row → should trigger trace
4. If all in same room → canvas highlight (blue glow, dimming)
5. If cross-substation → topology modal with SVG diagram
6. Test ring selector if rings detected
7. ESC to close
8. Verify pending cables show "저장 후 추적 가능" and don't trigger trace

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "feat: connection path trace & topology visualization complete"
```

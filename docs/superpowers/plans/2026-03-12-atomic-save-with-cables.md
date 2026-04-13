# Atomic Save: Cable Integration into bulkUpdatePlan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge cable CRUD into the single `bulkUpdatePlan` transaction so that one save button press creates one atomic version with elements + equipment + cables + snapshot.

**Architecture:** Move cable create/update/delete from frontend changeSet (separate API calls) into the `PUT /rooms/:id/plan` request body. Backend processes everything in one Prisma transaction and captures the snapshot inside that same transaction. Remove the separate `captureSnapshot` API. Frontend changeSet retains only photo and maintenance log entries.

**Tech Stack:** Express.js, Prisma ORM, PostgreSQL, React 18, Zustand, TanStack Query, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/services/room.service.ts` | Modify | Add cable processing to `bulkUpdatePlan` tx, inline snapshot capture, remove `captureSnapshot` |
| `backend/src/controllers/room.controller.ts` | Modify | Remove `captureSnapshot` handler |
| `backend/src/routes/rooms.routes.ts` | Modify | Add cable fields to validation schema, remove capture-snapshot route |
| `frontend/src/types/floorPlan.ts` | Modify | Add cable fields to `UpdateFloorPlanRequest` |
| `frontend/src/features/editor/hooks/useFloorPlanData.ts` | Modify | Include cables in save payload, remove cable changeSet processing, remove captureSnapshot call |
| `frontend/src/features/editor/stores/editorStore.ts` | Modify | Remove cable ChangeEntry types |
| `frontend/src/features/connections/components/ConnectionEditor.tsx` | Modify | Use cable changeSet (kept in store but as local-only tracking for UI merge) |
| `frontend/src/features/connections/hooks/useMergedConnections.ts` | No change | Still merges backend + local pending cables |
| `frontend/src/features/editor/hooks/useRoomAuditLogs.ts` | Modify | Simplify snapshot loading, remove staleTime hacks |

---

## Chunk 1: Backend — Atomic Save with Cables

### Task 1: Extend `UpdatePlanInput` and validation schema for cables

**Files:**
- Modify: `backend/src/services/room.service.ts:71-102`
- Modify: `backend/src/routes/rooms.routes.ts:41-51`

- [ ] **Step 1: Add cable fields to `UpdatePlanInput` type**

In `room.service.ts`, add to the `UpdatePlanInput` interface:

```typescript
export interface UpdatePlanInput {
  // ... existing fields ...
  cables?: {
    id?: string | null;       // null = create new
    sourceEquipmentId: string;
    targetEquipmentId: string;
    cableType: string;
    label?: string | null;
    length?: number | null;
    color?: string | null;
  }[];
  deletedCableIds?: string[];
}
```

- [ ] **Step 2: Add cable validation to route schema**

In `rooms.routes.ts`, add cable schema and extend `bulkUpdatePlanSchema`:

```typescript
const cableSchema = z.object({
  id: z.string().uuid().nullish(),
  sourceEquipmentId: z.string(),  // can be tempId
  targetEquipmentId: z.string(),  // can be tempId
  cableType: z.enum(['AC', 'DC', 'LAN', 'FIBER', 'GROUND']),
  label: z.string().nullish(),
  length: z.number().nullish(),
  color: z.string().nullish(),
});

const bulkUpdatePlanSchema = z.object({
  // ... existing fields ...
  cables: z.array(cableSchema).optional(),
  deletedCableIds: z.array(z.string().uuid()).optional(),
});
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/room.service.ts backend/src/routes/rooms.routes.ts
git commit -m "feat: add cable fields to UpdatePlanInput and validation schema"
```

---

### Task 2: Process cables inside `bulkUpdatePlan` transaction

**Files:**
- Modify: `backend/src/services/room.service.ts:268-411`

- [ ] **Step 1: Add cable deletion to transaction**

After existing `deletedEquipmentIds` block (line ~289), add:

```typescript
if (input.deletedCableIds && input.deletedCableIds.length > 0) {
  await tx.cable.deleteMany({
    where: { id: { in: input.deletedCableIds } },
  });
}
```

- [ ] **Step 2: Add cable create/update to transaction**

After equipment processing block (line ~364), before room.update, add:

```typescript
if (input.cables && input.cables.length > 0) {
  for (const cable of input.cables) {
    // Resolve tempIds to real IDs for equipment created in this save
    const srcId = equipmentIdMap[cable.sourceEquipmentId] ?? cable.sourceEquipmentId;
    const tgtId = equipmentIdMap[cable.targetEquipmentId] ?? cable.targetEquipmentId;

    if (cable.id) {
      await tx.cable.update({
        where: { id: cable.id },
        data: {
          sourceEquipmentId: srcId,
          targetEquipmentId: tgtId,
          cableType: cable.cableType as any,
          label: cable.label,
          length: cable.length,
          color: cable.color,
          updatedById: userId,
        },
      });
    } else {
      await tx.cable.create({
        data: {
          sourceEquipmentId: srcId,
          targetEquipmentId: tgtId,
          cableType: cable.cableType as any,
          label: cable.label,
          length: cable.length,
          color: cable.color,
          createdById: userId,
          updatedById: userId,
        },
      });
    }
  }
}
```

- [ ] **Step 3: Add 'cables' to changedFields tracking**

```typescript
if (input.cables?.length || input.deletedCableIds?.length) changedFields.push('cables');
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/room.service.ts
git commit -m "feat: process cables inside bulkUpdatePlan transaction"
```

---

### Task 3: Inline snapshot capture in transaction, remove `captureSnapshot`

**Files:**
- Modify: `backend/src/services/room.service.ts`

- [ ] **Step 1: Replace placeholder auditLog with inline snapshot**

Replace the `newValues: {} as any` placeholder in the auditLog.create with an inline snapshot captured via `tx`:

```typescript
// Capture snapshot inside transaction (all changes committed within tx)
const snapshotRoom = await tx.room.findUnique({ where: { id } });
const snapshotElements = await tx.floorPlanElement.findMany({
  where: { roomId: id },
  orderBy: { zIndex: 'asc' },
});
const snapshotEquipment = await tx.equipment.findMany({
  where: { roomId: id },
  select: {
    id: true, name: true, category: true,
    positionX: true, positionY: true, width2d: true, height2d: true,
    rotation: true, frontImageUrl: true, rearImageUrl: true,
    description: true, model: true, manufacturer: true, manager: true, height3d: true,
  },
  orderBy: { sortOrder: 'asc' },
});
const snapshotCables = await tx.cable.findMany({
  where: {
    OR: [
      { sourceEquipment: { roomId: id } },
      { targetEquipment: { roomId: id } },
    ],
  },
  include: {
    sourceEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
    targetEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
  },
});

const snapshot = {
  plan: {
    id: snapshotRoom!.id,
    name: snapshotRoom!.name,
    canvasWidth: snapshotRoom!.canvasWidth,
    canvasHeight: snapshotRoom!.canvasHeight,
    gridSize: snapshotRoom!.gridSize,
    majorGridSize: snapshotRoom!.majorGridSize,
    backgroundColor: snapshotRoom!.backgroundColor,
    elements: snapshotElements.map((e) => ({
      id: e.id,
      elementType: e.elementType,
      properties: e.properties as Record<string, unknown>,
      zIndex: e.zIndex,
      isVisible: e.isVisible,
    })),
    equipment: snapshotEquipment.map((e) => ({
      id: e.id, name: e.name, category: e.category,
      positionX: e.positionX ?? 0, positionY: e.positionY ?? 0,
      width: e.width2d ?? 60, height: e.height2d ?? 100,
      rotation: e.rotation ?? 0,
      frontImageUrl: e.frontImageUrl, rearImageUrl: e.rearImageUrl,
      description: e.description, model: e.model,
      manufacturer: e.manufacturer, manager: e.manager, height3d: e.height3d,
    })),
    version: newVersion,
    updatedAt: snapshotRoom!.updatedAt,
  },
  cables: snapshotCables.map((c) => ({
    id: c.id,
    sourceEquipmentId: c.sourceEquipmentId,
    targetEquipmentId: c.targetEquipmentId,
    cableType: c.cableType,
    label: c.label, length: c.length, color: c.color,
    pathPoints: c.pathPoints, description: c.description,
    sourceEquipment: c.sourceEquipment,
    targetEquipment: c.targetEquipment,
  })),
};

await tx.auditLog.create({
  data: {
    entityType: 'Room', entityId: id, entityName: room.name,
    action: 'UPDATE', actionDetail: `v${newVersion} 저장`,
    changedFields,
    newValues: snapshot as any,
    userId, userName: user?.name ?? null,
  },
});
```

- [ ] **Step 2: Delete the `captureSnapshot` method entirely**

Remove the entire `captureSnapshot` method (~lines 479-528).

- [ ] **Step 3: Remove `captureSnapshot` from controller**

In `room.controller.ts`, delete the `captureSnapshot` handler.

- [ ] **Step 4: Remove capture-snapshot route**

In `rooms.routes.ts`, delete:
```typescript
router.post('/:id/capture-snapshot', authenticate, adminOnly, roomController.captureSnapshot);
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/room.service.ts backend/src/controllers/room.controller.ts backend/src/routes/rooms.routes.ts
git commit -m "feat: inline snapshot capture in transaction, remove captureSnapshot API"
```

---

## Chunk 2: Frontend — Atomic Save Integration

### Task 4: Add cable fields to `UpdateFloorPlanRequest`

**Files:**
- Modify: `frontend/src/types/floorPlan.ts:160-192`

- [ ] **Step 1: Extend `UpdateFloorPlanRequest`**

Add cable fields:

```typescript
export interface UpdateFloorPlanRequest {
  // ... existing fields ...
  cables?: {
    id?: string | null;
    sourceEquipmentId: string;
    targetEquipmentId: string;
    cableType: string;
    label?: string | null;
    length?: number | null;
    color?: string | null;
  }[];
  deletedCableIds?: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/floorPlan.ts
git commit -m "feat: add cable fields to UpdateFloorPlanRequest"
```

---

### Task 5: Rewrite save mutation — include cables, remove captureSnapshot call

**Files:**
- Modify: `frontend/src/features/editor/hooks/useFloorPlanData.ts`

- [ ] **Step 1: Remove `processChange` cases for cables**

In the `processChange` function, remove the `case 'cable:create'`, `case 'cable:update'`, `case 'cable:delete'` blocks. Keep photo and log cases.

- [ ] **Step 2: Include cables in `handleSave` payload**

In `handleSave`, build cable data from changeSet and merge with existing backend connections:

```typescript
const handleSave = () => {
  if (!floorPlan) return;
  const { changeSet } = useEditorStore.getState();

  // Build cable payload from changeSet
  const cableCreates = changeSet
    .filter((e): e is Extract<ChangeEntry, { type: 'cable:create' }> => e.type === 'cable:create')
    .map((c) => ({
      sourceEquipmentId: c.sourceEquipmentId,
      targetEquipmentId: c.targetEquipmentId,
      cableType: c.cableType,
      label: c.label, length: c.length, color: c.color,
    }));
  const cableUpdates = changeSet
    .filter((e): e is Extract<ChangeEntry, { type: 'cable:update' }> => e.type === 'cable:update')
    .map((c) => ({
      id: c.id,
      sourceEquipmentId: c.sourceEquipmentId,
      targetEquipmentId: c.targetEquipmentId,
      cableType: c.cableType,
      label: c.label, length: c.length, color: c.color,
    }));
  const deletedCableIds = changeSet
    .filter((e): e is Extract<ChangeEntry, { type: 'cable:delete' }> => e.type === 'cable:delete')
    .map((c) => c.cableId);

  const updateData: UpdateFloorPlanRequest = {
    canvasWidth: floorPlan.canvasWidth,
    canvasHeight: floorPlan.canvasHeight,
    gridSize, majorGridSize,
    elements: localElements.map(e => ({
      id: isTempId(e.id) ? null : e.id,
      elementType: e.elementType, properties: e.properties,
      zIndex: e.zIndex, isVisible: e.isVisible,
    })),
    equipment: localEquipment.map(eq => ({
      id: isTempId(eq.id) ? null : eq.id,
      tempId: isTempId(eq.id) ? eq.id : undefined,
      name: eq.name, category: eq.category || 'NETWORK',
      positionX: eq.positionX, positionY: eq.positionY,
      width: eq.width, height: eq.height, rotation: eq.rotation,
      description: eq.description || undefined,
      model: eq.model || undefined,
      manufacturer: eq.manufacturer || undefined,
      manager: eq.manager || undefined,
    })),
    cables: [...cableCreates, ...cableUpdates],
    deletedElementIds: deletedElementIds.length > 0 ? deletedElementIds : undefined,
    deletedEquipmentIds: deletedEquipmentIds.length > 0 ? deletedEquipmentIds : undefined,
    deletedCableIds: deletedCableIds.length > 0 ? deletedCableIds : undefined,
  };

  saveMutation.mutate(updateData);
};
```

- [ ] **Step 3: Simplify `onSuccess` — remove cable processing and captureSnapshot**

```typescript
onSuccess: async (response) => {
  const equipmentIdMap = response.data?.data?.equipmentIdMap ?? {};
  const { changeSet } = useEditorStore.getState();
  const tempIdMap = buildTempIdMap(equipmentIdMap);
  const resolveId = (id: string) => tempIdMap.get(id) ?? id;

  // Process remaining changeSet (photos and logs only — cables already saved)
  const nonCableChanges = changeSet.filter(
    (e) => !e.type.startsWith('cable:')
  );
  const deletions = nonCableChanges.filter((e) => e.type.endsWith(':delete'));
  const others = nonCableChanges.filter((e) => !e.type.endsWith(':delete'));

  const failures: ChangeEntry[] = [];
  const run = async (entries: ChangeEntry[]) => {
    const results = await Promise.allSettled(
      entries.map((entry) => processChange(entry, resolveId))
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') failures.push(entries[i]);
    });
  };
  await run(deletions);
  await run(others);

  if (failures.length > 0) {
    console.warn(`[Save] ${failures.length} change(s) failed:`, failures);
  }

  // Clear and invalidate
  useEditorStore.getState().clearChangeSet();
  queryClient.setQueryDefaults(['floorPlan', roomId], { staleTime: undefined });
  queryClient.setQueryDefaults(['room-connections', roomId], { staleTime: undefined });
  queryClient.invalidateQueries({ queryKey: ['floorPlan', roomId] });
  queryClient.invalidateQueries({ queryKey: ['room-connections', roomId] });
  queryClient.invalidateQueries({ queryKey: ['connections'] });
  if (nonCableChanges.some((e) => e.type.startsWith('photo:'))) {
    queryClient.invalidateQueries({ queryKey: ['equipment-photos'] });
  }
  if (nonCableChanges.some((e) => e.type.startsWith('log:'))) {
    queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
  }
  setHasChanges(false);

  const { localElements: currentElements, localEquipment: currentEquipment } = useEditorStore.getState();
  initHistory(currentElements, currentEquipment);
},
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/editor/hooks/useFloorPlanData.ts frontend/src/types/floorPlan.ts
git commit -m "feat: include cables in atomic save, remove captureSnapshot call"
```

---

### Task 6: Clean up editorStore — remove cable ChangeEntry types (SKIP)

**Note:** Keep cable ChangeEntry types in `editorStore.ts`. They are still used by `ConnectionEditor.tsx` to buffer local cable changes before save, and by `useMergedConnections.ts` to show pending changes in the UI. The cable entries in changeSet are now consumed by `handleSave` to build the request payload (Task 5), rather than being processed as separate API calls.

No changes needed to `editorStore.ts`, `ConnectionEditor.tsx`, or `useMergedConnections.ts`.

---

### Task 7: Simplify snapshot loading in `useRoomAuditLogs.ts`

**Files:**
- Modify: `frontend/src/features/editor/hooks/useRoomAuditLogs.ts`

- [ ] **Step 1: Rewrite `useLoadSnapshot`**

The snapshot format is now guaranteed to be `{ plan, cables }` from the atomic save. Simplify:

```typescript
export function useLoadSnapshot(roomId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (logId: string) => {
      const { data } = await api.get<{ data: SnapshotResponse }>(
        `/rooms/${roomId}/audit-logs/${logId}/snapshot`
      );
      return data.data;
    },
    onSuccess: (snapshot) => {
      if (!roomId) return;

      const store = useEditorStore.getState();
      const { initHistory } = useHistoryStore.getState();

      // Clear state
      store.clearChangeSet();
      store.clearSelection();
      store.setDetailPanelEquipmentId(null);

      // Cancel in-flight and freeze queries
      queryClient.cancelQueries({ queryKey: ['floorPlan', roomId] });
      queryClient.cancelQueries({ queryKey: ['room-connections', roomId] });
      queryClient.setQueryDefaults(['floorPlan', roomId], { staleTime: Infinity });
      queryClient.setQueryDefaults(['room-connections', roomId], { staleTime: Infinity });

      // Set caches
      queryClient.setQueryData(['floorPlan', roomId], snapshot.plan);
      queryClient.setQueryData(['room-connections', roomId], snapshot.cables);

      // Override equipment detail caches
      for (const eq of snapshot.plan.equipment) {
        if (eq.id) {
          queryClient.setQueryDefaults(['equipment-detail', eq.id], { staleTime: Infinity });
          queryClient.setQueryData(['equipment-detail', eq.id], {
            id: eq.id, name: eq.name, category: eq.category,
            model: eq.model ?? null, manufacturer: eq.manufacturer ?? null,
            manager: eq.manager ?? null, description: eq.description ?? null,
            installDate: null,
            width2d: eq.width, height2d: eq.height,
            frontImageUrl: eq.frontImageUrl ?? null,
            rearImageUrl: eq.rearImageUrl ?? null,
          });
        }
      }

      // Load into editor store
      const elements = snapshot.plan.elements.map((e) => ({
        ...e,
        isLocked: false,
      }));
      store.setLocalElements(elements);
      store.setLocalEquipment(snapshot.plan.equipment);
      store.setGridSize(snapshot.plan.gridSize);
      store.setMajorGridSize(snapshot.plan.majorGridSize ?? 60);

      // Mark changed + reset undo
      store.setHasChanges(true);
      initHistory(elements, snapshot.plan.equipment);
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/editor/hooks/useRoomAuditLogs.ts
git commit -m "refactor: simplify snapshot loading"
```

---

## Chunk 3: Build, Deploy, Verify

### Task 8: Build and deploy

- [ ] **Step 1: Build Docker containers**

```bash
cd /Users/jsk/1210/digital
docker compose build backend frontend
```

- [ ] **Step 2: Deploy**

```bash
docker compose up -d
```

- [ ] **Step 3: Verify backend starts**

```bash
docker compose logs backend --tail 5
```

Expected: `Server running on http://localhost:3000`

### Task 9: Manual verification

- [ ] **Step 1: Create a test save**

Open the floor plan editor, make some changes (move equipment, add a cable connection), press save.

- [ ] **Step 2: Verify snapshot content**

Check the audit log in the database or via API to confirm the snapshot includes both `plan` and `cables` data.

- [ ] **Step 3: Load a snapshot**

Click the change history panel, click on the version just saved. Verify:
- Elements match the saved state
- Equipment positions match
- Cable connections match (not current DB state)

- [ ] **Step 4: Load a different version**

If there are multiple versions, load an older one. Verify cable connections change accordingly.

---

## Summary of Removals

| What | Where | Why |
|------|-------|-----|
| `captureSnapshot` method | `room.service.ts` | Replaced by inline snapshot in transaction |
| `captureSnapshot` handler | `room.controller.ts` | No longer needed |
| `POST /:id/capture-snapshot` route | `rooms.routes.ts` | No longer needed |
| `captureSnapshot` API call in `onSuccess` | `useFloorPlanData.ts` | No longer needed |
| Cable cases in `processChange` | `useFloorPlanData.ts` | Cables now in bulk request |

## What Stays

| What | Where | Why |
|------|-------|-----|
| Cable ChangeEntry types | `editorStore.ts` | Used by ConnectionEditor for local buffering |
| `useMergedConnections` | As-is | Merges backend + pending local cables for UI display |
| Photo/log ChangeEntry types | `editorStore.ts` | Photos need multipart upload, logs are separate entities |
| Photo/log `processChange` cases | `useFloorPlanData.ts` | Still processed in onSuccess after save |
| `getAuditLogSnapshot` legacy format handling | `room.service.ts` | Backward compat for old audit logs |

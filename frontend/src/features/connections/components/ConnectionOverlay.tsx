import { useEffect, useMemo, useRef } from 'react';
import type { RoomConnection } from '../../../types/connection';
import type { FloorPlanCable } from '../../../types/floorPlan';
import { useEditorStore, type LocalCable } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import {
  useEffectiveAssets,
  useEffectiveEquipment,
  useEffectiveFloorCables,
  useEffectiveDistCircuits,
} from '../../workingCopy/hooks';
import { assetToRackModule } from '../../workingCopy/assetToRackModule';
import type { DistributionCircuit } from '../../../types/distributionCircuit';
import { CABLE_COLORS } from '../../../types/connection';

/** Check if a cable matches the current filter set (DB category codes) */
function cableMatchesFilter(
  categoryCode: string | undefined | null,
  filters: string[],
): boolean {
  if (!categoryCode) return true; // no category = always show
  return filters.includes(categoryCode);
}
import {
  renderConnections,
  type RenderableConnection,
  type ConnectionRenderContext,
} from '../../editor/renderers/connectionRenderer';
import { ConnectionLegend } from './ConnectionLegend';
import { CableWaypointHandles } from './CableWaypointHandles';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useInteractionStore } from '../../editor/stores/interactionStore';
import { useCableHitTestStore } from '../stores/cableHitTestStore';

interface ConnectionOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  floorId: string;
}

function mapCablesToRenderable(
  cables: LocalCable[],
  equipmentPositions: Map<string, { x: number; y: number; width: number; height: number }>
): RenderableConnection[] {
  const result: RenderableConnection[] = [];
  for (const cable of cables) {
    const sourcePos = equipmentPositions.get(cable.sourceEquipmentId);
    const targetPos = equipmentPositions.get(cable.targetEquipmentId);
    if (!sourcePos || !targetPos) continue;
    result.push({
      id: cable.id,
      sourceX: sourcePos.x + sourcePos.width / 2,
      sourceY: sourcePos.y + sourcePos.height / 2,
      targetX: targetPos.x + targetPos.width / 2,
      targetY: targetPos.y + targetPos.height / 2,
      cableType: cable.cableType,
      label: cable.label || cable.categoryName || cable.categoryCode || undefined,
      color: cable.color || cable.displayColor || CABLE_COLORS[cable.cableType] || '#6b7280',
      pathPoints: cable.pathPoints ?? undefined,
      pathLength: cable.pathLength ?? undefined,
      totalLength: cable.totalLength ?? undefined,
      materialCategoryCode: cable.categoryCode ?? undefined,
    });
  }
  return result;
}

function mapPlanCablesToRenderable(
  cables: FloorPlanCable[],
  equipmentPositions: Map<string, { x: number; y: number; width: number; height: number }>
): RenderableConnection[] {
  const result: RenderableConnection[] = [];
  for (const cable of cables) {
    const sourcePos = equipmentPositions.get(cable.sourceEquipmentId);
    const targetPos = equipmentPositions.get(cable.targetEquipmentId);
    if (!sourcePos || !targetPos) continue;
    result.push({
      id: cable.id,
      sourceX: sourcePos.x + sourcePos.width / 2,
      sourceY: sourcePos.y + sourcePos.height / 2,
      targetX: targetPos.x + targetPos.width / 2,
      targetY: targetPos.y + targetPos.height / 2,
      cableType: cable.cableType,
      label: cable.label || cable.categoryName || cable.categoryCode || undefined,
      color: cable.color || cable.displayColor || CABLE_COLORS[cable.cableType] || '#6b7280',
      pathPoints: cable.pathPoints ?? undefined,
      pathLength: cable.pathLength,
      totalLength: cable.totalLength,
      materialCategoryCode: cable.categoryCode ?? undefined,
    });
  }
  return result;
}

export function ConnectionOverlay({ canvasRef, floorId }: ConnectionOverlayProps) {
  const zoom = useEditorStore((s) => s.zoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  // SSOT-2d Task 3 — 읽기를 통합 스토어 effective 로.
  const editorEquipment = useEffectiveEquipment(floorId);
  const connectionFilters = useEditorStore((s) => s.connectionFilters);
  const selectedCableId = useEditorStore((s) => s.selectedCableId);
  const setSelectedCableId = useEditorStore((s) => s.setSelectedCableId);

  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const snapshotCables = useSnapshotStore((s) => s.cables);

  const localEquipment = snapshotActive ? snapshotEquipment : editorEquipment;

  // effective 케이블은 이 층에 닿는 것만(useEffectiveFloorCables). 좌표 fallback 용
  // 랙모듈/회로는 substation 전역 effective 에서 — 모듈은 랙 자식 Asset 을 RackModule
  // shape 으로 매핑, 회로는 그대로(WorkingCopyRow→DistributionCircuit cast).
  const editorCables = useEffectiveFloorCables(floorId) as unknown as LocalCable[];
  const effectiveAssets = useEffectiveAssets();
  const editorRackModules = useMemo(
    () =>
      effectiveAssets
        .filter((a) => a.parentAssetId && a.slotIndex != null)
        .map(assetToRackModule),
    [effectiveAssets],
  );
  const editorDistCircuits = useEffectiveDistCircuits() as unknown as DistributionCircuit[];

  const highlightActive = usePathHighlightStore((s) => s.active);
  const highlightedNodeIds = usePathHighlightStore((s) => s.highlightedNodeIds);
  const highlightedEdgeIds = usePathHighlightStore((s) => s.highlightedEdgeIds);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);

  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Use localCables directly (no merge needed), or snapshot cables in preview mode
  const connections = snapshotActive ? snapshotCables : null;
  const cables = snapshotActive ? null : editorCables;

  // 모듈 endpoint cable 의 좌표는 부모 랙 좌표로 fallback (도면에서는 모듈을 별도로
  // 그리지 않음). cable 의 source/targetEquipmentId 자리에 모듈 id 가 들어와도 lookup
  // 성공하도록 module id → 부모 rack 좌표 매핑을 같은 맵에 둔다.
  const equipmentPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const eq of localEquipment) {
      map.set(eq.id, { x: eq.positionX, y: eq.positionY, width: eq.width, height: eq.height });
    }
    if (!snapshotActive) {
      const eqById = new Map(localEquipment.map((eq) => [eq.id, eq]));
      for (const m of editorRackModules) {
        const parent = eqById.get(m.rackEquipmentId);
        if (!parent) continue;
        map.set(m.id, {
          x: parent.positionX,
          y: parent.positionY,
          width: parent.width,
          height: parent.height,
        });
      }
      // 분전반 회로 id → 부모 분전반 좌표 (모듈과 동일 fallback).
      for (const c of editorDistCircuits) {
        const parent = eqById.get(c.distributionEquipmentId);
        if (!parent) continue;
        map.set(c.id, {
          x: parent.positionX,
          y: parent.positionY,
          width: parent.width,
          height: parent.height,
        });
      }
    }
    return map;
  }, [localEquipment, editorRackModules, editorDistCircuits, snapshotActive]);

  const renderableConnections = useMemo(() => {
    const all = snapshotActive
      ? (connections ? mapPlanCablesToRenderable(connections, equipmentPositions) : [])
      : (cables ? mapCablesToRenderable(cables, equipmentPositions) : []);
    // null = filters not yet initialized → show all cables
    if (connectionFilters === null) return all;
    return all.filter((c) =>
      cableMatchesFilter(c.materialCategoryCode, connectionFilters)
    );
  }, [connections, cables, snapshotActive, equipmentPositions, connectionFilters]);

  // Build hit-test entries from connection identity only (not viewport-dependent)
  const hitTestEntries = useMemo(() => {
    const all = snapshotActive
      ? (connections ? mapPlanCablesToRenderable(connections, equipmentPositions) : [])
      : (cables ? mapCablesToRenderable(cables, equipmentPositions) : []);
    // null = filters not yet initialized → include all for hit testing
    if (connectionFilters === null) {
      return all
        .filter((c) => c.id && c.pathPoints && c.pathPoints.length >= 2)
        .map((c) => ({ id: c.id!, pathPoints: c.pathPoints! }));
    }
    return all
      .filter((c) =>
        cableMatchesFilter(c.materialCategoryCode, connectionFilters)
        && c.id && c.pathPoints && c.pathPoints.length >= 2
      )
      .map((c) => ({ id: c.id!, pathPoints: c.pathPoints! }));
  }, [connections, cables, snapshotActive, equipmentPositions, connectionFilters]);

  // Populate cable hit test store for useCanvasEvents.
  // NB: useCableHitTestStore 의 setter 는 영속 컬렉션이 아니라 viewport hit-test
  // 엔트리(transient)다 — editorStore 의 setCables(영속 케이블 교체)와 무관하고
  // 통합 스토어 stage 와도 무관하므로 그대로 둔다(bracket 접근으로 selector 우회).
  const setCableHitEntries = useCableHitTestStore((s) => s['setCables']);
  useEffect(() => {
    setCableHitEntries(hitTestEntries);
  }, [hitTestEntries, setCableHitEntries]);

  // Render cables on overlay canvas
  useEffect(() => {
    if (!overlayRef.current) return;

    const canvas = overlayRef.current;
    const parentCanvas = canvasRef.current;
    if (!parentCanvas) return;

    canvas.width = parentCanvas.width;
    canvas.height = parentCanvas.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const context: ConnectionRenderContext = { ctx, zoom, panX, panY, selectedCableId };

    // Path highlight: show only trace cables, hide the rest
    const isHighlighting = highlightActive;
    if (isHighlighting) {
      const emphasized = renderableConnections.filter((c) => c.id && highlightedEdgeIds.has(c.id));
      const emphasizedWithHighlight = emphasized.map((c) => ({ ...c, highlighted: true }));
      renderConnections(context, emphasizedWithHighlight);

      // Glow rects around highlighted equipment
      const scale = zoom / 100;
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, panX, panY);
      for (const [eqId, pos] of equipmentPositions) {
        if (!highlightedNodeIds.has(eqId)) continue;
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x - 2, pos.y - 2, pos.width + 4, pos.height + 4);
      }
      ctx.restore();
    } else {
      renderConnections(context, renderableConnections);
    }

  }, [renderableConnections, zoom, panX, panY, equipmentPositions, canvasRef,
    selectedCableId,
    highlightActive, highlightedNodeIds, highlightedEdgeIds]);

  // ESC key: cancel creation or clear highlight
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (highlightActive) clearHighlight();
      if (selectedCableId) setSelectedCableId(null);
      const interaction = useInteractionStore.getState();
      if (interaction.mode.kind !== 'idle') interaction.cancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [highlightActive, clearHighlight, selectedCableId, setSelectedCableId]);

  // Find selected cable for waypoint handles
  const selectedCable = useMemo(() => {
    if (!selectedCableId) return null;
    // Build a RoomConnection-compatible shape for CableWaypointHandles
    const toWaypointCable = (c: FloorPlanCable | LocalCable): RoomConnection => ({
      id: c.id,
      sourceEquipmentId: c.sourceEquipmentId,
      targetEquipmentId: c.targetEquipmentId,
      cableType: c.cableType,
      pathPoints: c.pathPoints ?? undefined,
      pathLength: c.pathLength ?? undefined,
      totalLength: c.totalLength ?? undefined,
      color: c.color ?? undefined,
      label: c.label ?? undefined,
      materialCategoryCode: c.categoryCode ?? undefined,
      sourceEquipment: { id: c.sourceEquipmentId, name: '', parentEquipmentId: null, floorId: null },
      targetEquipment: { id: c.targetEquipmentId, name: '', parentEquipmentId: null, floorId: null },
    } as RoomConnection);

    if (snapshotActive && connections) {
      const found = connections.find((c) => c.id === selectedCableId);
      return found ? toWaypointCable(found) : null;
    }
    if (cables) {
      const cable = cables.find((c) => c.id === selectedCableId);
      if (!cable) return null;
      return toWaypointCable(cable);
    }
    return null;
  }, [selectedCableId, connections, cables, snapshotActive]);

  return (
    <>
      <canvas
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      />


      {/* Waypoint handles for selected cable */}
      {selectedCable && selectedCable.pathPoints && selectedCable.pathPoints.length >= 2 && (
        <CableWaypointHandles
          cable={selectedCable}
          zoom={zoom}
          panX={panX}
          panY={panY}
        />
      )}

      <ConnectionLegend />
    </>
  );
}

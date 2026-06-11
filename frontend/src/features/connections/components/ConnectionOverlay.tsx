import { useEffect, useMemo, useRef } from 'react';
import type { RoomConnection } from '../../../types/connection';
import type { FloorPlanCable } from '../../../types/floorPlan';
import { useEditorStore, type LocalCable } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import {
  useEffectiveAssets,
  useEffectiveEquipment,
  useEffectiveFloorCables,
} from '../../workingCopy/hooks';
import { cableDtoToLocal, type CableDetailDTO } from '../../workingCopy/cableToLocal';
import { floorAnchor, assetsByIdMap } from '../../workingCopy/floorAnchor';
import { CABLE_COLORS, normalizeCableColor } from '../../../types/connection';

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
    const sourcePos = equipmentPositions.get(cable.sourceAssetId);
    const targetPos = equipmentPositions.get(cable.targetAssetId);
    if (!sourcePos || !targetPos) continue;
    result.push({
      id: cable.id,
      sourceX: sourcePos.x + sourcePos.width / 2,
      sourceY: sourcePos.y + sourcePos.height / 2,
      targetX: targetPos.x + targetPos.width / 2,
      targetY: targetPos.y + targetPos.height / 2,
      cableType: cable.cableType,
      label: cable.label || cable.categoryName || cable.categoryCode || undefined,
      color: normalizeCableColor(cable.color || cable.displayColor) || CABLE_COLORS[cable.cableType] || '#6b7280',
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
    const sourcePos = equipmentPositions.get(cable.sourceAssetId);
    const targetPos = equipmentPositions.get(cable.targetAssetId);
    if (!sourcePos || !targetPos) continue;
    result.push({
      id: cable.id,
      sourceX: sourcePos.x + sourcePos.width / 2,
      sourceY: sourcePos.y + sourcePos.height / 2,
      targetX: targetPos.x + targetPos.width / 2,
      targetY: targetPos.y + targetPos.height / 2,
      cableType: cable.cableType,
      label: cable.label || cable.categoryName || cable.categoryCode || undefined,
      color: normalizeCableColor(cable.color || cable.displayColor) || CABLE_COLORS[cable.cableType] || '#6b7280',
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

  // effective 케이블은 이 층에 닿는 것만(useEffectiveFloorCables). cableDtoToLocal 이
  // 단일 endpoint assetId 를 flat LocalCable(sourceAssetId 자리)로 매핑한다 —
  // 끝점 위치는 floorAnchor 가 그 assetId 를 placed ancestor 로 해소한다(아래 position map).
  const editorCables = useEffectiveFloorCables(floorId).map((c) =>
    cableDtoToLocal(c as unknown as CableDetailDTO),
  );
  const effectiveAssets = useEffectiveAssets();

  const highlightActive = usePathHighlightStore((s) => s.active);
  const highlightedNodeIds = usePathHighlightStore((s) => s.highlightedNodeIds);
  const highlightedEdgeIds = usePathHighlightStore((s) => s.highlightedEdgeIds);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);

  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Use localCables directly (no merge needed), or snapshot cables in preview mode
  const connections = snapshotActive ? snapshotCables : null;
  const cables = snapshotActive ? null : editorCables;

  // 단계3a — 끝점 위치 = floor anchor(렌더 대표). endpoint 는 이제 단일 assetId
  // (sourceAssetId/targetAssetId 자리에 assetId 가 들어온다 — cableDtoToLocal).
  // 각 케이블 endpoint asset id 를 floorAnchor 로 placed ancestor(설비/랙/분전반)까지
  // 해소해 그 사각형을 endpoint id(key) 로 매핑한다. branch endpoint 는
  // branch→feeder→panel 으로 해소 — 회로 특수처리(distributionEquipmentId) 불필요.
  const equipmentPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const eq of localEquipment) {
      map.set(eq.id, { x: eq.positionX, y: eq.positionY, width: eq.width, height: eq.height });
    }
    if (!snapshotActive) {
      const assetsById = assetsByIdMap(effectiveAssets);
      // endpoint id(key) → placed ancestor(floorAnchor) 사각형. 직접 배치 id 는 자기 좌표
      // (이미 localEquipment 로 들어와 있음), 그 외(모듈/분기 등)는 부모 체인을 거슬러 해소.
      const setAnchor = (key: string) => {
        if (!key || map.has(key)) return;
        const a = floorAnchor(key, assetsById);
        if (a?.positionX != null && a.positionY != null) {
          map.set(key, { x: a.positionX, y: a.positionY, width: a.width2d ?? 0, height: a.height2d ?? 0 });
        }
      };
      for (const c of editorCables) {
        setAnchor(c.sourceAssetId);
        setAnchor(c.targetAssetId);
      }
    }
    return map;
  }, [localEquipment, editorCables, effectiveAssets, snapshotActive]);

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
      sourceAssetId: c.sourceAssetId,
      targetAssetId: c.targetAssetId,
      cableType: c.cableType,
      pathPoints: c.pathPoints ?? undefined,
      pathLength: c.pathLength ?? undefined,
      totalLength: c.totalLength ?? undefined,
      color: c.color ?? undefined,
      label: c.label ?? undefined,
      materialCategoryCode: c.categoryCode ?? undefined,
      sourceEquipment: { id: c.sourceAssetId, name: '', parentEquipmentId: null, floorId: null },
      targetEquipment: { id: c.targetAssetId, name: '', parentEquipmentId: null, floorId: null },
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

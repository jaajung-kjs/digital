import { useEffect } from 'react';
import { useTraceGraph } from '../trace/traceGraph';
import { usePathHighlightStore } from '../pathTrace/stores/pathHighlightStore';
import { useSelectionStore } from './selectionStore';
import { useAssetDiagram } from '../connections/hooks/useAssetConnections';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { useEditorStore } from '../editor/stores/editorStore';
import { FEEDER_INPUT_CORE } from '../power/powerRegisterDescriptor';
import { projectTrace } from '../trace/traceProjection';
import { expandToPlacedIds } from '../pathTrace/stores/pathHighlightStore';
import type { TraceGraph } from '../trace/traceGraph';
import type { DiagramComponent } from '../connections/connectionDiagram';
import type { Asset } from '../../types/asset';

type CableLike = { id: string; sourceAssetId?: string | null; targetAssetId?: string | null; sourceRole?: string | null; targetRole?: string | null; number?: number | null };

/**
 * (자산, 코어) → 하이라이트 seed 케이블 한 개.
 * - core 센티넬(0=FEEDER_INPUT_CORE) → 그 자산의 IN 케이블(피더 입력).
 * - core 숫자 → 그 자산에 닿는 number===core 케이블(슬롯 OUT코어 / 피더 OUT분기 통일).
 * - core null → 그 자산에 닿는 대표 케이블(자산 전체 연결 하이라이트).
 * 매칭 없으면 null.
 */
export function resolveSelectedCable(
  assetId: string | null,
  core: number | null,
  cables: CableLike[],
): string | null {
  if (!assetId) return null;
  const roleAt = (c: CableLike) => (c.sourceAssetId === assetId ? c.sourceRole : c.targetRole) ?? null;
  const touching = cables.filter((c) => c.sourceAssetId === assetId || c.targetAssetId === assetId);
  if (core === FEEDER_INPUT_CORE) return touching.find((c) => roleAt(c) === 'IN')?.id ?? null;
  if (core != null) return touching.find((c) => (c.number ?? null) === core)?.id ?? null;
  return touching[0]?.id ?? null;
}

/**
 * 선택 → 하이라이트 동작 결정(순수). 연결탭이 보여주는 *바로 그 컴포넌트* 를
 * 도면에 칠하기 위해, 해소된 케이블이 속한 연결도 컴포넌트를 찾아 그대로 하이라이트한다.
 * 결과는 resolveSelection 을 거쳐 useSelectionHighlight → setHighlight 로 파생 캐시에 기록된다
 * (diagram 분기는 projectTrace 재추적 없이 컴포넌트 그대로 — 연결탭 트리와 1:1).
 * - diagram: (asset,core)→케이블→그 케이블이 속한 컴포넌트. 없으면 core===comp.core 매칭.
 * - trace: 컴포넌트엔 못 들지만 케이블은 있는 경우(연결도 범위 밖) 단일 추적 폴백.
 * - clear: 자산/케이블 없음.
 */
export type HighlightAction =
  | { kind: 'diagram'; comp: DiagramComponent }
  | { kind: 'trace'; cableId: string }
  | { kind: 'clear' };

export function resolveHighlight(
  assetId: string | null,
  core: number | null,
  /** 연결탭이 정확 지목한 컴포넌트 시드(있으면 최우선) — core-null 다중 컴포넌트 유일 구분. */
  anchorCableId: string | null,
  cables: CableLike[],
  components: DiagramComponent[],
): HighlightAction {
  if (!assetId) return { kind: 'clear' };
  // 1) 정확 지목: 시드(또는 소속) 케이블로 컴포넌트 1개 확정.
  if (anchorCableId) {
    const exact = components.find((c) => c.seedCableId === anchorCableId)
      ?? components.find((c) => c.cableIds.includes(anchorCableId));
    if (exact) return { kind: 'diagram', comp: exact };
  }
  // 2) (자산,코어) → 해소 케이블 → 그 케이블이 속한 컴포넌트.
  const cableId = resolveSelectedCable(assetId, core, cables);
  if (cableId) {
    const byCable = components.find((c) => c.cableIds.includes(cableId));
    if (byCable) return { kind: 'diagram', comp: byCable };
  }
  if (core != null) {
    const byCore = components.find((c) => c.core === core);
    if (byCore) return { kind: 'diagram', comp: byCore };
  }
  if (cableId) return { kind: 'trace', cableId };
  return { kind: 'clear' };
}

/**
 * 선택(selectedAssetId, selectedCore) → 하이라이트 파생. 워크스페이스에서 1회 마운트.
 * per-panel startTrace 를 대체하는 단일 소스 — 그리드/포트/연결탭 어디서 선택해도
 * 연결탭이 보여주는 동일 컴포넌트가 도면에 칠해진다.
 */
export function useSelectionHighlight(): void {
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const selectedCore = useSelectionStore((s) => s.selectedCore);
  const selectedCableId = useSelectionStore((s) => s.selectedCableId);
  const { graph } = useTraceGraph();
  const { groups } = useAssetDiagram(selectedAssetId ?? '');
  useEffect(() => {
    if (!graph) return;
    const components = groups.flatMap((g) => g.components);
    const effAssets = useSubstationWorkingCopy.getState().effectiveAssets() as Asset[];
    const r = resolveSelection(selectedAssetId, selectedCore, selectedCableId, graph, components, effAssets);
    const hi = usePathHighlightStore.getState();
    if (r.kind === 'connection') {
      const prev = hi.tracingCableId;
      hi.setHighlight({ cableId: r.cableId, nodeIds: r.nodeIds, placedIds: r.placedIds, cableIds: r.cableIds });
      if (prev !== r.cableId) useEditorStore.getState().bumpFocusTick();
    } else {
      // kind==='asset'(자산만 선택) 또는 kind==='none' — 자산 선택은 경로 하이라이트를 띄우지 않는다(설계상).
      hi.clearHighlight();
    }
  }, [selectedAssetId, selectedCore, selectedCableId, groups, graph]);
}

export type ResolvedSelection =
  | { kind: 'connection'; cableId: string; nodeIds: Set<string>; placedIds: Set<string>; cableIds: Set<string> }
  | { kind: 'asset'; assetId: string }
  | { kind: 'none' };

/** 케이블 → (자산, core) 역매핑. 보는 자산(viewedAssetId)이 끝단이면 그쪽 우선, 아니면 source 끝단. */
export function cableToAddress(
  cableId: string,
  viewedAssetId: string | null,
  graph: TraceGraph,
): { assetId: string; core: number | null } | null {
  const c = (graph.cables as CableLike[]).find((x) => x.id === cableId);
  if (!c) return null;
  const pick = (id?: string | null, role?: string | null, number?: number | null) =>
    id ? { assetId: id, core: role === 'IN' ? FEEDER_INPUT_CORE : (number ?? null) } : null;
  if (viewedAssetId && c.targetAssetId === viewedAssetId) return pick(c.targetAssetId, c.targetRole, c.number);
  if (viewedAssetId && c.sourceAssetId === viewedAssetId) return pick(c.sourceAssetId, c.sourceRole, c.number);
  return pick(c.sourceAssetId, c.sourceRole, c.number);
}

export function resolveSelection(
  assetId: string | null,
  core: number | null,
  anchorCableId: string | null,
  graph: TraceGraph,
  components: DiagramComponent[],
  effectiveAssets: Asset[],
): ResolvedSelection {
  if (!assetId) return { kind: 'none' };
  // 구체적 연결 신호가 없으면(core·anchor 둘 다 없음) 자산 선택일 뿐 — 경로 하이라이트/카메라 없음.
  if (core == null && !anchorCableId) return { kind: 'asset', assetId };
  const cables = (graph.cables ?? []) as CableLike[];
  const action = resolveHighlight(assetId, core, anchorCableId, cables, components);
  if (action.kind === 'diagram') {
    const nodeIds = new Set(action.comp.nodeIds);
    return {
      kind: 'connection',
      cableId: action.comp.seedCableId,
      nodeIds,
      placedIds: expandToPlacedIds(nodeIds, effectiveAssets),
      cableIds: new Set(action.comp.cableIds),
    };
  }
  if (action.kind === 'trace') {
    const projection = projectTrace(action.cableId, graph);
    if (projection) {
      const nodeIds = new Set(projection.nodeIds);
      return {
        kind: 'connection',
        cableId: action.cableId,
        nodeIds,
        placedIds: expandToPlacedIds(nodeIds, effectiveAssets),
        cableIds: new Set(projection.cableIds),
      };
    }
  }
  return { kind: 'asset', assetId };
}

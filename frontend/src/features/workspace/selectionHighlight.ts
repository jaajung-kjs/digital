import { useEffect } from 'react';
import { useTraceGraph } from '../trace/traceGraph';
import { usePathHighlightStore } from '../pathTrace/stores/pathHighlightStore';
import { useSelectionStore } from './selectionStore';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { FEEDER_INPUT_CORE } from '../power/powerRegisterDescriptor';
import { projectTrace } from '../trace/traceProjection';
import { roleAt } from '../cables/cableEndpoint';
import { expandToPlacedIds } from '../pathTrace/stores/pathHighlightStore';
import type { TraceGraph } from '../trace/traceGraph';
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
  const touching = cables.filter((c) => c.sourceAssetId === assetId || c.targetAssetId === assetId);
  if (core === FEEDER_INPUT_CORE) return touching.find((c) => roleAt(c, assetId) === 'IN')?.id ?? null;
  if (core != null) return touching.find((c) => (c.number ?? null) === core)?.id ?? null;
  return touching[0]?.id ?? null;
}

/**
 * 선택(selectedAssetId, selectedCore, selectedCableId) → 하이라이트 파생. 워크스페이스에서 1회 마운트.
 * 단일 소스 — 그리드/포트/연결탭 어디서 선택해도 **선택 케이블을 projectTrace 로 추적한 그 결과**를
 * 도면에 칠한다(경로뷰 CablePathTree 와 완전히 같은 추적 결과 → 표시·하이라이트 항상 일치).
 */
export function useSelectionHighlight(): void {
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const selectedCore = useSelectionStore((s) => s.selectedCore);
  const selectedCableId = useSelectionStore((s) => s.selectedCableId);
  const { graph } = useTraceGraph();
  useEffect(() => {
    if (!graph) return;
    const effAssets = useSubstationWorkingCopy.getState().effectiveAssets() as Asset[];
    const r = resolveSelection(selectedAssetId, selectedCore, selectedCableId, graph, effAssets);
    const hi = usePathHighlightStore.getState();
    if (r.kind === 'connection') {
      hi.setHighlight({ cableId: r.cableId, nodeIds: r.nodeIds, placedIds: r.placedIds, cableIds: r.cableIds });
    } else {
      // 자산만 선택(연결 신호 없음) 또는 선택 없음 — 경로 하이라이트 없음(설계상).
      hi.clearHighlight();
    }
  }, [selectedAssetId, selectedCore, selectedCableId, graph]);
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

/**
 * 선택 → 하이라이트 파생(순수). 선택 케이블(anchor 또는 (자산,코어)로 해소)을 projectTrace 로
 * 추적해 그 회로의 nodeIds/cableIds 를 칠한다. 연결 신호 없으면(core·anchor 둘 다 없음) 자산 선택일 뿐.
 */
export function resolveSelection(
  assetId: string | null,
  core: number | null,
  anchorCableId: string | null,
  graph: TraceGraph,
  effectiveAssets: Asset[],
): ResolvedSelection {
  if (!assetId) return { kind: 'none' };
  if (core == null && !anchorCableId) return { kind: 'asset', assetId };
  const cables = (graph.cables ?? []) as CableLike[];
  const cableId = anchorCableId ?? resolveSelectedCable(assetId, core, cables);
  if (!cableId) return { kind: 'asset', assetId };
  const projection = projectTrace(cableId, graph);
  if (!projection) return { kind: 'asset', assetId };
  const nodeIds = new Set(projection.nodeIds);
  return {
    kind: 'connection',
    cableId,
    nodeIds,
    placedIds: expandToPlacedIds(nodeIds, effectiveAssets),
    cableIds: new Set(projection.cableIds),
  };
}

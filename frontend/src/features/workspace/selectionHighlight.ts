import { useEffect } from 'react';
import { useTraceGraph } from '../trace/traceGraph';
import { usePathHighlightStore } from '../pathTrace/stores/pathHighlightStore';
import { useSelectionStore } from './selectionStore';
import { FEEDER_INPUT_CORE } from '../power/powerRegisterDescriptor';
import type { TraceGraph } from '../trace/traceGraph';

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
 * 선택(selectedAssetId, selectedCore) → 하이라이트 파생. 워크스페이스에서 1회 마운트.
 * per-panel startTrace 를 대체하는 단일 소스 — 어느 뷰/탭에서 선택해도 동일 하이라이트.
 */
export function useSelectionHighlight(): void {
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const selectedCore = useSelectionStore((s) => s.selectedCore);
  const { graph } = useTraceGraph();
  useEffect(() => {
    const cables = ((graph as TraceGraph | null)?.cables ?? []) as CableLike[];
    const id = resolveSelectedCable(selectedAssetId, selectedCore, cables);
    const hi = usePathHighlightStore.getState();
    if (id) hi.startTrace(id);
    else hi.clearHighlight();
  }, [selectedAssetId, selectedCore, graph]);
}

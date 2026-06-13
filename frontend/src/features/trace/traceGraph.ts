import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { cableTrace, type TraceAsset, type TraceCable } from './cableTrace';

/** 전 변전소 slim asset DTO (백엔드 GET /api/assets). */
export interface SlimAssetDTO {
  id: string;
  name: string;
  substationId: string;
  substationName: string | null;
  parentAssetId: string | null;
  connectionKind: 'distributor' | 'conduit' | null;
  code: string | null;
}

/** trace 입력에 필요한 cable 필드만(전역 DTO / 로컬 staged 공통). */
export interface TraceCableInput {
  id: string;
  cableType?: string | null;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  number?: number | null;
}

export interface TraceGraph {
  assets: TraceAsset[];
  cables: TraceCable[];
  /** 표시용 자산 이름 해소(전역+로컬). */
  nameById: Map<string, string>;
  /** 자산 id → 그 자산이 속한 변전소 이름(대국 섹션 헤더용). */
  subNameById: Map<string, string>;
}

const ASSET_KEYS = { all: ['assets-slim'] as const };
const CABLE_KEYS = { all: ['cables'] as const };

/** 전 변전소 slim assets 캐시 fetch (React 밖 소비처용). */
export function fetchAllSlimAssetsCached(qc: QueryClient): Promise<SlimAssetDTO[]> {
  return qc.fetchQuery({
    queryKey: ASSET_KEYS.all,
    staleTime: 30_000,
    queryFn: async () => (await api.get<{ data: SlimAssetDTO[] }>('/assets')).data.data,
  });
}

const toTraceCable = (c: TraceCableInput): TraceCable => ({
  id: c.id,
  cableType: c.cableType ?? null,
  sourceAssetId: c.sourceAssetId ?? null,
  targetAssetId: c.targetAssetId ?? null,
  sourceRole: c.sourceRole ?? null,
  targetRole: c.targetRole ?? null,
  number: c.number ?? null,
});

/**
 * 전역(slim assets + cables) 위에 이 변전소 staged 변경을 오버레이해 cableTrace 입력 그래프를 만든다.
 * 순수 함수. (deletes 제거 → 이 변전소 id 는 staged 로 교체 → 임시 id staged-create 추가.)
 */
export function buildTraceGraph(input: {
  slimAssets: SlimAssetDTO[];
  globalCables: TraceCableInput[];
  stagedAssets: { id: string; assetType?: { connectionKind?: string | null } | null; name?: string }[];
  stagedCables: TraceCableInput[];
  deletes: string[];
}): TraceGraph {
  const deleted = new Set(input.deletes);

  // ── cables ──
  const stagedCableById = new Map(input.stagedCables.map((c) => [c.id, c]));
  const mergedCables: TraceCableInput[] = input.globalCables
    .filter((c) => !deleted.has(c.id))
    .map((c) => stagedCableById.get(c.id) ?? c);
  const seenC = new Set(mergedCables.map((c) => c.id));
  for (const c of input.stagedCables) {
    if (!seenC.has(c.id) && !deleted.has(c.id)) mergedCables.push(c);
  }

  // ── assets ──
  const stagedAssetById = new Map(input.stagedAssets.map((a) => [a.id, a]));
  const nameById = new Map<string, string>();
  const subNameById = new Map<string, string>();
  const assetById = new Map<string, TraceAsset>();
  for (const a of input.slimAssets) {
    if (deleted.has(a.id)) continue;
    const staged = stagedAssetById.get(a.id);
    assetById.set(a.id, {
      id: a.id,
      connectionKind: staged
        ? ((staged.assetType?.connectionKind ?? null) as TraceAsset['connectionKind'])
        : a.connectionKind,
    });
    nameById.set(a.id, (staged?.name ?? a.name));
    if (a.substationName) subNameById.set(a.id, a.substationName);
  }
  // 주의: staged-create 자산은 substationName 을 안 들고 온다(effectiveAssets 는 substationId 만).
  // → subNameById 미설정. P3a 는 커밋된 OFD/슬롯(global slim 피드에 substationName 있음)만 다루므로 무방.
  // staged 슬롯 생성(P6 자동생성)이 들어오면 그때 substationName 을 스레드한다.
  for (const a of input.stagedAssets) {
    if (assetById.has(a.id) || deleted.has(a.id)) continue;
    assetById.set(a.id, { id: a.id, connectionKind: (a.assetType?.connectionKind ?? null) as TraceAsset['connectionKind'] });
    if (a.name) nameById.set(a.id, a.name);
  }

  return { assets: [...assetById.values()], cables: mergedCables.map(toTraceCable), nameById, subNameById };
}

/**
 * start(설비) 에서 cableType 'FIBER' 로 trace → 도달한 passive(설비) 노드 중 자신 제외 id 들.
 * = 대국측 설비. 이름 해소는 호출측이 graph.nameById 로.
 */
export function traceRemoteEndpoints(startAssetId: string, graph: TraceGraph, cableType = 'FIBER'): string[] {
  const kindOf = new Map(graph.assets.map((a) => [a.id, a.connectionKind ?? null]));
  const r = cableTrace(startAssetId, cableType, graph.assets, graph.cables);
  // kindOf.has(id) 로 존재 여부를 확인 — 삭제된 자산은 graph.assets 에서 이미 빠졌으므로
  // kindOf 에 없어야 정상. undefined → null 로 떨어지는 false positive 를 막는다.
  return r.nodeIds.filter((id) => id !== startAssetId && kindOf.has(id) && (kindOf.get(id) ?? null) === null);
}

/**
 * 한 슬롯(conduit)의 대국 변전소 이름 — 슬롯의 OPGW(IN-IN FIBER) → twin 슬롯 → 그 substationName.
 */
export function remoteSlotSubstation(slotId: string, graph: TraceGraph, cableType = 'FIBER'): string | null {
  const opgw = graph.cables.find(
    (c) => c.cableType === cableType && c.sourceRole === 'IN' && c.targetRole === 'IN'
      && (c.sourceAssetId === slotId || c.targetAssetId === slotId),
  );
  if (!opgw) return null;
  const twin = opgw.sourceAssetId === slotId ? opgw.targetAssetId : opgw.sourceAssetId;
  return twin ? (graph.subNameById.get(twin) ?? null) : null;
}

/**
 * React 훅 — 전역 피드 + 이 변전소 staged 오버레이로 TraceGraph 를 만든다.
 * React Query 가 fetch 를 dedupe. 이 변전소 staged 변경(overlay 슬라이스)을 구독해 재계산.
 */
export function useTraceGraph(): { graph: TraceGraph | null; isLoading: boolean } {
  const slimQ = useQuery({
    queryKey: ASSET_KEYS.all,
    staleTime: 30_000,
    queryFn: async () => (await api.get<{ data: SlimAssetDTO[] }>('/assets')).data.data,
  });
  const cableQ = useQuery({
    queryKey: CABLE_KEYS.all,
    staleTime: 30_000,
    queryFn: async () => (await api.get<{ data: TraceCableInput[] }>('/cables')).data.data,
  });
  // 이 변전소 staged 변경 구독(overlay/saved 슬라이스 ref 변경 시 재계산 트리거).
  const overlayCables = useSubstationWorkingCopy((s) => s.overlays.cables);
  const savedCables = useSubstationWorkingCopy((s) => s.saved.cables);
  const overlayAssets = useSubstationWorkingCopy((s) => s.overlays.assets);
  const savedAssets = useSubstationWorkingCopy((s) => s.saved.assets);
  void savedCables; void savedAssets; // 구독 트리거용(값은 getState 로 읽음)

  const isLoading = slimQ.isLoading || cableQ.isLoading;
  if (!slimQ.data || !cableQ.data) return { graph: null, isLoading };

  const wc = useSubstationWorkingCopy.getState();
  const graph = buildTraceGraph({
    slimAssets: slimQ.data,
    globalCables: cableQ.data,
    stagedAssets: wc.effectiveAssets() as never[],
    stagedCables: wc.effectiveCables() as unknown as TraceCableInput[],
    deletes: [...overlayCables.deletes, ...overlayAssets.deletes],
  });
  return { graph, isLoading };
}

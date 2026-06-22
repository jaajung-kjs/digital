import { useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { QUERY_STALE_MS } from '../../lib/queryClient';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { useOrganizationStore } from '../../stores/organizationStore';
import { cableTrace, type TraceAsset, type TraceCable } from './cableTrace';

interface NameNode { id: string; name: string; children?: NameNode[] }

/** org 트리(roots) 전체를 id→name 맵으로 수집(재귀). staged 변전소명 해소의 단일 소스. */
export function collectNodeNames(roots: NameNode[], out = new Map<string, string>()): Map<string, string> {
  for (const n of roots) {
    out.set(n.id, n.name);
    if (n.children?.length) collectNodeNames(n.children, out);
  }
  return out;
}

/** 전 변전소 slim asset DTO (백엔드 GET /api/assets). */
export interface SlimAssetDTO {
  id: string;
  name: string;
  substationId: string;
  substationName: string | null;
  parentAssetId: string | null;
  connectionKind: 'distributor' | 'conduit' | null;
  code: string | null;
  slotIndex: number | null;
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
  specParams?: Record<string, unknown> | null;
  categoryName?: string | null;
  categoryId?: string | null;
  displayColor?: string | null;
}

export interface TraceGraph {
  assets: TraceAsset[];
  cables: TraceCable[];
  /** 표시용 자산 이름 해소(전역+로컬). */
  nameById: Map<string, string>;
  /** 자산 id → 그 자산이 속한 변전소 이름(대국 섹션 헤더용). */
  subNameById: Map<string, string>;
  /** 자산 id → 그 자산이 속한 substationId(변전소 스코프 판정용). */
  subById: Map<string, string>;
  /** 자산 id → parentAssetId(슬롯→OFD 접기용). */
  parentById: Map<string, string | null>;
  /** 자산 id → assetType code(OFD 판별 'OFD'). */
  codeById: Map<string, string | null>;
  /** 자산 id → OFD 내 슬롯 위치(경로슬롯 -N 순번 파생용). */
  slotIndexById: Map<string, number | null>;
}

const ASSET_KEYS = { all: ['assets-slim'] as const };
const CABLE_KEYS = { all: ['cables'] as const };

/** 전 변전소 slim assets 캐시 fetch (React 밖 소비처용). */
export function fetchAllSlimAssetsCached(qc: QueryClient): Promise<SlimAssetDTO[]> {
  return qc.fetchQuery({
    queryKey: ASSET_KEYS.all,
    staleTime: QUERY_STALE_MS,
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
  specParams: c.specParams ?? null,
  categoryName: c.categoryName ?? null,
  categoryId: c.categoryId ?? null,
  displayColor: c.displayColor ?? null,
});

/**
 * 전역(slim assets + cables) 위에 이 변전소 staged 변경을 오버레이해 cableTrace 입력 그래프를 만든다.
 * 순수 함수. (deletes 제거 → 이 변전소 id 는 staged 로 교체 → 임시 id staged-create 추가.)
 */
export function buildTraceGraph(input: {
  slimAssets: SlimAssetDTO[];
  globalCables: TraceCableInput[];
  stagedAssets: { id: string; substationId?: string | null; parentAssetId?: string | null; assetType?: { connectionKind?: string | null; code?: string | null } | null; name?: string }[];
  stagedCables: TraceCableInput[];
  deletes: string[];
  /**
   * 변전소 id → 이름 (전 본부 org 트리 전체). staged 자산의 변전소명을 이 한 맵으로 해소한다.
   * slim 역추론·단일 currentSubName 폴백을 대체 — 커밋 여부·현재 변전소와 무관하게 항상 해소.
   */
  substationNames?: Map<string, string>;
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
  const subById = new Map<string, string>();
  const parentById = new Map<string, string | null>();
  const codeById = new Map<string, string | null>();
  const slotIndexById = new Map<string, number | null>();
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
    subById.set(a.id, a.substationId);
    parentById.set(a.id, a.parentAssetId ?? null);
    codeById.set(a.id, a.code ?? null);
    slotIndexById.set(a.id, a.slotIndex ?? null);
  }
  // staged-create 자산은 substationName 을 안 들고 온다(substationId 만).
  // → substationId 로 org 트리 전체 맵(substationNames)에서 이름 해소. 커밋 여부·현재 변전소와
  //   무관하게 항상 해소되므로 저장 전에도 자국/대국 슬롯명·피더 파생 GUI 가 완성된다.
  for (const a of input.stagedAssets) {
    if (assetById.has(a.id) || deleted.has(a.id)) continue;
    assetById.set(a.id, { id: a.id, connectionKind: (a.assetType?.connectionKind ?? null) as TraceAsset['connectionKind'] });
    if (a.name) nameById.set(a.id, a.name);
    const sa = a as { parentAssetId?: string | null; assetType?: { code?: string | null } | null };
    if (!parentById.has(a.id)) parentById.set(a.id, sa.parentAssetId ?? null);
    if (!codeById.has(a.id)) codeById.set(a.id, sa.assetType?.code ?? null);
    if (!slotIndexById.has(a.id)) slotIndexById.set(a.id, (a as { slotIndex?: number | null }).slotIndex ?? null);
    const subId = (a as { substationId?: string | null }).substationId ?? null;
    if (subId) {
      if (!subById.has(a.id)) subById.set(a.id, subId);
      if (!subNameById.has(a.id)) {
        const sname = input.substationNames?.get(subId) ?? null;
        if (sname) subNameById.set(a.id, sname);
      }
    }
  }

  return { assets: [...assetById.values()], cables: mergedCables.map(toTraceCable), nameById, subNameById, subById, parentById, codeById, slotIndexById };
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
    staleTime: QUERY_STALE_MS,
    queryFn: async () => (await api.get<{ data: SlimAssetDTO[] }>('/assets')).data.data,
  });
  const cableQ = useQuery({
    queryKey: CABLE_KEYS.all,
    staleTime: QUERY_STALE_MS,
    queryFn: async () => (await api.get<{ data: TraceCableInput[] }>('/cables')).data.data,
  });
  // 이 변전소 staged 변경 구독(overlay/saved 슬라이스 ref 변경 시 재계산 트리거).
  const overlayCables = useSubstationWorkingCopy((s) => s.overlays.cables);
  const savedCables = useSubstationWorkingCopy((s) => s.saved.cables);
  const overlayAssets = useSubstationWorkingCopy((s) => s.overlays.assets);
  const savedAssets = useSubstationWorkingCopy((s) => s.saved.assets);
  void savedCables; void savedAssets; // 구독 트리거용(값은 getState 로 읽음)
  // staged 자산 변전소명 해소 — org 트리(전 본부) 전체 id→name 맵. 단일 소스, 폴백 없음.
  const roots = useOrganizationStore((s) => s.roots);
  const substationNames = useMemo(() => collectNodeNames(roots), [roots]);

  const isLoading = slimQ.isLoading || cableQ.isLoading;
  if (!slimQ.data || !cableQ.data) return { graph: null, isLoading };

  const wc = useSubstationWorkingCopy.getState();
  const graph = buildTraceGraph({
    slimAssets: slimQ.data,
    globalCables: cableQ.data,
    stagedAssets: wc.effectiveAssets() as never[],
    stagedCables: wc.effectiveCables() as unknown as TraceCableInput[],
    deletes: [...overlayCables.deletes, ...overlayAssets.deletes],
    substationNames,
  });
  return { graph, isLoading };
}

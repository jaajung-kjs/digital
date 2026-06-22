import { useMemo } from 'react';
import { useEffectiveAssets, useEffectiveCables } from '../workingCopy/hooks';
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
 * effective(=saved∪overlay−deletes) 단일 배열로 cableTrace 입력 그래프를 만든다. 순수 함수.
 * 자산은 완전한 Asset 형태(assetType 중첩). 변전소명은 substationNames(org 트리 전체 맵)로만 해소
 * — slim 역추론·staged 분기·폴백 체인 없음(단일 SSOT).
 */
export function buildTraceGraph(input: {
  assets: { id: string; name?: string; substationId?: string | null; parentAssetId?: string | null; slotIndex?: number | null; assetType?: { connectionKind?: string | null; code?: string | null } | null }[];
  cables: TraceCableInput[];
  /** 변전소 id → 이름 (전 본부 org 트리 전체). 모든 자산 변전소명의 단일 소스. */
  substationNames?: Map<string, string>;
}): TraceGraph {
  const nameById = new Map<string, string>();
  const subNameById = new Map<string, string>();
  const subById = new Map<string, string>();
  const parentById = new Map<string, string | null>();
  const codeById = new Map<string, string | null>();
  const slotIndexById = new Map<string, number | null>();
  const assetById = new Map<string, TraceAsset>();

  for (const a of input.assets) {
    assetById.set(a.id, { id: a.id, connectionKind: (a.assetType?.connectionKind ?? null) as TraceAsset['connectionKind'] });
    if (a.name != null) nameById.set(a.id, a.name);
    parentById.set(a.id, a.parentAssetId ?? null);
    codeById.set(a.id, a.assetType?.code ?? null);
    slotIndexById.set(a.id, a.slotIndex ?? null);
    const subId = a.substationId ?? null;
    if (subId) {
      subById.set(a.id, subId);
      const sname = input.substationNames?.get(subId) ?? null;
      if (sname) subNameById.set(a.id, sname);
    }
  }

  return { assets: [...assetById.values()], cables: input.cables.map(toTraceCable), nameById, subNameById, subById, parentById, codeById, slotIndexById };
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

/** 자산 참조(드롭다운·피커 공용) — 그래프가 단일 소스(slim+staged 병합). */
export interface AssetRef { id: string; name: string; substationId: string | null; substationName: string | null }

function toRef(graph: TraceGraph, id: string): AssetRef {
  return {
    id,
    name: graph.nameById.get(id) ?? id,
    substationId: graph.subById.get(id) ?? null,
    substationName: graph.subNameById.get(id) ?? null,
  };
}

/** 그래프의 모든 OFD 자산(커밋+스테이징). 경로 대국 후보·자국 OFD 해소 단일 소스. */
export function ofdAssets(graph: TraceGraph): AssetRef[] {
  return graph.assets.filter((a) => graph.codeById.get(a.id) === 'OFD').map((a) => toRef(graph, a.id));
}

/** 한 변전소의 '설비' 후보 — OFD·conduit(통로) 제외(커밋+스테이징). 선번장 자국/대국 드롭다운 단일 소스. */
export function equipmentInSubstation(graph: TraceGraph, substationId: string | null): AssetRef[] {
  if (!substationId) return [];
  return graph.assets
    .filter((a) => graph.subById.get(a.id) === substationId
      && graph.codeById.get(a.id) !== 'OFD'
      && a.connectionKind !== 'conduit')
    .map((a) => toRef(graph, a.id));
}

/**
 * React 훅 — effective(전역 saved∪overlay−deletes) 단일 소스로 TraceGraph 를 만든다.
 * 피드는 useHydrateGlobal 이 saved 로 hydrate(피드 직접 읽지 않음). effective 슬라이스 변경 시 재계산.
 */
export function useTraceGraph(): { graph: TraceGraph; isLoading: boolean } {
  const assets = useEffectiveAssets();
  const cables = useEffectiveCables() as unknown as TraceCableInput[];
  const roots = useOrganizationStore((s) => s.roots);
  const substationNames = useMemo(() => collectNodeNames(roots), [roots]);
  const graph = useMemo(
    () => buildTraceGraph({ assets, cables, substationNames }),
    [assets, cables, substationNames],
  );
  return { graph, isLoading: false };
}

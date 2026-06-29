/**
 * useServerTrace — POST /api/trace 응답으로 작은 TraceGraph 를 만드는 React Query 훅.
 *
 * 서버가 반환하는 연결 component(nodes/cables)를 buildTraceGraph 에 그대로 넘겨
 * 기존 projectTrace / traceRemoteEndpoints 가 변경 없이 동작하는 TraceGraph 를 반환한다.
 *
 * overlay: 클라이언트 워킹카피의 staged delta(케이블 creates/updates/deletes + 자산 역할)를
 * 직렬화해 서버에 보내 what-if 트레이스를 지원한다. overlayHash 는 staged delta 가 바뀔 때만
 * react-query 캐시 키를 무효화하도록 안정 해시 역할을 한다.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { isTempId } from '../../utils/idHelpers';
import { buildTraceGraph, collectNodeNames, type TraceGraph } from './traceGraph';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import type { AssetsOverlay, CablesOverlay } from '../workingCopy/substationStore';
import {
  useEffectiveAssets,
  useEffectiveOrgTree,
  getEffectiveAssetsSnapshot,
  getOrgNodeNames,
} from '../workingCopy/hooks';
import type { Asset } from '../../types/asset';

// ─── 서버 응답 타입 ─────────────────────────────────────────────────────────

/** POST /api/trace 응답 노드(trace.service.ts TraceNode 와 동형). */
interface ServerTraceNode {
  id: string;
  name: string;
  role: string | null;
  parentAssetId: string | null;
  substationId: string;
  substationName: string | null;
  /** OFD 내 슬롯 위치 — 선번장 fiberSlotLabel 정렬 보존(null=미설정). */
  slotIndex: number | null;
}

/** POST /api/trace 응답 케이블(TraceCable 와 동형). */
interface ServerTraceCable {
  id: string;
  groupId?: string | null;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  number?: number | null;
  specParams?: Record<string, unknown> | null;
  categoryId?: string | null;
}

interface ServerTraceResponse {
  nodeIds: string[];
  cableIds: string[];
  cables: ServerTraceCable[];
  nodes: ServerTraceNode[];
  truncated: boolean;
}

// ─── 오버레이 추출 ───────────────────────────────────────────────────────────

/**
 * 그룹에 속한 staged 케이블 delta + staged 자산 역할 변경을 서버 overlay 형식으로 변환한다.
 *
 * groupId 필터: staged creates/updates/deletes 중 categoryId 가 해당 그룹의 카테고리인 것만.
 * 단 클라이언트 측에서 카테고리→그룹 역방향 조회가 복잡하므로, 클라이언트는 그룹 소속 케이블에
 * groupId 를 직접 붙이지 않는다. 대신 전체 staged cables delta 를 그대로 보내고
 * 서버(trace.service)가 자신이 조회한 그룹 카테고리 범위 안에서만 머지한다.
 *
 * assets: staged creates/updates 중 role 이 있는 것만(traceEndpoint 역할 오버라이드용).
 * staged deletes 는 서버 response nodes 에 이미 반영 불필요(서버가 committed 만 봄).
 */
export function buildTraceOverlay(overlays: { cables: CablesOverlay; assets: AssetsOverlay }) {
  const { cables, assets } = overlays;

  // ── cables delta → 서버 overlay.cables 형식 ────────────────────────────────
  const cableCreates = Object.entries(cables.creates).map(([tempId, c]) => {
    const cable = c as Record<string, unknown>;
    return {
      tempId,
      sourceAssetId: (cable.sourceAssetId as string | null | undefined) ?? null,
      targetAssetId: (cable.targetAssetId as string | null | undefined) ?? null,
      sourceRole: (cable.sourceRole as 'IN' | 'OUT' | null | undefined) ?? null,
      targetRole: (cable.targetRole as 'IN' | 'OUT' | null | undefined) ?? null,
      number: (cable.number as number | null | undefined) ?? null,
      categoryId: (cable.categoryId as string | null | undefined) ?? null,
      specParams: (cable.specParams as Record<string, unknown> | null | undefined) ?? undefined,
    };
  });

  const cableUpdates = Object.entries(cables.updates)
    .filter(([id]) => !Object.prototype.hasOwnProperty.call(cables.creates, id)) // creates 에 이미 있으면 redundant
    .map(([id, patch]) => {
      const p = patch as Record<string, unknown>;
      return {
        id,
        baseVersion: cables.baseVersions[id] ?? null,
        patch: {
          sourceAssetId: p.sourceAssetId as string | null | undefined,
          targetAssetId: p.targetAssetId as string | null | undefined,
          sourceRole: p.sourceRole as 'IN' | 'OUT' | null | undefined,
          targetRole: p.targetRole as 'IN' | 'OUT' | null | undefined,
          number: p.number as number | null | undefined,
          categoryId: p.categoryId as string | null | undefined,
          specParams: p.specParams as Record<string, unknown> | null | undefined,
        },
      };
    });

  // cables.deletes 는 committed(실 id)만 담는다 — 스토어 stageDelete(isTemp) 가 temp
  // create→delete 를 creates 에서 제거하고 deletes 엔 절대 넣지 않기 때문(overlay.ts).
  // 따라서 deletes vs creates(tempId 키) 교차 필터는 항상 vacuous → 제거.
  const cableDeletes = cables.deletes.map((id) => ({
    id,
    baseVersion: cables.baseVersions[id] ?? null,
  }));

  // ── assets: staged create/update 에서 role 오버라이드 수집 ───────────────────
  const assetOverrides: { id: string; role: string | null }[] = [];

  for (const [id, a] of Object.entries(assets.creates)) {
    const role = a.assetType?.role ?? null;
    assetOverrides.push({ id, role: role as string | null });
  }
  for (const [id, patch] of Object.entries(assets.updates)) {
    if (Object.prototype.hasOwnProperty.call(assets.creates, id)) continue; // creates 에 이미 반영됨
    const p = patch as Record<string, unknown>;
    // assetType 이 패치됐거나, role 직접 필드가 있으면 오버라이드
    const roleVal = (p.assetType as { role?: string | null } | null | undefined)?.role;
    if (roleVal !== undefined) {
      assetOverrides.push({ id, role: roleVal ?? null });
    }
  }

  return {
    cables: {
      creates: cableCreates,
      updates: cableUpdates,
      deletes: cableDeletes,
    },
    assets: assetOverrides,
  };
}

/**
 * 직렬화 가능한 overlay 객체를 *순서-안정적인* 해시 문자열로 변환한다.
 * staged delta 가 바뀌면 overlayHash 가 달라져 react-query 가 refetch 한다.
 *
 * 주의: 같은 내용의 overlay 라도 creates/updates/deletes/assets 의 배열 순서나 객체 키
 * 순서가 다르면 단순 JSON.stringify 는 다른 문자열을 만들어 *불필요한 refetch* 를 유발한다.
 * 따라서 (1) 각 배열을 id 기준으로 정렬하고 (2) JSON.stringify 의 replacer 로 객체 키를
 * 정렬해 동일 내용 → 동일 해시를 보장한다.
 */
export function stableHash(overlay: ReturnType<typeof buildTraceOverlay>): string {
  const { cables, assets } = overlay;
  const isEmpty =
    cables.creates.length === 0 &&
    cables.updates.length === 0 &&
    cables.deletes.length === 0 &&
    assets.length === 0;
  if (isEmpty) return '';

  const canonical = {
    cables: {
      creates: [...cables.creates].sort((a, b) => a.tempId.localeCompare(b.tempId)),
      updates: [...cables.updates].sort((a, b) => a.id.localeCompare(b.id)),
      deletes: [...cables.deletes].sort((a, b) => a.id.localeCompare(b.id)),
    },
    assets: [...assets].sort((a, b) => a.id.localeCompare(b.id)),
  };

  // replacer: 중첩 객체의 키까지 알파벳순으로 직렬화(키 순서 무관 동일 해시).
  return JSON.stringify(canonical, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (value as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return value;
  });
}

// ─── 서버 node → buildTraceGraph 입력 ───────────────────────────────────────

/**
 * 서버 TraceNode 를 buildTraceGraph 가 기대하는 asset 입력 shape 로 변환한다.
 *
 * buildTraceGraph 는 a.assetType?.role 로 role 을 읽으므로 서버의 직접 role 필드를
 * assetType 중첩으로 감싼다. slotIndex 는 서버 node select 가 함께 내려주므로 그대로
 * 전달 → slotIndexById 가 채워져 fiberSlotLabel 슬롯 순번 정렬이 전역 그래프와 동일하게
 * 보존된다(null=미설정 폴백).
 */
function nodeToAssetInput(n: ServerTraceNode) {
  return {
    id: n.id,
    name: n.name,
    substationId: n.substationId,
    parentAssetId: n.parentAssetId,
    slotIndex: n.slotIndex ?? null,
    assetType: { role: n.role },
  };
}

/**
 * 워킹카피 effective 자산을 buildTraceGraph 입력 shape 로 변환한다(staged-create backfill용).
 * 서버 nodeToAssetInput 와 동형(assetType.role/slotIndex 보존)이라 동일하게 분류·정렬된다.
 */
function effectiveAssetToInput(a: Asset) {
  return {
    id: a.id,
    name: a.name,
    substationId: a.substationId,
    parentAssetId: a.parentAssetId ?? null,
    slotIndex: a.slotIndex ?? null,
    assetType: { role: a.assetType?.role ?? null },
  };
}

/**
 * 서버 trace 응답을 작은 TraceGraph 로 변환(훅·비훅 공용 단일 소스).
 *
 * 서버 nodes[] 는 DB id 만 담는다 → staged-create 신규 자산(temp id)은 nodeIds/cables 에는
 * 있어도 nodes[] 에 없어 role=null/이름없음 으로 떨어진다(over-traversal·id 표시). 워킹카피
 * effective 자산으로 누락 노드를 보강한다(role·name 의 단일 소스는 클라이언트 working copy).
 *
 * @param effectiveAssets 워킹카피 effective 자산(누락 노드 backfill 소스). 비면 보강 없음.
 * @param orgNames 변전소 id→이름 맵(staged 자산 변전소명 해소용). 서버 substationName 보다 우선 아님(보강용).
 */
export function responseToTraceGraph(
  data: ServerTraceResponse,
  effectiveAssets?: Asset[],
  orgNames?: Map<string, string>,
): TraceGraph {
  const assets = data.nodes.map(nodeToAssetInput);

  // substationId → substationName 맵(서버 nodes 의 substationName 단일 소스).
  const substationNames = new Map<string, string>();
  for (const n of data.nodes) {
    if (n.substationId && n.substationName) {
      substationNames.set(n.substationId, n.substationName);
    }
  }

  // ── staged-create backfill: nodeIds 에는 있으나 서버 nodes[] 에 없는 자산 ──────────
  if (effectiveAssets?.length) {
    const present = new Set(data.nodes.map((n) => n.id));
    const effById = new Map(effectiveAssets.map((a) => [a.id, a]));
    for (const id of data.nodeIds) {
      if (present.has(id)) continue;
      const eff = effById.get(id);
      if (!eff) continue;
      assets.push(effectiveAssetToInput(eff));
      // 변전소명: org 트리 effective 에서 해소(있으면). 없어도 role·name 이 핵심이므로 무방.
      if (eff.substationId && !substationNames.has(eff.substationId)) {
        const sname = orgNames?.get(eff.substationId);
        if (sname) substationNames.set(eff.substationId, sname);
      }
    }
  }

  return buildTraceGraph({ assets, cables: data.cables, substationNames });
}

/**
 * POST /api/trace 를 직접 호출해 작은 TraceGraph 를 만든다(비-React 경로용).
 *
 * zustand 스토어 액션처럼 훅을 쓸 수 없는 곳(pathHighlightStore.loadProjection)에서
 * useServerTrace 와 동일한 서버 component 를 받아 projectTrace 에 넘긴다.
 * overlay 는 호출측이 buildTraceOverlay 로 만들어 넘긴다(비면 생략).
 */
export async function fetchServerTraceGraph(
  seedAssetId: string,
  groupId: string,
  overlay?: ReturnType<typeof buildTraceOverlay>,
): Promise<TraceGraph> {
  const hasOverlay = overlay && stableHash(overlay) !== '';
  const res = await api.post<{ data: ServerTraceResponse }>('/trace', {
    seedAssetId,
    groupId,
    ...(hasOverlay ? { overlay } : {}),
  });
  // 비-React 경로: 스토어 getState 스냅샷에서 effective 자산·org 이름을 읽어 staged backfill.
  return responseToTraceGraph(res.data.data, getEffectiveAssetsSnapshot(), getOrgNodeNames());
}

// ─── 훅 ─────────────────────────────────────────────────────────────────────

export interface UseServerTraceResult {
  graph: TraceGraph | null;
  isLoading: boolean;
  error: unknown;
}

/**
 * POST /api/trace 로 서버 component 를 가져와 작은 TraceGraph 로 변환한다.
 *
 * - seedAssetId: 트레이스 시작 자산(committed 실 id — temp id 면 enabled=false).
 * - groupId: 케이블 그룹 id.
 * - 반환: { graph: TraceGraph | null, isLoading, error }.
 *   graph 는 projectTrace / traceRemoteEndpoints 에 그대로 넘길 수 있다.
 */
export function useServerTrace(
  seedAssetId: string | null | undefined,
  groupId: string | null | undefined,
): UseServerTraceResult {
  // ── staged overlay 구독 ──────────────────────────────────────────────────
  // 스토어가 export 하는 오버레이 타입을 그대로 써 셀렉터를 타입체크한다(as-cast 제거).
  const cablesOverlay = useSubstationWorkingCopy((s) => s.overlays.cables);
  const assetsOverlay = useSubstationWorkingCopy((s) => s.overlays.assets);

  // ── overlay 계산(stable) ─────────────────────────────────────────────────
  const overlay = useMemo(
    () => buildTraceOverlay({ cables: cablesOverlay, assets: assetsOverlay }),
    [cablesOverlay, assetsOverlay],
  );
  const overlayHash = useMemo(() => stableHash(overlay), [overlay]);

  // overlay 가 비면 서버에 보내지 않는다.
  const overlayParam = overlayHash === '' ? undefined : overlay;

  // ── react-query ──────────────────────────────────────────────────────────
  const enabled =
    !!seedAssetId &&
    !!groupId &&
    !isTempId(seedAssetId);

  const { data, isLoading, error } = useQuery<ServerTraceResponse>({
    queryKey: ['trace', seedAssetId, groupId, overlayHash],
    queryFn: async () => {
      const res = await api.post<{ data: ServerTraceResponse }>('/trace', {
        seedAssetId,
        groupId,
        ...(overlayParam ? { overlay: overlayParam } : {}),
      });
      return res.data.data;
    },
    enabled,
  });

  // ── staged-create backfill 소스(워킹카피 effective) ────────────────────────
  const effectiveAssets = useEffectiveAssets();
  const orgTree = useEffectiveOrgTree();
  const orgNames = useMemo(() => collectNodeNames(orgTree), [orgTree]);

  // ── 서버 응답 → TraceGraph ───────────────────────────────────────────────
  const graph = useMemo<TraceGraph | null>(
    () => (data ? responseToTraceGraph(data, effectiveAssets, orgNames) : null),
    [data, effectiveAssets, orgNames],
  );

  return { graph, isLoading: enabled ? isLoading : false, error };
}

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
import { buildTraceGraph, type TraceGraph } from './traceGraph';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
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
function buildTraceOverlay(overlays: {
  cables: {
    creates: Record<string, unknown>;
    updates: Record<string, unknown>;
    deletes: string[];
    baseVersions: Record<string, string>;
  };
  assets: {
    creates: Record<string, Asset>;
    updates: Record<string, Partial<Asset>>;
  };
}) {
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

  const cableDeletes = cables.deletes
    .filter((id) => !Object.prototype.hasOwnProperty.call(cables.creates, id)) // temp create → delete 는 skip
    .map((id) => ({ id, baseVersion: cables.baseVersions[id] ?? null }));

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
 * 직렬화 가능한 overlay 객체를 안정적인 해시 문자열로 변환한다.
 * staged delta 가 바뀌면 overlayHash 가 달라져 react-query 가 refetch 한다.
 */
function stableHash(overlay: ReturnType<typeof buildTraceOverlay>): string {
  const { cables, assets } = overlay;
  const isEmpty =
    cables.creates.length === 0 &&
    cables.updates.length === 0 &&
    cables.deletes.length === 0 &&
    assets.length === 0;
  if (isEmpty) return '';
  return JSON.stringify(overlay);
}

// ─── 서버 node → buildTraceGraph 입력 ───────────────────────────────────────

/**
 * 서버 TraceNode 를 buildTraceGraph 가 기대하는 asset 입력 shape 로 변환한다.
 *
 * buildTraceGraph 는 a.assetType?.role 로 role 을 읽으므로 서버의 직접 role 필드를
 * assetType 중첩으로 감싼다. slotIndex 는 서버 response 에 없으므로 null(buildTraceGraph
 * 가 slotIndexById.set(a.id, a.slotIndex ?? null) → null 으로 처리).
 * slotIndex 가 null 이면 fiberSlotLabel 정렬이 MAX_SAFE_INTEGER 폴백을 쓰는 것 외에
 * projectTrace / traceRemoteEndpoints 에는 영향이 없다.
 */
function nodeToAssetInput(n: ServerTraceNode) {
  return {
    id: n.id,
    name: n.name,
    substationId: n.substationId,
    parentAssetId: n.parentAssetId,
    slotIndex: null as null,
    assetType: { role: n.role },
  };
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
  const cablesOverlay = useSubstationWorkingCopy((s) => s.overlays.cables) as {
    creates: Record<string, unknown>;
    updates: Record<string, unknown>;
    deletes: string[];
    baseVersions: Record<string, string>;
  };
  const assetsOverlay = useSubstationWorkingCopy((s) => s.overlays.assets) as {
    creates: Record<string, Asset>;
    updates: Record<string, Partial<Asset>>;
  };

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

  // ── 서버 응답 → TraceGraph ───────────────────────────────────────────────
  const graph = useMemo<TraceGraph | null>(() => {
    if (!data) return null;

    const assets = data.nodes.map(nodeToAssetInput);

    // substationId → substationName 맵(서버 nodes 의 substationName 단일 소스).
    const substationNames = new Map<string, string>();
    for (const n of data.nodes) {
      if (n.substationId && n.substationName) {
        substationNames.set(n.substationId, n.substationName);
      }
    }

    return buildTraceGraph({ assets, cables: data.cables, substationNames });
  }, [data]);

  return { graph, isLoading: enabled ? isLoading : false, error };
}

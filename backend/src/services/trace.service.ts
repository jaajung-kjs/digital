import prisma from '../config/prisma.js';
import { cableTrace, type TraceCable, type TraceAsset } from './trace/cableTrace.js';
import type { TraceRequestInput } from '../schemas/trace.schema.js';
import type { AssetRole } from '@prisma/client';

/** 응답 노드 — 클라이언트가 slot→OFD 콜랩스에 parentAssetId 필요. */
export interface TraceNode {
  id: string;
  name: string;
  role: string | null;
  parentAssetId: string | null;
  substationId: string;
  substationName: string | null;
  /** OFD 내 슬롯 위치 — 선번장 슬롯 순번(-N) 정렬 보존용(null=미설정). */
  slotIndex: number | null;
  /** 자산이 배치된 도면 id — scope 판정 소스(미배치 시 null). */
  floorId: string | null;
}

/** trace() 응답 */
export interface TraceResponse {
  nodeIds: string[];
  cableIds: string[];
  cables: TraceCable[];
  nodes: TraceNode[];
  truncated: boolean;
}

const EMPTY_RESPONSE: TraceResponse = {
  nodeIds: [],
  cableIds: [],
  cables: [],
  nodes: [],
  truncated: false,
};

/**
 * 시드 케이블(seedCableId)로 그룹을 도출하고, committed 케이블 + 클라이언트 overlay(what-if)를
 * 병합한 뒤 cableTrace 를 실행하여 시드 케이블의 strand 컴포넌트를 반환한다.
 *
 * group→cable 경로: CableCategory.groupId → Cable.categoryId.
 * Cable 에는 groupId 컬럼이 없으므로 cableCategory 를 먼저 조회해
 * categoryId 목록을 확보한 다음 케이블을 가져온다.
 */
export async function trace(input: TraceRequestInput): Promise<TraceResponse> {
  const { seedCableId } = input;
  const overlay = input.overlay;

  // ── 1. 시드 케이블 해소 ───────────────────────────────────────────────────
  // 먼저 committed DB 에서 찾는다.
  const committedSeed = await prisma.cable.findUnique({
    where: { id: seedCableId },
    select: {
      id: true,
      sourceAssetId: true,
      targetAssetId: true,
      sourceRole: true,
      targetRole: true,
      number: true,
      categoryId: true,
      specParams: true,
      category: { select: { groupId: true } },
    },
  });

  let groupId: string | null = null;

  if (committedSeed) {
    groupId = committedSeed.category?.groupId ?? null;
  } else {
    // overlay.cables.creates 에서 tempId === seedCableId 인 행 탐색
    const stagedSeed = overlay?.cables?.creates?.find((cr) => cr.tempId === seedCableId);
    if (stagedSeed) {
      // staged 시드 케이블에 categoryId 가 없으면(null) groupId 를 도출할 수 없어 빈 결과 반환 — 설계상 의도.
      const stagedCategoryId = stagedSeed.categoryId ?? null;
      if (stagedCategoryId) {
        const cat = await prisma.cableCategory.findUnique({
          where: { id: stagedCategoryId },
          select: { groupId: true },
        });
        groupId = cat?.groupId ?? null;
      }
    }
  }

  // 시드 케이블을 찾지 못하면 빈 결과 반환
  if (!groupId) {
    return EMPTY_RESPONSE;
  }

  // ── 2. 그룹 → 카테고리 id 목록 ──────────────────────────────────────────
  const cats = await prisma.cableCategory.findMany({
    where: { groupId },
    select: { id: true },
  });
  const catIds = cats.map((c) => c.id);

  // ── 3. committed 케이블 조회 ─────────────────────────────────────────────
  const rawCables = catIds.length
    ? await prisma.cable.findMany({
        where: { categoryId: { in: catIds } },
        select: {
          id: true,
          sourceAssetId: true,
          targetAssetId: true,
          sourceRole: true,
          targetRole: true,
          number: true,
          categoryId: true,
          specParams: true,
        },
      })
    : [];

  // cableTrace 가 c.groupId === groupId 로 필터하므로 각 행에 groupId 를 달아준다.
  let mergedCables: TraceCable[] = rawCables.map((c) => ({
    id: c.id,
    groupId,
    sourceAssetId: c.sourceAssetId,
    targetAssetId: c.targetAssetId,
    sourceRole: (c.sourceRole as 'IN' | 'OUT' | null) ?? null,
    targetRole: (c.targetRole as 'IN' | 'OUT' | null) ?? null,
    number: c.number ?? null,
    categoryId: c.categoryId ?? null,
    specParams: (c.specParams as Record<string, unknown> | null) ?? null,
  }));

  // ── 4. overlay 병합 ──────────────────────────────────────────────────────
  if (overlay) {
    const { cables: delta } = overlay;

    // deletes
    if (delta.deletes.length) {
      const deleteIds = new Set(delta.deletes.map((d) => d.id));
      mergedCables = mergedCables.filter((c) => !deleteIds.has(c.id));
    }

    // updates
    if (delta.updates.length) {
      const patchMap = new Map(delta.updates.map((u) => [u.id, u.patch]));
      mergedCables = mergedCables.map((c) => {
        const patch = patchMap.get(c.id);
        if (!patch) return c;
        return {
          ...c,
          sourceAssetId: patch.sourceAssetId ?? c.sourceAssetId,
          targetAssetId: patch.targetAssetId ?? c.targetAssetId,
          sourceRole: patch.sourceRole !== undefined ? ((patch.sourceRole as 'IN' | 'OUT' | null | undefined) ?? null) : c.sourceRole,
          targetRole: patch.targetRole !== undefined ? ((patch.targetRole as 'IN' | 'OUT' | null | undefined) ?? null) : c.targetRole,
          number: patch.number !== undefined ? (patch.number ?? null) : c.number,
          categoryId: patch.categoryId !== undefined ? (patch.categoryId ?? null) : c.categoryId,
          specParams: patch.specParams !== undefined ? (patch.specParams as Record<string, unknown> | null) : c.specParams,
        };
      });
    }

    // creates — tempId を cableId として使う(DB 에 없는 가상 엣지)
    if (delta.creates.length) {
      const staged: TraceCable[] = delta.creates.map((cr) => ({
        id: cr.tempId,
        groupId,
        sourceAssetId: cr.sourceAssetId,
        targetAssetId: cr.targetAssetId,
        sourceRole: (cr.sourceRole as 'IN' | 'OUT' | null | undefined) ?? null,
        targetRole: (cr.targetRole as 'IN' | 'OUT' | null | undefined) ?? null,
        number: cr.number ?? null,
        categoryId: cr.categoryId ?? null,
        specParams: (cr.specParams as Record<string, unknown> | undefined) ?? null,
      }));
      mergedCables = [...mergedCables, ...staged];
    }
  }

  // ── 5. 시드 케이블(merged 상태)을 찾아 양끝점을 확보 ─────────────────────
  const seedCableMerged = mergedCables.find((c) => c.id === seedCableId);
  if (!seedCableMerged) {
    // 시드 케이블이 overlay.deletes 로 제거됐거나 못 찾은 경우 빈 결과
    return EMPTY_RESPONSE;
  }

  const seedEnd = seedCableMerged.sourceAssetId ?? seedCableMerged.targetAssetId;
  if (!seedEnd) {
    return EMPTY_RESPONSE;
  }

  // ── 6. 끝점 자산 역할 조회 ───────────────────────────────────────────────
  const endpointAssetIds = new Set<string>();
  for (const c of mergedCables) {
    if (c.sourceAssetId) endpointAssetIds.add(c.sourceAssetId);
    if (c.targetAssetId) endpointAssetIds.add(c.targetAssetId);
  }
  // seedEnd 도 포함(케이블이 없어도 자신 역할은 필요)
  endpointAssetIds.add(seedEnd);

  const rawAssets = await prisma.asset.findMany({
    where: { id: { in: [...endpointAssetIds] } },
    select: { id: true, assetType: { select: { role: true } } },
  });

  // role 맵: id → AssetRole | null
  const roleMap = new Map<string, AssetRole | null>(
    rawAssets.map((a) => [a.id, (a.assetType?.role ?? null) as AssetRole | null]),
  );

  // overlay.assets 역할 덮어쓰기
  if (overlay?.assets) {
    for (const oa of overlay.assets) {
      roleMap.set(oa.id, (oa.role as AssetRole | null) ?? null);
    }
  }

  const traceAssets: TraceAsset[] = [...endpointAssetIds].map((id) => ({
    id,
    role: roleMap.get(id) ?? null,
  }));

  // ── 7. cableTrace 실행 ───────────────────────────────────────────────────
  const { nodeIds, cableIds, truncated } = cableTrace(seedEnd, groupId, traceAssets, mergedCables, seedCableMerged);

  // ── 8. 응답 노드 조회 ────────────────────────────────────────────────────
  const nodeSelect = {
    id: true,
    name: true,
    parentAssetId: true,
    substationId: true,
    slotIndex: true,
    floorId: true,
    // 자식 자산(패널 안 feeder 등)이 자기 floorId 가 없으면 부모(패널/랙)의 floorId 를 물려받는다.
    parent: { select: { floorId: true } },
    assetType: { select: { role: true } },
    substation: { select: { name: true } },
  } as const;
  const nodeRows = await prisma.asset.findMany({
    where: { id: { in: nodeIds } },
    select: nodeSelect,
  });

  // 슬롯 노드의 부모 OFD 도 component 에 포함한다. 클라 projectTrace 는 슬롯(conduit)을 부모 OFD 로
  // collapse 해 토폴로지 노드로 렌더하므로, 부모 OFD 의 name/substation 이 응답에 없으면 그 노드가
  // id(UUID)로 떨어지고 변전소 그룹에도 못 붙는다(유령 그룹). component 를 렌더-자족적으로 만든다.
  const nodeIdSet = new Set(nodeIds);
  const parentOfdIds = [
    ...new Set(
      nodeRows
        .filter((a) => a.assetType?.role === 'slot' && a.parentAssetId)
        .map((a) => a.parentAssetId as string),
    ),
  ].filter((id) => !nodeIdSet.has(id));
  const parentRows = parentOfdIds.length
    ? await prisma.asset.findMany({ where: { id: { in: parentOfdIds } }, select: nodeSelect })
    : [];

  const nodes: TraceNode[] = [...nodeRows, ...parentRows].map((a) => ({
    id: a.id,
    name: a.name,
    role: (a.assetType?.role ?? null) as string | null,
    parentAssetId: a.parentAssetId ?? null,
    substationId: a.substationId,
    substationName: a.substation?.name ?? null,
    slotIndex: a.slotIndex ?? null,
    floorId: a.floorId ?? a.parent?.floorId ?? null, // 부모 floorId 상속(자기 것 우선)
  }));

  // ── 9. 응답 케이블: cableIds ∩ mergedCables ──────────────────────────────
  const cableIdSet = new Set(cableIds);
  const cables = mergedCables.filter((c) => cableIdSet.has(c.id));

  return {
    nodeIds,
    cableIds,
    cables,
    nodes,
    truncated: truncated ?? false,
  };
}

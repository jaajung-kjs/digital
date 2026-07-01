import { effectiveFloorId } from '../assets/effectiveFloorId';
import { useMemo } from 'react';
import { useEffectiveAssets, useEffectiveCables, useEffectiveOrgTree } from '../workingCopy/hooks';
import { useCableCategories } from '../cables/hooks/useCableCategories';
import type { AssetRole } from '../../types/asset';
import { type TraceAsset, type TraceCable } from './cableTrace';

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
  role: AssetRole | null;
  slotIndex: number | null;
}

/** trace 입력에 필요한 cable 필드만(전역 DTO / 로컬 staged 공통). */
export interface TraceCableInput {
  id: string;
  groupId?: string | null;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  number?: number | null;
  specParams?: Record<string, unknown> | null;
  categoryName?: string | null;
  categoryId?: string | null;
  // 케이블 일반 속성(CableInspector 편집 대상) — 슬림 피드가 날라야 저장 후에도 값이 보인다.
  label?: string | null;
  description?: string | null;
  color?: string | null;
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
  /** 자산 id → role(분류 단일 소스). */
  roleById: Map<string, AssetRole | null>;
  /** 자산 id → OFD 내 슬롯 위치(경로슬롯 -N 순번 파생용). */
  slotIndexById: Map<string, number | null>;
  /** 자산 id → 배치된 도면 id(scope 판정 소스; 미배치 null). */
  floorById: Map<string, string | null>;
}

const toTraceCable = (c: TraceCableInput): TraceCable => ({
  id: c.id,
  groupId: c.groupId ?? null,
  sourceAssetId: c.sourceAssetId ?? null,
  targetAssetId: c.targetAssetId ?? null,
  sourceRole: c.sourceRole ?? null,
  targetRole: c.targetRole ?? null,
  number: c.number ?? null,
  specParams: c.specParams ?? null,
  categoryName: c.categoryName ?? null,
  categoryId: c.categoryId ?? null,
});

/**
 * effective(=saved∪overlay−deletes) 단일 배열로 cableTrace 입력 그래프를 만든다. 순수 함수.
 * 자산은 완전한 Asset 형태(assetType 중첩). 변전소명은 substationNames(org 트리 전체 맵)로만 해소
 * — slim 역추론·staged 분기·폴백 체인 없음(단일 SSOT).
 */
export function buildTraceGraph(input: {
  assets: { id: string; name?: string; substationId?: string | null; parentAssetId?: string | null; slotIndex?: number | null; floorId?: string | null; assetType?: { role?: string | null } | null }[];
  cables: TraceCableInput[];
  /** 변전소 id → 이름 (전 본부 org 트리 전체). 모든 자산 변전소명의 단일 소스. */
  substationNames?: Map<string, string>;
}): TraceGraph {
  const nameById = new Map<string, string>();
  const subNameById = new Map<string, string>();
  const subById = new Map<string, string>();
  const parentById = new Map<string, string | null>();
  const roleById = new Map<string, AssetRole | null>();
  const slotIndexById = new Map<string, number | null>();
  const floorById = new Map<string, string | null>();
  const assetById = new Map<string, TraceAsset>();

  for (const a of input.assets) {
    assetById.set(a.id, { id: a.id, role: (a.assetType?.role ?? null) as AssetRole | null });
    if (a.name != null) nameById.set(a.id, a.name);
    parentById.set(a.id, a.parentAssetId ?? null);
    roleById.set(a.id, (a.assetType?.role ?? null) as AssetRole | null);
    slotIndexById.set(a.id, a.slotIndex ?? null);
    floorById.set(a.id, a.floorId ?? null);
    const subId = a.substationId ?? null;
    if (subId) {
      subById.set(a.id, subId);
      const sname = input.substationNames?.get(subId) ?? null;
      if (sname) subNameById.set(a.id, sname);
    }
  }

  // floorId 실효화 — 자기 것 없으면 부모 상속(공용 리졸버, 조상 재귀). 그래프 밖 부모(패널 등)는
  // 서버 trace 가 이미 실효 floorId 로 채워 보내므로, 여기선 그래프 내 조상만 보강한다.
  for (const id of [...floorById.keys()]) {
    if (floorById.get(id)) continue;
    const eff = effectiveFloorId(id, (x) => floorById.get(x) ?? null, (x) => parentById.get(x) ?? null);
    if (eff) floorById.set(id, eff);
  }

  return { assets: [...assetById.values()], cables: input.cables.map(toTraceCable), nameById, subNameById, subById, parentById, roleById, slotIndexById, floorById };
}

/**
 * React 훅 — effective(resident saved∪overlay−deletes) 단일 소스로 TraceGraph 를 만든다.
 * saved 는 변전소 demand-load(useWorkingCopyLoader)+연결 대국 page-in 으로 적재(전역 피드 없음 — P3-4).
 * 그래프는 resident(연 변전소+연결 대국) 범위. effective 슬라이스 변경 시 재계산.
 */
export function useTraceGraph(): { graph: TraceGraph; isLoading: boolean } {
  const assets = useEffectiveAssets();
  const rawCables = useEffectiveCables() as unknown as TraceCableInput[];
  const { data: categories = [] } = useCableCategories();
  const orgTree = useEffectiveOrgTree();
  const substationNames = useMemo(() => collectNodeNames(orgTree), [orgTree]);
  // categoryId → groupId 해소(사용자 그룹). 케이블엔 categoryId 만 있으므로 그룹을 채워 trace 가 그룹으로 동질 추적.
  const catToGroup = useMemo(() => new Map(categories.map((c) => [c.id, c.groupId])), [categories]);
  const cables = useMemo(
    () => rawCables.map((c) => ({ ...c, groupId: c.groupId ?? (c.categoryId ? catToGroup.get(c.categoryId) ?? null : null) })),
    [rawCables, catToGroup],
  );
  const graph = useMemo(
    () => buildTraceGraph({ assets, cables, substationNames }),
    [assets, cables, substationNames],
  );
  return { graph, isLoading: false };
}

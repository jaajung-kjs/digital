import { assetReportItem, cableReportItem, COMMON_CABLE_FIELDS, PLACEMENT_FIELDS } from '@twin/core';
import type { ReportItem } from '@twin/core';
import { mergeEffective } from './store/overlay';
import { buildPortIndex, cableEndpointName } from './peerResolve';
import type { V2Assembly, V2Asset, V2AssetType, V2Cable, V2CableGroup, V2InspectionLog, V2MaintenanceLog } from './types';
import type { Overlay } from './store/overlay';

/** 스토어 Overlays의 구조적 타입 (import 없이 인라인) */
interface Overlays {
  assets: Overlay<V2Asset>;
  cables: Overlay<V2Cable>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
}

/** '종류 미지정' 케이블 항목 — categoryId 없거나 group 미해소 시 공량 0 폴백 (M-1: 단일 출처) */
function unresolvedCableItem(kind: 'cable-install' | 'cable-remove', name: string): ReportItem {
  return {
    kind,
    name,
    typeName: '—',
    laborType: null,
    qty: 0,
    unit: 'm',
    hours: 0,
    note: '종류 미지정',
  };
}

/** PLACEMENT_FIELDS 집합 — @twin/core 상수에서 파생 (B-V3 시정: 로컬 재정의 금지) */
const PLACEMENT_FIELDS_SET = new Set<string>(PLACEMENT_FIELDS);

/**
 * 공량 계산에 쓰는 케이블 길이.
 *
 * 어느 종류든 갖는 공통 값이라 키를 여기 적지 않고 선언에서 가져온다 —
 * 키가 바뀌면 설계서 공량이 조용히 0이 되는 자리다.
 */
function cableLengthM(specParams: unknown): number | null {
  const key = COMMON_CABLE_FIELDS[0]!.key;
  const v = (specParams as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === 'number' ? v : null;
}

/** 이 작업 종류에 「1식」 공량이 적혀 있는가 — 없으면(null) 안에 든 자산의 공량을 합쳐 센다. */
function assemblyLabor(
  asm: V2Assembly | undefined,
  kind: 'asset-install' | 'asset-remove' | 'asset-relocate',
): { laborType: string | null; installHours: number; removeHours: number; relocateHours: number } | null {
  if (!asm) return null;
  const hours = {
    'asset-install': asm.installHours,
    'asset-remove': asm.removeHours,
    'asset-relocate': asm.relocateHours,
  }[kind];
  /* 작업 종류마다 따로 본다 — 1식 설치 공량은 표준이 있어도 철거는 부품별로 잡는 일이 흔하다.
     0 은 「품이 안 든다」는 뜻이므로 적힌 것으로 친다(null 만 「안 적었다」). */
  if (hours == null) return null;
  return {
    laborType: asm.laborType,
    installHours: kind === 'asset-install' ? hours : 0,
    removeHours: kind === 'asset-remove' ? hours : 0,
    relocateHours: kind === 'asset-relocate' ? hours : 0,
  };
}

export function buildReportItems(args: {
  saved: { assets: V2Asset[]; cables: V2Cable[] };
  overlays: Overlays;
  types: V2AssetType[];
  assemblies: V2Assembly[];
  cableGroups: V2CableGroup[];
}): ReportItem[] {
  const { saved, overlays, types, assemblies, cableGroups } = args;

  const typesById = new Map(types.map((t) => [t.id, t]));
  const assembliesById = new Map(assemblies.map((a) => [a.id, a]));

  // categoryId → group 매핑 (categories를 flatten)
  const groupByCategoryId = new Map<string, V2CableGroup>();
  for (const g of cableGroups) {
    for (const cat of g.categories) {
      groupByCategoryId.set(cat.id, g);
    }
  }

  const savedAssetsById = new Map(saved.assets.map((a) => [a.id, a]));
  const savedCablesById = new Map(saved.cables.map((c) => [c.id, c]));

  // effective assets: mergeEffective 단일 구현 사용 (B-V2 시정: 수제 병합 제거)
  const effectiveAssets = mergeEffective(saved.assets, overlays.assets);

  // portId → { port, asset } 인덱스 — buildPortIndex 공유 헬퍼 (aRef/bRef 접근은 cableEndpointName 경유)
  const portIndex = buildPortIndex(effectiveAssets);

  const items: ReportItem[] = [];

  /**
   * 이 작업의 **단위**가 무엇인가 — 1식인가, 부품 하나인가.
   *
   * 설비를 통째로 놓거나 걷으면 단위는 그 설비 하나다(「송광치 1식 설치」). 안의 부품은 그
   * 1식에 포함되므로 따로 세지 않는다. 이미 놓인 설비에서 L3 스위치 하나만 걷어내면 단위는
   * 그 부품이다.
   *
   * 어느 쪽인지는 **변경 집합이 그대로 말한다** — 뿌리 설비가 같이 왔는가. 따로 표시할 것도,
   * 사용자에게 물을 것도 없다.
   *
   * 1식 공량을 안 적어 둔 설비 종류면 1식으로 셀 값이 없으므로 부품들이 각자 낸다.
   */
  function unitOf(
    ids: Iterable<string>,
    resolve: (id: string) => V2Asset | undefined,
    kind: 'asset-install' | 'asset-remove' | 'asset-relocate',
  ): { oneSik: { asset: V2Asset; asm: V2Assembly }[]; parts: V2Asset[] } {
    const inChange = new Set(ids);
    const oneSik: { asset: V2Asset; asm: V2Assembly }[] = [];
    /** 1식으로 세어진 설비의 id — 그 자손은 세지 않는다. */
    const covered = new Set<string>();

    for (const id of inChange) {
      const asset = resolve(id);
      if (!asset?.assemblyId) continue;
      const asm = assembliesById.get(asset.assemblyId);
      if (!assemblyLabor(asm, kind)) continue; // 1식 공량 미기재 — 부품들이 각자 낸다
      oneSik.push({ asset, asm: asm! });
      covered.add(id);
    }

    const parts: V2Asset[] = [];
    for (const id of inChange) {
      if (covered.has(id)) continue;
      const asset = resolve(id);
      if (!asset) continue;
      // 1식으로 세어진 설비의 자손인가 — 상위를 거슬러 본다(데이터가 순환해도 멈추게).
      const seen = new Set<string>();
      let cur: V2Asset | undefined = asset;
      let inside = false;
      while (cur?.parentAssetId != null && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (covered.has(cur.parentAssetId)) { inside = true; break; }
        cur = resolve(cur.parentAssetId);
      }
      if (!inside) parts.push(asset);
    }
    return { oneSik, parts };
  }

  /** 자산 한 건을 설계서 항목으로 — 설비면 1식 공량, 부품이면 그 종류의 공량. */
  function pushAssetItems(
    ids: Iterable<string>,
    resolve: (id: string) => V2Asset | undefined,
    kind: 'asset-install' | 'asset-remove' | 'asset-relocate',
  ) {
    const { oneSik, parts } = unitOf(ids, resolve, kind);
    for (const { asset, asm } of oneSik) {
      items.push(assetReportItem(kind, asset.name, `${asm.name} 1식`, assemblyLabor(asm, kind)!));
    }
    for (const asset of parts) {
      // 설비인데 1식 공량이 없으면 낼 것이 없다 — 안의 부품이 각자 낸다.
      const t = asset.typeId ? typesById.get(asset.typeId) : undefined;
      if (!t) continue;
      items.push(assetReportItem(kind, asset.name, t.name, {
        laborType: t.laborType,
        installHours: t.installHours,
        removeHours: t.removeHours,
        relocateHours: t.relocateHours,
      }));
    }
  }

  // --- assets.creates → asset-install ---
  const createdById = new Map(Object.entries(overlays.assets.creates) as [string, V2Asset][]);
  pushAssetItems(createdById.keys(), (id) => createdById.get(id), 'asset-install');

  // --- assets.deletes → asset-remove (saved 에서 해소) ---
  pushAssetItems(overlays.assets.deletes, (id) => savedAssetsById.get(id), 'asset-remove');

  /* --- assets.updates → 배치 필드가 바뀐 것만 asset-relocate ---
     이설은 놓인 것을 옮기는 일이라 설비 뿌리만 움직여도 1식이 옮겨 간 것이다. */
  const relocatedIds = Object.entries(overlays.assets.updates)
    .filter(([, patch]) => Object.keys(patch).some((k) => PLACEMENT_FIELDS_SET.has(k)))
    .map(([id]) => id);
  pushAssetItems(relocatedIds, (id) => savedAssetsById.get(id), 'asset-relocate');

  // --- cables.creates → cable-install ---
  for (const cable of Object.values(overlays.cables.creates) as V2Cable[]) {
    // categoryId 없거나 group 미해소면 '종류 미지정' 공량 0
    if (!cable.categoryId) {
      items.push(unresolvedCableItem('cable-install', '케이블'));
      continue;
    }
    const group = groupByCategoryId.get(cable.categoryId);
    if (!group) {
      items.push(unresolvedCableItem('cable-install', '케이블'));
      continue;
    }
    // 이름 = "자산A↔자산B" (effective assets에서 포트 소유 해소 — cableEndpointName 한 곳 규칙)
    const aName = portIndex.get(cable.aPortId)?.asset.name;
    const bName = portIndex.get(cable.bPortId)?.asset.name;
    const name = aName && bName ? `${aName}↔${bName}` : '케이블';
    const lengthM = cableLengthM(cable.specParams);
    items.push(cableReportItem('cable-install', name, {
      name: group.name,
      laborType: group.laborType,
      installHoursPerM: group.installHoursPerM,
      removeHoursPerM: group.removeHoursPerM,
    }, lengthM));
  }

  // --- cables.deletes → cable-remove (saved에서 해소) ---
  for (const id of overlays.cables.deletes) {
    const cable = savedCablesById.get(id);
    if (!cable) continue;
    if (!cable.categoryId) {
      items.push(unresolvedCableItem('cable-remove', cable.name ?? '케이블'));
      continue;
    }
    const group = groupByCategoryId.get(cable.categoryId);
    if (!group) {
      items.push(unresolvedCableItem('cable-remove', cable.name ?? '케이블'));
      continue;
    }
    // saved cables에서 refs 이름 해소 — cableEndpointName 한 곳 규칙 (aRef/bRef 직접 접근 금지)
    const aName = cableEndpointName(cable, cable.aPortId, portIndex);
    const bName = cableEndpointName(cable, cable.bPortId, portIndex);
    const name = cable.name ?? (aName && bName ? `${aName}↔${bName}` : '케이블');
    const lengthM = cableLengthM(cable.specParams);
    items.push(cableReportItem('cable-remove', name, {
      name: group.name,
      laborType: group.laborType,
      installHoursPerM: group.installHoursPerM,
      removeHoursPerM: group.removeHoursPerM,
    }, lengthM));
  }

  return items;
}

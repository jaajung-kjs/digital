import { assetReportItem, cableReportItem, materialCostOf, COMMON_CABLE_FIELDS, PLACEMENT_FIELDS } from '@twin/core';
import type { LaborSpec, ReportItem } from '@twin/core';
import { MAN_DAY_FIELD } from '@twin/core';
import { withDescendants } from './assetTree';
import { mergeEffective } from './store/overlay';
import { buildPortIndex, cableEndpointName } from './peerResolve';
import type { V2Assembly, V2Asset, V2AssetType, V2Cable, V2CableCategory, V2CableGroup, V2InspectionLog, V2MaintenanceLog } from './types';
import type { Overlay } from './store/overlay';

/** 스토어 Overlays의 구조적 타입 (import 없이 인라인) */
interface Overlays {
  assets: Overlay<V2Asset>;
  cables: Overlay<V2Cable>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
}

/** '품목 미지정' 케이블 항목 — categoryId 없거나 group 미해소 시 공량 0 폴백 (M-1: 단일 출처) */
function unresolvedCableItem(kind: 'cable-install' | 'cable-remove', name: string): ReportItem {
  return {
    kind,
    name,
    typeName: '—',
    laborCode: null,
    qty: 0,
    unit: 'm',
    manDays: 0,
    unitPrice: null,
    note: '품목 미지정',
  };
}

/** PLACEMENT_FIELDS 집합 — @twin/core 상수에서 파생 (B-V3 시정: 로컬 재정의 금지) */
const PLACEMENT_FIELDS_SET = new Set<string>(PLACEMENT_FIELDS);

/**
 * 공량 계산에 쓰는 케이블 길이.
 *
 * 어느 종류든 갖는 공통 값이라 키를 여기 적지 않고 선언에서 가져온다 —
 * 키가 바뀌면 산출 내역 공량이 조용히 0이 되는 자리다.
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
): LaborSpec | null {
  if (!asm) return null;
  const manDays = {
    'asset-install': asm.installManDays,
    'asset-remove': asm.removeManDays,
    'asset-relocate': asm.relocateManDays,
  }[kind];
  /* 작업 종류마다 따로 본다 — 1식 설치 공량은 표준이 있어도 철거는 장비별로 잡는 일이 흔하다.
     0 은 「품이 안 든다」는 뜻이므로 적힌 것으로 친다(null 만 「안 적었다」). */
  if (manDays == null) return null;
  /* 이 작업 하나만 담은 공량을 만든다 — 나머지는 0(이 항목이 그 작업을 세지 않는다). */
  return {
    ...EMPTY_SPEC,
    laborCode: asm.laborCode,
    unitPrice: asm.unitPrice ?? null,
    [MAN_DAY_FIELD[kind === 'asset-install' ? 'install' : kind === 'asset-remove' ? 'remove' : 'relocate']]: manDays,
  };
}

/** 카탈로그 행 → 공량. 필드 이름을 여기서 다시 적지 않는다(`LaborSpec` 이 선언한다). */
const laborSpecOf = (t: V2AssetType): LaborSpec => ({
  laborCode: t.laborCode,
  unitPrice: t.unitPrice ?? null,
  installManDays: t.installManDays,
  removeManDays: t.removeManDays,
  relocateManDays: t.relocateManDays,
});

const EMPTY_SPEC: LaborSpec = {
  laborCode: null,
  unitPrice: null,
  installManDays: 0,
  removeManDays: 0,
  relocateManDays: 0,
};

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
  /* 케이블 품목으로 바로 찾아간다 — 품셈이 종류에 있으므로 그룹을 한 번 더 거칠 이유가 없다. */
  const categoryById = new Map<string, V2CableCategory>();
  for (const g of cableGroups) {
    for (const cat of g.categories) {
      categoryById.set(cat.id, cat);
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
   * 이 작업의 **단위**가 무엇인가 — 1식인가, 장비 하나인가.
   *
   * 설비를 통째로 놓거나 걷거나 옮기면 단위는 그 설비 하나다(「송광치 1식 설치」). 이미 놓인
   * 설비에서 L3 스위치 하나만 걷어내면 단위는 그 장비다. 어느 쪽인지는 **변경 집합이 그대로
   * 말한다** — 뿌리 설비가 같이 왔는가. 따로 표시할 것도, 사용자에게 물을 것도 없다.
   *
   * 1식 공량을 안 적어 둔 설비 품목면 셀 값이 없으므로 **그 설비 안의 자산들**을 대신 센다.
   * 「변경 집합 안의 자손」이 아니라 **그 설비의 자손**이어야 한다: 놓고 걷을 때는 자손도 함께
   * 오지만 **옮길 때는 뿌리만 온다**. 변경 집합만 보면 이설이 산출 내역에서 통째로 사라진다
   * (실제로 그랬다).
   *
   * @param resolve  변경 집합의 자산을 찾는 길(신설이면 creates, 철거·이설이면 saved).
   * @param childrenOf  그 설비 안의 자산들 — 같은 상태에서 찾는다.
   */
  function pushAssetItems(
    ids: Iterable<string>,
    resolve: (id: string) => V2Asset | undefined,
    childrenOf: (rootId: string) => V2Asset[],
    kind: 'asset-install' | 'asset-remove' | 'asset-relocate',
  ) {
    const inChange = [...ids];
    /** 단위가 이미 정해진 자산 — 그 자손은 따로 세지 않는다. */
    const covered = new Set<string>();
    /** 이 설비의 몫으로 세어야 할 장비들(1식 공량이 없어 자손으로 물러선 것). */
    const expanded: V2Asset[] = [];

    for (const id of inChange) {
      const asset = resolve(id);
      if (!asset?.assemblyId) continue;
      const asm = assembliesById.get(asset.assemblyId);
      const labor = assemblyLabor(asm, kind);
      covered.add(id);
      if (labor) {
        items.push(assetReportItem(kind, asset.name, `${asm!.name} 1식`, labor, asm!.unitPrice ?? null));
      } else {
        expanded.push(...childrenOf(id));
      }
    }

    /** 1식으로 세어진(또는 자손으로 편) 설비의 자손인가 — 상위를 거슬러 본다. */
    const insideCovered = (asset: V2Asset): boolean => {
      const seen = new Set<string>();
      let cur: V2Asset | undefined = asset;
      while (cur?.parentAssetId != null && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (covered.has(cur.parentAssetId)) return true;
        cur = resolve(cur.parentAssetId);
      }
      return false;
    };

    const parts = [
      ...inChange.map(resolve).filter((a): a is V2Asset => a != null && !covered.has(a.id) && !insideCovered(a)),
      ...expanded,
    ];
    for (const asset of parts) {
      // 설비인데 1식 공량이 없으면 낼 것이 없다 — 위에서 자손으로 폈다.
      const t = asset.typeId ? typesById.get(asset.typeId) : undefined;
      if (!t) continue;
      items.push(assetReportItem(kind, asset.name, t.name, laborSpecOf(t), t.unitPrice ?? null));
    }
  }

  /** 어느 상태에서 「이 설비 안의 자산들」을 찾는가 — 걷는 일은 `assetTree` 하나가 한다. */
  const descendantsIn = (all: V2Asset[]) => (rootId: string) => withDescendants(all, rootId).slice(1);

  // --- assets.creates → asset-install ---
  const createdById = new Map(Object.entries(overlays.assets.creates) as [string, V2Asset][]);
  pushAssetItems(
    createdById.keys(),
    (id) => createdById.get(id),
    descendantsIn([...createdById.values()]),
    'asset-install',
  );

  // --- assets.deletes → asset-remove (saved 에서 해소) ---
  const savedDescendants = descendantsIn(saved.assets);
  pushAssetItems(overlays.assets.deletes, (id) => savedAssetsById.get(id), savedDescendants, 'asset-remove');

  /* --- assets.updates → 배치 필드가 바뀐 것만 asset-relocate ---
     이설은 놓인 것을 옮기는 일이라 **뿌리만** 변경 집합에 온다 — 안의 장비는 그대로 딸려 간다. */
  const relocatedIds = Object.entries(overlays.assets.updates)
    .filter(([, patch]) => Object.keys(patch).some((k) => PLACEMENT_FIELDS_SET.has(k)))
    .map(([id]) => id);
  pushAssetItems(relocatedIds, (id) => savedAssetsById.get(id), savedDescendants, 'asset-relocate');

  // --- cables.creates → cable-install ---
  for (const cable of Object.values(overlays.cables.creates) as V2Cable[]) {
    // categoryId 없거나 group 미해소면 '품목 미지정' 공량 0
    if (!cable.categoryId) {
      items.push(unresolvedCableItem('cable-install', '케이블'));
      continue;
    }
    const category = categoryById.get(cable.categoryId);
    if (!category) {
      items.push(unresolvedCableItem('cable-install', '케이블'));
      continue;
    }
    // 이름 = "자산A↔자산B" (effective assets에서 포트 소유 해소 — cableEndpointName 한 곳 규칙)
    const aName = portIndex.get(cable.aPortId)?.asset.name;
    const bName = portIndex.get(cable.bPortId)?.asset.name;
    const name = aName && bName ? `${aName}↔${bName}` : '케이블';
    const lengthM = cableLengthM(cable.specParams);
    items.push(cableReportItem('cable-install', name, category, lengthM));
  }

  // --- cables.deletes → cable-remove (saved에서 해소) ---
  for (const id of overlays.cables.deletes) {
    const cable = savedCablesById.get(id);
    if (!cable) continue;
    if (!cable.categoryId) {
      items.push(unresolvedCableItem('cable-remove', cable.name ?? '케이블'));
      continue;
    }
    const category = categoryById.get(cable.categoryId);
    if (!category) {
      items.push(unresolvedCableItem('cable-remove', cable.name ?? '케이블'));
      continue;
    }
    // saved cables에서 refs 이름 해소 — cableEndpointName 한 곳 규칙 (aRef/bRef 직접 접근 금지)
    const aName = cableEndpointName(cable, cable.aPortId, portIndex);
    const bName = cableEndpointName(cable, cable.bPortId, portIndex);
    const name = cable.name ?? (aName && bName ? `${aName}↔${bName}` : '케이블');
    const lengthM = cableLengthM(cable.specParams);
    items.push(cableReportItem('cable-remove', name, category, lengthM));
  }

  return items;
}

/**
 * 물량 → **직접공사비**(재료비 + 직접노무비).
 *
 * 여기가 카탈로그와 기준정보가 만나는 자리다: 수량 × 자재단가, 품(인·일) × 노임단가(원/일).
 * 단가나 노임이 아직 없는 줄은 **0 으로 센다** — 금액이 조용히 부풀지 않게. 무엇이 비었는지는
 * 표의 「노무」 칸과 「단가 없음」이 말한다.
 *
 * 화면에 두지 않는 이유: 산출 내역 패널·내보내기·나중의 저장이 같은 값을 써야 한다.
 */
export function estimateInput(
  items: readonly ReportItem[],
  wageOf: (code: string | null) => number | null,
): { materialCost: number; directLaborCost: number } {
  let materialCost = 0;
  let directLaborCost = 0;
  for (const it of items) {
    /* 재료비의 셈은 표의 「자재비」 칸과 **같은 함수**여야 한다 — 갈리면 합계가 안 맞는다. */
    materialCost += materialCostOf(it);
    directLaborCost += it.manDays * (wageOf(it.laborCode) ?? 0);
  }
  return { materialCost, directLaborCost };
}

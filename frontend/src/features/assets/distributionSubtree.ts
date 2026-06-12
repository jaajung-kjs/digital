import type { Asset, AssetType } from '../../types/asset';

/**
 * 단계3b — 분전반 회로의 통합 Asset 모델.
 *
 * 분전반(placementKind 'DIST') 의 하위는 더 이상 distribution_circuits 행이 아니라
 * Asset 계층이다: 분전반 → FEEDER 자산(parentAssetId=분전반) → BRANCH 자산
 * (parentAssetId=FEEDER). FEEDER/BRANCH 는 내부 노드(floorId/좌표 없음).
 *
 * 케이블의 회로 endpoint 는 BRANCH 자산 id 하나(sourceAssetId/targetAssetId)이며,
 * floorAnchor 가 branch→feeder→분전반 으로 걸어 도면 위치를 해소한다.
 */

export const FEEDER_CODE = 'FEEDER';
export const BRANCH_CODE = 'BRANCH';

export interface FeederGroup {
  feeder: Asset;
  branches: Asset[];
}

function codeOf(a: Asset): string | undefined {
  return a.assetType?.code ?? undefined;
}

/** 분전반의 FEEDER 자산들 — sortOrder, name 순. (feederGroupsOfPanel/branchAssetIdsOfPanel 내부) */
function feedersOfPanel(assets: Asset[], panelId: string): Asset[] {
  return assets
    .filter((a) => a.parentAssetId === panelId && codeOf(a) === FEEDER_CODE)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** FEEDER 자산의 BRANCH 자산들 — sortOrder, name 순. (feederGroupsOfPanel/branchAssetIdsOfPanel 내부) */
function branchesOfFeeder(assets: Asset[], feederId: string): Asset[] {
  return assets
    .filter((a) => a.parentAssetId === feederId && codeOf(a) === BRANCH_CODE)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * 분전반 하위를 feeder 그룹(피더 → 그 분기 목록)으로 묶는다.
 * groupCircuitsByFeeder 의 Asset 판. CircuitPicker / DistributionPanel 공용.
 */
export function feederGroupsOfPanel(assets: Asset[], panelId: string): FeederGroup[] {
  return feedersOfPanel(assets, panelId).map((feeder) => ({
    feeder,
    branches: branchesOfFeeder(assets, feeder.id),
  }));
}

/** 분전반 하위 BRANCH 자산 id 전체 — 멤버십(이 분전반의 연결) 판정용. */
export function branchAssetIdsOfPanel(assets: Asset[], panelId: string): Set<string> {
  const ids = new Set<string>();
  for (const feeder of feedersOfPanel(assets, panelId)) {
    for (const branch of branchesOfFeeder(assets, feeder.id)) ids.add(branch.id);
  }
  return ids;
}

/** branchName 에서 L 숫자 추출 — 다음 분기 번호는 max+1 (삭제분 재사용 안 함). */
export function nextBranchName(branches: Asset[]): string {
  let max = 0;
  for (const b of branches) {
    const m = /^L(\d+)$/.exec(b.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `L${max + 1}`;
}

/**
 * FEEDER/BRANCH 내부 노드 Asset 을 stage 용으로 조립한다. SubstationAssetGrid
 * 의 새 Asset 조립과 동일 형태 — 단 parentAssetId 가 채워지고 floorId/좌표는
 * null(미배치 내부 노드)이다.
 */
export function buildSubtreeAsset(params: {
  id: string;
  substationId: string;
  type: AssetType;
  name: string;
  parentAssetId: string;
  sortOrder?: number;
}): Asset {
  const { id, substationId, type, name, parentAssetId, sortOrder = 0 } = params;
  return {
    id,
    substationId,
    assetTypeId: type.id,
    assetType: {
      id: type.id,
      code: type.code,
      name: type.name,
      group: type.group,
      displayColor: type.displayColor,
      fieldTemplate: type.fieldTemplate,
      placementKind: type.placementKind,
    },
    name,
    parentAssetId,
    floorId: null,
    roomText: null,
    sourcePresetId: null,
    installDate: null,
    warrantyUntil: null,
    replaceDue: null,
    manager: null,
    description: null,
    status: null,
    sortOrder,
    updatedAt: '',
  };
}

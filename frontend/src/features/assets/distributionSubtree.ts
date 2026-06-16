import type { Asset, AssetType } from '../../types/asset';

/**
 * 분전반 회로의 통합 Asset 모델 (피더-직접).
 *
 * 분전반(placementKind 'DIST') 의 하위는 FEEDER 자산(parentAssetId=분전반)이다.
 * FEEDER 는 내부 노드(floorId/좌표 없음, connectionKind='distributor').
 *
 * CB = FEEDER 로 직접 그려지는 출력 케이블 (별도 노드 없음). 케이블의 회로
 * endpoint 는 FEEDER 자산 id 하나(sourceAssetId/targetAssetId)이며, floorAnchor 가
 * feeder→분전반 으로 걸어 도면 위치를 해소한다.
 */

export const FEEDER_CODE = 'FEEDER';

function codeOf(a: Asset): string | undefined {
  return a.assetType?.code ?? undefined;
}

/** 분전반의 FEEDER 자산들 — sortOrder, name 순. */
export function feedersOfPanel(assets: Asset[], panelId: string): Asset[] {
  return assets
    .filter((a) => a.parentAssetId === panelId && codeOf(a) === FEEDER_CODE)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * FEEDER 내부 노드 Asset 을 stage 용으로 조립한다. SubstationAssetGrid
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
      // connectionKind 누락 시 resolveAssetDetailKind 가 null → 저장 전 스위치/포트 UI 미렌더.
      connectionKind: type.connectionKind,
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

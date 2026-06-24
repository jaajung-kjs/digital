import type { Asset } from '../../types/asset';
import type { SlimAssetDTO, TraceCableInput } from '../trace/traceGraph';
import type { WorkingCopyRow } from './substationStore';

/**
 * slim 전역 피드 행 → detail 필드 null 인 "완전한 Asset"(미방문 변전소용 경량 행).
 * 부분객체가 아니라 완전 형태라 effective 소비처가 안 깨진다. 방문 시 /workingcopy detail 이 승급.
 * placementKind 는 slim 에 없어 null — 컨테이너 판별(OFD/DIST 등)은 항상 현재 변전소(detail 로드됨)
 * 스코프라 안전하다(다른 변전소 lite 행은 substationId 필터로 먼저 제외됨).
 */
export function slimToAsset(s: SlimAssetDTO): Asset {
  return {
    id: s.id,
    substationId: s.substationId,
    assetTypeId: '',
    assetType: {
      id: '', code: s.code ?? '', name: '', group: null, displayColor: null,
      fieldTemplate: null, placementKind: null, connectionKind: s.connectionKind ?? null,
      role: s.role ?? null,
    },
    name: s.name,
    parentAssetId: s.parentAssetId,
    floorId: null,
    roomText: null,
    sourcePresetId: null,
    installDate: null,
    warrantyUntil: null,
    replaceDue: null,
    manager: null,
    description: null,
    status: null,
    sortOrder: 0,
    updatedAt: '',
    positionX: null,
    positionY: null,
    width2d: null,
    height2d: null,
    rotation: null,
    totalU: null,
    slotIndex: s.slotIndex,
    slotSpan: null,
  };
}

/** slim 전역 케이블 → 완전한 워킹카피 케이블 행(미방문 행). saved.cables 는 느슨한 행 타입. */
export function slimCableToCable(c: TraceCableInput): WorkingCopyRow {
  return {
    id: c.id,
    sourceAssetId: c.sourceAssetId ?? null,
    targetAssetId: c.targetAssetId ?? null,
    sourceRole: c.sourceRole ?? null,
    targetRole: c.targetRole ?? null,
    number: c.number ?? null,
    specParams: c.specParams ?? null,
    categoryId: c.categoryId ?? null,
    categoryName: c.categoryName ?? null,
    displayColor: c.displayColor ?? null,
    // 케이블 일반 속성(CableInspector) — 저장 후 재조회 시에도 값이 유지되도록 함께 나른다.
    label: c.label ?? null,
    description: c.description ?? null,
    color: c.color ?? null,
    substationId: null,
    updatedAt: '',
  };
}

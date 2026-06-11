import { useMemo } from 'react';
import { useNodeAssets } from '../../hooks/useNodeAssets';
import { useEffectiveAssetsOverlay } from '../workingCopy/hooks';
import { useEditorStore } from '../editor/stores/editorStore';
import type { Asset } from '../../types/asset';
import type { AssetListItem } from './nodeStatus';

// ──────────────────────────────────────────────────────────────────────────
// SSOT-2c Task 4 — 현황 리스트 라이브 머지.
//
// 리스트 데이터는 백엔드 useNodeAssets(rich: substationName/floorName/
// lastMaintenanceDate)를 기준으로, 통합 store 의 assets overlay(스테이징된
// 편집)를 덮어쓴다. 따라서 인스펙터에서 stage 한 편집이 커밋 전에도 리스트에
// 즉시 보인다(단일 소스: useSubstationWorkingCopy).
//
// - updates: 공유 필드(name/manager/installDate/status)만 list 행에 반영.
//   backend 가 채운 rich 필드(substationName/floorName/lastMaintenanceDate)는
//   유지한다.
// - deletes: 해당 행 제거.
// - creates: 새로 스테이징된 자산을 행으로 추가(커밋→refetch 전까지 제한 표시).
//   랙 모듈 자식 포함 — 서버 listByNode 가 parentAssetId 필터 없이 모듈도 반환하므로
//   저장 전후 동일하게 행으로 보여야 "저장해야 현황 반영" 불일치가 없다.
// ──────────────────────────────────────────────────────────────────────────

/** asset update patch 의 공유 필드만 골라 AssetListItem 키로 매핑(있는 키만). */
function assetPatchToListItem(patch: Partial<Asset>): Partial<AssetListItem> {
  const out: Partial<AssetListItem> = {};
  if ('name' in patch) out.name = patch.name as string;
  if ('manager' in patch) out.manager = patch.manager ?? null;
  if ('installDate' in patch) out.installDate = patch.installDate ?? null;
  if ('status' in patch) out.status = patch.status ?? null;
  return out;
}

/** 새로 스테이징된 자산을 현황 리스트 행으로 변환(커밋 전 제한 표시). */
function assetCreateToListItem(asset: Asset, substationId: string): AssetListItem {
  return {
    id: asset.id,
    name: asset.name,
    assetTypeName: asset.assetType?.name ?? '신규',
    assetTypeColor: asset.assetType?.displayColor ?? null,
    substationId,
    substationName: '',
    floorId: asset.floorId ?? null,
    floorName: null,
    roomText: null,
    installDate: asset.installDate ?? null,
    manager: asset.manager ?? null,
    status: asset.status ?? null,
    warrantyUntil: null,
    replaceDue: null,
    lastMaintenanceDate: null,
  };
}

export function useSubstationStatusRows(substationId: string): AssetListItem[] {
  const { data: list = [] } = useNodeAssets('substation', substationId);
  const overlay = useEffectiveAssetsOverlay();
  const pendingInspections = useEditorStore((s) => s.pendingInspections);
  return useMemo(() => {
    // staged(저장 대기) 점검의 자산별 최신 점검일 → 현황 '마지막 점검일'에 즉시 반영
    // (백엔드 lastMaintenanceDate 는 커밋 후에야 갱신되므로, pre-save 에도 일관되게 보이게).
    const pendingLatest = new Map<string, string>();
    for (const ins of pendingInspections) {
      const cur = pendingLatest.get(ins.assetId);
      if (!cur || ins.inspectionDate > cur) pendingLatest.set(ins.assetId, ins.inspectionDate);
    }
    const withPending = (id: string, saved: string | null): string | null => {
      const p = pendingLatest.get(id);
      if (!p) return saved;
      return !saved || p > saved.slice(0, 10) ? p : saved;
    };
    const deleted = new Set(overlay.deletes);
    const rows = list
      .filter((r) => !deleted.has(r.id))
      .map((r) => {
        const p = overlay.updates[r.id];
        const merged = p ? { ...r, ...assetPatchToListItem(p) } : r;
        return { ...merged, lastMaintenanceDate: withPending(r.id, merged.lastMaintenanceDate) };
      });
    // 새 staged 자산을 행으로 추가. 서버 listByNode 는 parentAssetId 필터가 없어
    // 저장 후 랙 모듈도 행으로 뜨므로, pre-save 에서도 동일하게 포함해야 "저장해야
    // 현황에 반영"되는 불일치가 사라진다(SSOT — staged 가 현황 리스트에 즉시 반영).
    const creates = (Object.values(overlay.creates) as Asset[])
      .map((a) => assetCreateToListItem(a, substationId));
    return [...rows, ...creates];
  }, [list, overlay, pendingInspections, substationId]);
}

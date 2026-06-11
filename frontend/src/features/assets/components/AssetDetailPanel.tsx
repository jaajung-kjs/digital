import { useMemo } from 'react';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import type { Asset } from '../../../types/asset';
import { EQUIPMENT_KIND_INFO, type DetailPanelKind } from '../../../types/equipmentKind';
import { normalizeKindForAsset } from '../../workingCopy/assetToEquipment';
import { AssetDetailBody } from '../../equipment/components/detail/panels/AssetDetailBody';
import { DetailPanelHeader } from '../../../components/DetailPanelHeader';

interface Props {
  asset: Asset;
  /** 'edit'(변전소 — 스테이징 편집) | 'view'(본부·사업소 — 읽기전용). 기본 'edit'. */
  mode?: 'edit' | 'view';
  onClose: () => void;
  onPatch?: (id: string, patch: Partial<Asset>) => void;
}

/**
 * 현황/대장 상세 패널 — 헤더 + SSOT 공유 본문(AssetDetailBody).
 *
 * 본문은 평면도 더블클릭(에디터)과 완전히 동일: AssetInspector + 종류별 공간 섹션
 * (랙 내부 모듈 GUI / OFD 경로 / 분전반 회로). 종류는 asset.assetType.placementKind 에서
 * 해석한다(DIST→DISTRIBUTION 정규화 포함). 공간 섹션은 모두 working-copy 기반이라
 * 캔버스 밖(현황/대장)에서도 그대로 동작한다.
 */
export function AssetDetailPanel({ asset, mode = 'edit', onClose, onPatch }: Props) {
  // 삭제 — edit 모드(워킹카피 로드)에서만. 최상위 설비는 cascade, 모듈/분기는 단일.
  const stageAssetDelete = useSubstationWorkingCopy((s) => s.stageAssetDelete);
  const stageEquipmentDeleteCascade = useSubstationWorkingCopy((s) => s.stageEquipmentDeleteCascade);
  const handleDelete = () => {
    const isTop = asset.parentAssetId == null;
    if (!confirm(`'${asset.name}' — 이 ${isTop ? '설비' : '항목'}을(를) 삭제할까요? (저장 전까지 되돌릴 수 있습니다.)`)) return;
    if (isTop) stageEquipmentDeleteCascade(asset.id);
    else stageAssetDelete(asset.id);
    onClose();
  };

  // 종류 → 상세 패널 종류(공간 섹션 해석용). null 이면 공간 섹션 없음.
  // 랙 내부 모듈(parentAssetId 있음)·미배치/미상 placementKind 자산은 공간 섹션이 없다.
  // (normalizeKindForAsset 의 unknown→RACK 기본값 때문에 모듈에 '내부설비'가 붙던 버그 방지.)
  const detailKind = useMemo<DetailPanelKind | null>(() => {
    if (asset.parentAssetId != null) return null;
    const pk = asset.assetType?.placementKind;
    if (!pk) return null;
    return EQUIPMENT_KIND_INFO[normalizeKindForAsset(pk)].detailPanelKind;
  }, [asset.parentAssetId, asset.assetType?.placementKind]);

  return (
    <aside className="w-96 shrink-0 border-l border-line bg-surface h-full flex flex-col">
      {/* 평면도 패널(SidePanel)과 단일 소스 헤더 — 픽셀 단위 동일. */}
      <DetailPanelHeader
        title={asset.name}
        onClose={onClose}
        onDelete={mode === 'edit' ? handleDelete : undefined}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        <AssetDetailBody equipmentId={asset.id} kind={detailKind} mode={mode} onPatch={onPatch} asset={asset} />
      </div>
    </aside>
  );
}

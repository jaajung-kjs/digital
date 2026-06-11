import { useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useEffectiveAssets, useEffectiveEquipment } from '../../workingCopy/hooks';
import { kindOf } from '../../workingCopy/placement';
import { isTempId } from '../../../utils/idHelpers';
import { useMergedEquipmentDetail } from '../../equipment/components/detail/hooks/useEquipmentDetail';
import { EQUIPMENT_KIND_INFO, type DetailPanelKind } from '../../../types/equipmentKind';
import { AssetDetailPanel } from '../../assets/components/AssetDetailPanel';

interface EquipmentDetailPanelProps {
  equipmentId: string;
  /** effective 설비 조회용(헤더 name/kind lookup). */
  floorId: string;
}

/**
 * 평면도 상세 패널 — '무엇을 열지'만 캔버스 상태에서 resolve 하는 얇은 어댑터.
 *
 * 패널 자체(헤더·본문·삭제·셸)는 공유 AssetDetailPanel(variant="overlay")이 담당한다.
 * 에디터 전용 개념(과거 도면 스냅샷 · 미저장 임시 설비 · 재포커스 focusTick · 캔버스 선택)만
 * 여기 남는다 — 현황 패널은 이런 개념이 없으므로 공유 컴포넌트가 이를 알 필요가 없다.
 */
export function EquipmentDetailPanel({ equipmentId, floorId }: EquipmentDetailPanelProps) {
  const closeRightPanel = useEditorStore((s) => s.closeRightPanel);
  const focusTick = useEditorStore((s) => s.focusTick);
  const isTemp = isTempId(equipmentId);
  const { equipment, isLoading } = useMergedEquipmentDetail(equipmentId);

  // 통합 스토어 effective 에서 헤더 정보를 읽는다.
  const effectiveEquipment = useEffectiveEquipment(floorId);
  const localEq = effectiveEquipment.find((e) => e.id === equipmentId);

  // 랙 모듈은 평면도에 배치되지 않아 effectiveEquipment(floor)에 없다 → 전역 effective assets
  // 에서 모듈 Asset(parentAssetId 있음)을 찾아 주입. 모듈은 leaf 라 공간 섹션 없음(kind=null).
  const effectiveAssets = useEffectiveAssets();
  const moduleAsset = useMemo(
    () =>
      !localEq
        ? (effectiveAssets.find((a) => a.id === equipmentId && a.parentAssetId != null) ?? null)
        : null,
    [localEq, effectiveAssets, equipmentId],
  );

  const detailKind = useMemo<DetailPanelKind | null>(() => {
    if (moduleAsset) return null; // 모듈은 내부설비/경로 같은 공간 섹션이 없음
    if (!localEq) return null;
    return EQUIPMENT_KIND_INFO[kindOf(localEq)]?.detailPanelKind ?? null;
  }, [moduleAsset, localEq]);

  const title = moduleAsset
    ? moduleAsset.name
    : !isTemp && isLoading
      ? '로딩 중...'
      : equipment?.name ?? '설비 상세';

  const banner = null;

  return (
    <AssetDetailPanel
      variant="overlay"
      title={title}
      equipmentId={equipmentId}
      detailKind={detailKind}
      asset={moduleAsset}
      mode="edit"
      onClose={() => closeRightPanel()}
      banner={banner}
      bodyKey={`${equipmentId}-${focusTick}`}
      canDelete={true}
    />
  );
}

import { useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useEffectiveAssets, useEffectiveEquipment } from '../../workingCopy/hooks';
import { kindOf } from '../../workingCopy/placement';
import { isTempId } from '../../../utils/idHelpers';
import { useMergedEquipmentDetail } from '../../equipment/components/detail/hooks/useEquipmentDetail';
import { type DetailPanelKind } from '../../../types/equipmentKind';
import { AssetDetailPanel } from '../../assets/components/AssetDetailPanel';
import { resolveAssetDetailKind } from '../../equipment/components/detail/panels/resolveAssetDetailKind';

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
  // 케이블 더블클릭 등에서 지정한 진입 탭(예: '연결'). bodyKey(focusTick) 로 본문이 remount 되며 적용.
  const detailInitialTab = useEditorStore((s) => s.detailInitialTab);
  const isTemp = isTempId(equipmentId);
  const { equipment, isLoading } = useMergedEquipmentDetail(equipmentId);

  // 통합 스토어 effective 에서 헤더 정보를 읽는다.
  const effectiveEquipment = useEffectiveEquipment(floorId);
  const localEq = effectiveEquipment.find((e) => e.id === equipmentId);

  // 선택 자산을 제네릭하게 해소(랙 모듈만이 아니라 모든 자식 — 피더·OFD-슬롯 포함)해서
  // 공유 패널에 넘긴다. AssetBreadcrumb 가 parentAssetId 있으면 부모 eyebrow 를 렌더하므로,
  // 부모 있는 자식이면 평면도에서 *어디서 열든* eyebrow 가 뜬다(현황과 동일). 배치 최상위
  // 자산은 parentAssetId 가 없어 자연히 eyebrow 없음.
  const effectiveAssets = useEffectiveAssets();
  const asset = useMemo(
    () => effectiveAssets.find((a) => a.id === equipmentId) ?? null,
    [effectiveAssets, equipmentId],
  );

  const detailKind = useMemo<DetailPanelKind | null>(
    () => resolveAssetDetailKind(asset, localEq ? { kind: kindOf(localEq) } : null),
    [asset, localEq],
  );

  const title = !localEq && asset
    ? asset.name
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
      asset={asset}
      mode="edit"
      onClose={() => closeRightPanel()}
      banner={banner}
      bodyKey={`${equipmentId}-${focusTick}`}
      canDelete={true}
      initialTab={detailInitialTab ?? undefined}
    />
  );
}

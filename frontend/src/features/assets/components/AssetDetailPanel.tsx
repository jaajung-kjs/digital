import type { ReactNode } from 'react';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import type { Asset } from '../../../types/asset';
import { EQUIPMENT_KIND_INFO, type DetailPanelKind } from '../../../types/equipmentKind';
import { normalizeKindForAsset } from '../../workingCopy/assetToEquipment';
import { AssetDetailBody } from '../../equipment/components/detail/panels/AssetDetailBody';
import { DetailPanelHeader } from '../../../components/DetailPanelHeader';
import { SidePanel } from '../../editor/components/SidePanel';

interface Props {
  /** 현황/대장: 풀 Asset. 평면도: 모듈이면 모듈 Asset, 비모듈이면 생략(equipmentId 로 본문 resolve). */
  asset?: Asset | null;
  /** asset 이 없을 때(평면도 비모듈) 본문 resolve 용 id. 기본 asset.id. */
  equipmentId?: string;
  /** 헤더 제목. 기본 asset.name. (평면도는 캔버스에서 resolve 한 이름.) */
  title?: ReactNode;
  /** 공간 섹션 종류. 미지정(undefined) 시 asset 에서 계산. null 은 '섹션 없음'. */
  detailKind?: DetailPanelKind | null;
  /** 'edit'(변전소 — 스테이징 편집) | 'view'(본부·사업소 — 읽기전용). 기본 'edit'. */
  mode?: 'edit' | 'view';
  onClose: () => void;
  onPatch?: (id: string, patch: Partial<Asset>) => void;
  /** overlay=평면도 슬라이드 패널, inline=현황 고정 컬럼. 기본 inline. */
  variant?: 'overlay' | 'inline';
  /** overlay 전용 — 본문 상단 배너(예: 과거 도면 읽기전용). */
  banner?: ReactNode;
  /** overlay 전용 — 본문 remount key(평면도 재포커스 focusTick). */
  bodyKey?: string;
  /** 삭제 노출 여부. 기본 mode==='edit'. */
  canDelete?: boolean;
}

/** asset 의 placementKind → 공간 섹션 종류. 모듈/미배치/미상은 null(섹션 없음). */
function kindFromAsset(asset?: Asset | null): DetailPanelKind | null {
  if (!asset || asset.parentAssetId != null) return null;
  const pk = asset.assetType?.placementKind;
  if (!pk) return null;
  return EQUIPMENT_KIND_INFO[normalizeKindForAsset(pk)].detailPanelKind;
}

/**
 * 자산 상세 패널 — 평면도(overlay)·현황/대장(inline) **단일 컴포넌트**.
 *
 * 데이터(워킹카피)도, 본문(AssetDetailBody)도, 헤더(DetailPanelHeader)도 하나로 공유한다.
 * 두 진입점은 이 컴포넌트를 **variant 만 다르게** 연다:
 *   - inline(기본): 현황/대장 — 리스트 옆 고정 컬럼(aside).
 *   - overlay: 평면도 — 캔버스 위 슬라이드 패널(SidePanel). 평면도는 캔버스 상태에서
 *     무엇을 열지(asset/kind/title/스냅샷 배너)를 resolve 한 뒤 props 로만 넘긴다.
 *
 * 삭제·종류 해석·헤더·본문·셸 선택이 전부 이 한 곳 — 두 패널이 미묘하게 달라질 여지가 없다.
 */
export function AssetDetailPanel({
  asset = null,
  equipmentId,
  title,
  detailKind,
  mode = 'edit',
  onClose,
  onPatch,
  variant = 'inline',
  banner,
  bodyKey,
  canDelete,
}: Props) {
  const stageAssetDelete = useSubstationWorkingCopy((s) => s.stageAssetDelete);
  const stageEquipmentDeleteCascade = useSubstationWorkingCopy((s) => s.stageEquipmentDeleteCascade);

  const id = equipmentId ?? asset?.id ?? '';
  const headerTitle = title ?? asset?.name ?? '설비 상세';
  const kind = detailKind !== undefined ? detailKind : kindFromAsset(asset);
  const isModule = asset?.parentAssetId != null; // 평면도 비모듈은 asset=null → cascade.
  const showDelete = (canDelete ?? mode === 'edit') && !!id;

  const handleDelete = () => {
    const what = isModule ? '이 항목' : '이 설비';
    if (!window.confirm(`'${headerTitle}' — ${what}을(를) 삭제할까요? (저장 전까지 되돌릴 수 있습니다.)`)) return;
    if (isModule) stageAssetDelete(id);
    else stageEquipmentDeleteCascade(id);
    onClose();
  };

  const body = (
    <AssetDetailBody
      key={bodyKey}
      equipmentId={id}
      kind={kind}
      mode={mode}
      onPatch={onPatch}
      asset={asset}
    />
  );

  if (variant === 'overlay') {
    return (
      <SidePanel
        side="right"
        width={384}
        title={headerTitle}
        onClose={onClose}
        onDelete={showDelete ? handleDelete : undefined}
      >
        {banner}
        {body}
      </SidePanel>
    );
  }

  return (
    <aside className="w-96 shrink-0 border-l border-line bg-surface h-full flex flex-col">
      <DetailPanelHeader
        title={headerTitle}
        onClose={onClose}
        onDelete={showDelete ? handleDelete : undefined}
      />
      <div className="flex-1 min-h-0 flex flex-col">{body}</div>
    </aside>
  );
}

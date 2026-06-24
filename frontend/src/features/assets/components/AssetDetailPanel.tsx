import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useSelection } from '../../workspace/SelectionContext';
import type { Asset } from '../../../types/asset';
import { type DetailPanelKind } from '../../../types/equipmentKind';
import { isRackModuleAsset } from '../../workingCopy/assetClassify';
import { AssetDetailBody } from '../../equipment/components/detail/panels/AssetDetailBody';
import { resolveAssetDetailKind } from '../../equipment/components/detail/panels/resolveAssetDetailKind';
import { DetailPanelHeader } from '../../../components/DetailPanelHeader';
import { SidePanel, RIGHT_PANEL_WIDTH } from '../../editor/components/SidePanel';
import { useTraceGraph } from '../../trace/traceGraph';
import { fiberSlotLabel } from '../../fiber/fiberSlotLabel';

/**
 * 상위 맥락 브레드크럼(eyebrow) — 부모 자산이 있으면 조상 체인을 제목 위에 작게 표시.
 * 각 조상 클릭 → 공유 선택(setSelectedAssetId)으로 해당 자산 패널 열기(← 뒤로가기 대체, 표준 패턴).
 * 부모 없으면 null(단일 줄 헤더). 좁은 패널이라 이름 truncate, 깊으면 자연 overflow.
 */
function AssetBreadcrumb({ asset }: { asset?: Asset | null }) {
  const effectiveAssets = useEffectiveAssets();
  const sel = useSelection();
  if (!asset?.parentAssetId) return null;
  const chain: Asset[] = [];
  let cur: Asset | undefined = effectiveAssets.find((a) => a.id === asset.parentAssetId);
  for (let guard = 0; cur && guard < 20; guard++) {
    chain.unshift(cur);
    const pid = cur.parentAssetId ?? null;
    cur = pid ? effectiveAssets.find((a) => a.id === pid) : undefined;
  }
  if (chain.length === 0) return null;
  return (
    <nav aria-label="상위 자산" className="flex items-center gap-0.5 mb-0.5 overflow-hidden text-xs">
      {chain.map((a) => (
        <span key={a.id} className="inline-flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => sel?.setSelectedAssetId(a.id)}
            title={a.name}
            className="max-w-[9rem] truncate rounded-sm text-content-muted transition-colors hover:text-primary hover:underline focus-ring"
          >
            {a.name}
          </button>
          <ChevronRight size={12} className="shrink-0 text-content-faint" />
        </span>
      ))}
    </nav>
  );
}

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
  /** 처음 활성화할 탭 라벨(예: '연결'). 없으면 첫 탭. */
  initialTab?: string;
}

/** asset → 공간 섹션 종류. role 단일 소스. resolveAssetDetailKind(SSOT) 위임. */
function kindFromAsset(asset?: Asset | null): DetailPanelKind | null {
  return resolveAssetDetailKind(asset);
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
  initialTab,
}: Props) {
  const stageAssetDelete = useSubstationWorkingCopy((s) => s.stageAssetDelete);
  const stageEquipmentDeleteCascade = useSubstationWorkingCopy((s) => s.stageEquipmentDeleteCascade);

  const id = equipmentId ?? asset?.id ?? '';
  const { graph } = useTraceGraph();
  const conduitLabel =
    asset && asset.assetType?.role === 'slot' ? fiberSlotLabel(asset.id, graph) : '';
  const headerTitle = conduitLabel || title || asset?.name || '설비 상세';
  const kind = detailKind !== undefined ? detailKind : kindFromAsset(asset);
  const isModule = isRackModuleAsset(asset); // strict: 슬롯 있는 자식만 모듈. 피더(slotIndex 없음)는 cascade 경로.
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
      initialTab={initialTab}
    />
  );

  if (variant === 'overlay') {
    return (
      <SidePanel
        side="right"
        title={headerTitle}
        eyebrow={<AssetBreadcrumb asset={asset} />}
        onClose={onClose}
        onDelete={showDelete ? handleDelete : undefined}
      >
        {banner}
        {body}
      </SidePanel>
    );
  }

  return (
    <aside style={{ width: RIGHT_PANEL_WIDTH }} className="shrink-0 border-l border-line bg-surface h-full flex flex-col">
      <DetailPanelHeader
        title={headerTitle}
        eyebrow={<AssetBreadcrumb asset={asset} />}
        onClose={onClose}
        onDelete={showDelete ? handleDelete : undefined}
      />
      <div className="flex-1 min-h-0 flex flex-col">{body}</div>
    </aside>
  );
}

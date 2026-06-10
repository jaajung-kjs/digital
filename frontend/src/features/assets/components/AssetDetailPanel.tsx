import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Asset } from '../../../types/asset';
import { assetAlert } from '../alerts';
import { floorPlanUrl } from '../navUrls';
import { useWorkspaceNav } from '../../workspace/WorkspaceNavContext';
import { EQUIPMENT_KIND_INFO, type DetailPanelKind } from '../../../types/equipmentKind';
import { normalizeKindForAsset } from '../../workingCopy/assetToEquipment';
import { AssetDetailBody } from '../../equipment/components/detail/panels/AssetDetailBody';
import { spatialNeedsWidePanel } from '../../equipment/components/detail/panels/resolveSpatialSection';

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
  const navigate = useNavigate();
  const ws = useWorkspaceNav();
  const today = useMemo(() => new Date(), []);
  const alert = assetAlert(asset, today);

  // 종류 → 상세 패널 종류(공간 섹션 해석용).
  const detailKind = useMemo<DetailPanelKind>(() => {
    const kind = normalizeKindForAsset(asset.assetType?.placementKind);
    return EQUIPMENT_KIND_INFO[kind].detailPanelKind;
  }, [asset.assetType?.placementKind]);

  // RACK 은 U-슬롯 그리드 때문에 더 넓은 패널(480), 그 외는 표준 384(w-96).
  const wide = spatialNeedsWidePanel(detailKind);

  return (
    <aside
      className={`${wide ? 'w-[480px]' : 'w-96'} shrink-0 border-l border-gray-200 bg-white h-full overflow-y-auto flex flex-col`}
    >
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 sticky top-0 bg-white z-10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* ISA-101: 종류 점은 무채색. 색은 상태 배지에만. */}
          <span className="inline-block w-2 h-2 rounded-full shrink-0 bg-eq-3" />
          <span className="text-sm font-semibold truncate">{asset.name}</span>
          <span className="text-xs text-gray-400 shrink-0">{asset.assetType.name}</span>
          {alert && <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning-bg text-warning font-medium shrink-0" title={alert.label}>{alert.label}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {asset.floorId ? (
            <button onClick={() => asset.floorId && (ws ? ws.gotoFloor(asset.floorId, asset.id) : navigate(floorPlanUrl(asset.floorId, asset.id)))}
              className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">도면에서 보기</button>
          ) : (
            <button disabled title="도면에 배치되지 않음"
              className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-300 cursor-not-allowed">도면에서 보기</button>
          )}
          <button aria-label="닫기" onClick={onClose} className="text-content-muted hover:text-content"><X size={16} /></button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        <AssetDetailBody equipmentId={asset.id} kind={detailKind} mode={mode} onPatch={onPatch} asset={asset} />
      </div>
    </aside>
  );
}

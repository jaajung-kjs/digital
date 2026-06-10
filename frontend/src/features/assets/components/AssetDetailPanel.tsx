import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Asset } from '../../../types/asset';
import { assetAlert } from '../alerts';
import { floorPlanUrl } from '../navUrls';
import { useWorkspaceNav } from '../../workspace/WorkspaceNavContext';
import { useSelection } from '../../workspace/SelectionContext';
import { AssetInspector } from './AssetInspector';

interface Props {
  asset: Asset;
  /** 'edit'(변전소 — 스테이징 편집) | 'view'(본부·사업소 — 읽기전용). 기본 'edit'. */
  mode?: 'edit' | 'view';
  onClose: () => void;
  onPatch?: (id: string, patch: Partial<Asset>) => void;
}

export function AssetDetailPanel({ asset, mode = 'edit', onClose, onPatch }: Props) {
  const navigate = useNavigate();
  const ws = useWorkspaceNav();
  const today = useMemo(() => new Date(), []);
  const alert = assetAlert(asset, today);
  const sel = useSelection();

  return (
    <aside className="w-96 shrink-0 border-l border-gray-200 bg-white h-full overflow-y-auto">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 sticky top-0 bg-white">
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

      <AssetInspector
        asset={asset}
        mode={mode}
        onPatch={onPatch}
        onSelectAsset={(id) => sel?.setSelectedAssetId(id)}
        today={today}
      />
    </aside>
  );
}

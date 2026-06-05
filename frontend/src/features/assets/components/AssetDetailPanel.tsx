import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Asset, UpdateAssetInput } from '../../../types/asset';
import { assetAlert } from '../alerts';
import { toDateInputValue } from '../../../utils/date';
import { AssetPhotoSection } from './AssetPhotoSection';
import { AssetMaintenanceSection } from './AssetMaintenanceSection';
import { AssetAttributesView } from './AssetAttributesView';
import { AssetLifecycleView } from './AssetLifecycleView';
import { floorPlanUrl } from '../navUrls';

interface Props {
  asset: Asset;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<UpdateAssetInput>) => void;
}

function Field({ label, value, onCommit, type = 'text' }: { label: string; value: string; onCommit: (v: string) => void; type?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm py-0.5">
      <span className="w-24 shrink-0 text-gray-500 text-xs">{label}</span>
      <input type={type} defaultValue={value} onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value); }}
        className="flex-1 px-1 py-0.5 border border-transparent hover:border-gray-200 focus:border-blue-400 rounded text-sm" />
    </label>
  );
}

export function AssetDetailPanel({ asset, onClose, onPatch }: Props) {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const alert = assetAlert(asset, today);

  return (
    <aside className="w-96 shrink-0 border-l border-gray-200 bg-white h-full overflow-y-auto">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 sticky top-0 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: asset.assetType.displayColor ?? '#94a3b8' }} />
          <span className="text-sm font-semibold truncate">{asset.name}</span>
          <span className="text-xs text-gray-400 shrink-0">{asset.assetType.name}</span>
          {alert && <span className="text-xs px-1.5 rounded bg-amber-100 text-amber-700 shrink-0" title={`${alert.label} (${alert.date})`}>⚠ {alert.label}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {asset.floorId ? (
            <button onClick={() => navigate(floorPlanUrl(asset.floorId!, asset.id))}
              className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">도면에서 보기</button>
          ) : (
            <button disabled title="도면에 배치되지 않음"
              className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-300 cursor-not-allowed">도면에서 보기</button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
        </div>
      </header>

      <section className="px-4 py-3">
        <Field label="이름" value={asset.name} onCommit={(v) => v.trim() && onPatch(asset.id, { name: v.trim() })} />
        <Field label="설치일" type="date" value={toDateInputValue(asset.installDate)} onCommit={(v) => onPatch(asset.id, { installDate: v || null })} />
        <Field label="담당자" value={asset.manager ?? ''} onCommit={(v) => onPatch(asset.id, { manager: v || null })} />
        <Field label="상태" value={asset.status ?? ''} onCommit={(v) => onPatch(asset.id, { status: v || null })} />
      </section>

      <section className="px-4 py-3 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">속성</h3>
        {(asset.assetType.fieldTemplate ?? []).length === 0 ? (
          <p className="text-xs text-gray-400">이 종류엔 속성 없음</p>
        ) : (
          <AssetAttributesView
            fields={asset.assetType.fieldTemplate ?? []}
            attributes={asset.attributes}
            readOnly={false}
            onChange={(key, v) => onPatch(asset.id, { attributes: { ...(asset.attributes ?? {}), [key]: v } })}
          />
        )}
      </section>

      <section className="px-4 py-3 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">생애주기</h3>
        <AssetLifecycleView
          asset={asset}
          today={today}
          readOnly={false}
          showAlert={false}
          onChange={(patch) => onPatch(asset.id, patch)}
        />
      </section>

      <AssetPhotoSection assetId={asset.id} />
      <AssetMaintenanceSection assetId={asset.id} />
    </aside>
  );
}

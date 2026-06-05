import type { Asset, AssetFieldDef, UpdateAssetInput } from '../../../types/asset';
import { assetAlert } from '../alerts';
import { AssetPhotoSection } from './AssetPhotoSection';
import { AssetMaintenanceSection } from './AssetMaintenanceSection';

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
  const fields: AssetFieldDef[] = asset.assetType.fieldTemplate ?? [];
  const alert = assetAlert(asset, new Date());
  const attrPatch = (key: string, v: string) => onPatch(asset.id, { attributes: { ...(asset.attributes ?? {}), [key]: v } });

  return (
    <aside className="w-96 shrink-0 border-l border-gray-200 bg-white h-full overflow-y-auto">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 sticky top-0 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: asset.assetType.displayColor ?? '#94a3b8' }} />
          <span className="text-sm font-semibold truncate">{asset.name}</span>
          <span className="text-xs text-gray-400 shrink-0">{asset.assetType.name}</span>
          {alert && <span className="text-xs px-1.5 rounded bg-amber-100 text-amber-700 shrink-0" title={`${alert.label} (${alert.date})`}>⚠ {alert.label}</span>}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm shrink-0">✕</button>
      </header>

      <section className="px-4 py-3">
        <Field label="이름" value={asset.name} onCommit={(v) => v.trim() && onPatch(asset.id, { name: v.trim() })} />
        <Field label="설치일" type="date" value={asset.installDate ?? ''} onCommit={(v) => onPatch(asset.id, { installDate: v || null })} />
        <Field label="담당자" value={asset.manager ?? ''} onCommit={(v) => onPatch(asset.id, { manager: v || null })} />
        <Field label="상태" value={asset.status ?? ''} onCommit={(v) => onPatch(asset.id, { status: v || null })} />
      </section>

      <section className="px-4 py-3 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">속성</h3>
        {fields.length === 0 ? <p className="text-xs text-gray-400">이 종류엔 속성 없음</p> :
          fields.map((f) => (
            <Field key={f.key} label={f.label} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              value={asset.attributes?.[f.key] != null ? String(asset.attributes[f.key]) : ''}
              onCommit={(v) => attrPatch(f.key, v)} />
          ))}
      </section>

      <section className="px-4 py-3 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">생애주기</h3>
        <Field label="교체예정" type="date" value={asset.replaceDue ?? ''} onCommit={(v) => onPatch(asset.id, { replaceDue: v || null })} />
        <Field label="하자보수기한" type="date" value={asset.warrantyUntil ?? ''} onCommit={(v) => onPatch(asset.id, { warrantyUntil: v || null })} />
      </section>

      <AssetPhotoSection assetId={asset.id} />
      <AssetMaintenanceSection assetId={asset.id} />
    </aside>
  );
}

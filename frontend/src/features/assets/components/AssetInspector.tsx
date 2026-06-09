import type { Asset, UpdateAssetInput } from '../../../types/asset';
import { toDateInputValue } from '../../../utils/date';
import { AssetPhotoSection } from './AssetPhotoSection';
import { AssetMaintenanceSection } from './AssetMaintenanceSection';
import { AssetAttributesView } from './AssetAttributesView';
import { useAssetConnections } from '../../connections/hooks/useAssetConnections';
import { useCableMutations } from '../../connections/hooks/useCableMutations';
import { AssetConnectionsSection } from '../../connections/components/AssetConnectionsSection';
import { CollapsibleSection } from '../../../components/CollapsibleSection';

interface Props {
  asset: Asset;
  mode: 'edit' | 'view';
  onPatch?: (id: string, patch: Partial<UpdateAssetInput>) => void;
  onSelectAsset: (id: string) => void;
  onGotoRegister?: (id: string) => void;
  /** @deprecated 생애주기 표시 제거로 미사용. 호출부 호환을 위해 유지. */
  today?: Date;
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

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm py-0.5">
      <span className="w-24 shrink-0 text-gray-500 text-xs">{label}</span>
      <span className="flex-1 px-1 py-0.5 text-sm">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

export function AssetInspector({ asset, mode, onPatch, onSelectAsset, onGotoRegister }: Props) {
  const ro = mode === 'view';
  const patch = (p: Partial<UpdateAssetInput>) => onPatch?.(asset.id, p);
  const { data: connections = [] } = useAssetConnections(asset.id);
  const { deleteCable, updateCable } = useCableMutations();

  return (
    <>
      <section className="px-4 py-3">
        {ro && onGotoRegister && (
          <button onClick={() => onGotoRegister(asset.id)}
            className="mb-2 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">수정</button>
        )}
        {ro ? (
          <>
            <ReadField label="이름" value={asset.name} />
            <ReadField label="설치일" value={toDateInputValue(asset.installDate)} />
            <ReadField label="담당자" value={asset.manager ?? ''} />
            <ReadField label="상태" value={asset.status ?? ''} />
          </>
        ) : (
          <>
            <Field label="이름" value={asset.name} onCommit={(v) => v.trim() && patch({ name: v.trim() })} />
            <Field label="설치일" type="date" value={toDateInputValue(asset.installDate)} onCommit={(v) => patch({ installDate: v || null })} />
            <Field label="담당자" value={asset.manager ?? ''} onCommit={(v) => patch({ manager: v || null })} />
            <Field label="상태" value={asset.status ?? ''} onCommit={(v) => patch({ status: v || null })} />
          </>
        )}
      </section>

      <section className="px-4 py-3 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">속성</h3>
        {(asset.assetType?.fieldTemplate ?? []).length === 0 ? (
          <p className="text-xs text-gray-400">이 종류엔 속성 없음</p>
        ) : (
          <AssetAttributesView
            fields={asset.assetType?.fieldTemplate ?? []}
            attributes={asset.attributes}
            readOnly={ro}
            onChange={(key, v) => patch({ attributes: { ...(asset.attributes ?? {}), [key]: v } })}
          />
        )}
      </section>

      <div className="px-4">
        <CollapsibleSection title="사진">
          <AssetPhotoSection assetId={asset.id} />
        </CollapsibleSection>
        <CollapsibleSection title="유지보수">
          <AssetMaintenanceSection assetId={asset.id} />
        </CollapsibleSection>
        <CollapsibleSection title="연결" badge={connections.length || undefined}>
          <AssetConnectionsSection
            assetId={asset.id}
            connections={connections}
            onDelete={(id) => { if (window.confirm('이 연결을 삭제할까요?')) deleteCable.mutate(id); }}
            onUpdate={(id, p) => updateCable.mutate({ id, patch: p })}
            onSelectAsset={onSelectAsset}
          />
        </CollapsibleSection>
      </div>
    </>
  );
}

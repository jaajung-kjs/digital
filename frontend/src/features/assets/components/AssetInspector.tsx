import type { Asset } from '../../../types/asset';
import { toDateInputValue } from '../../../utils/date';
import { AssetPhotoSection } from './AssetPhotoSection';
import { LogsTab } from '../../equipment/components/detail/LogsTab';
import { AssetAttributesView } from './AssetAttributesView';
import { useAssetConnections } from '../../connections/hooks/useAssetConnections';
import { useCableMutations } from '../../connections/hooks/useCableMutations';
import { AssetConnectionsSection } from '../../connections/components/AssetConnectionsSection';
import { CollapsibleSection } from '../../../components/CollapsibleSection';
import { useEffectiveAssets } from '../../workingCopy/hooks';

/**
 * 단일 상세 인스펙터(SSOT) — 평면도(에디터)·현황·대장 그리드 모든 진입점에서
 * 같은 필드·같은 편집·같은 staging(상위가 넘기는 onPatch=stageAssetUpdate)으로 동작.
 *
 * onPatch 는 Asset 부분 패치를 받는다(UpdateAssetInput 의 상위집합) — 설명/크기 같은
 * 설비(equipment)-레벨 필드도 Asset 에 직접 존재하므로 별도 overlay 없이 동일 경로로 stage.
 *   - 설명(description): 모든 컨텍스트에서 편집 가능.
 *   - 크기(width2d/height2d): 평면도에 배치된 자산(=에디터 컨텍스트)에서만 노출/편집.
 *     비배치(현황·대장 리스트)에서는 width2d/height2d 가 없으므로 자동으로 숨겨진다.
 */
interface Props {
  asset: Asset;
  mode: 'edit' | 'view';
  onPatch?: (id: string, patch: Partial<Asset>) => void;
  onSelectAsset: (id: string) => void;
  /** @deprecated 생애주기 표시 제거로 미사용. 호출부 호환을 위해 유지. */
  today?: Date;
}

function Field({ label, value, onCommit, type = 'text' }: { label: string; value: string; onCommit: (v: string) => void; type?: string }) {
  const commit = (v: string) => { if (v !== value) onCommit(v); };
  return (
    <label className="flex items-center gap-2 text-sm py-0.5">
      <span className="w-24 shrink-0 text-content-muted text-xs">{label}</span>
      <input
        type={type}
        defaultValue={value}
        onBlur={(e) => commit(e.target.value)}
        // Enter 즉시 반영(blur→commit). 날짜는 선택만 해도 즉시 반영(onChange).
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        onChange={type === 'date' ? (e) => commit(e.target.value) : undefined}
        className="flex-1 px-1 py-0.5 border border-transparent hover:border-line focus:border-primary rounded text-sm" />
    </label>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm py-0.5">
      <span className="w-24 shrink-0 text-content-muted text-xs">{label}</span>
      <span className="flex-1 px-1 py-0.5 text-sm">{value || <span className="text-content-faint">—</span>}</span>
    </div>
  );
}

/** 설명 — 여러 줄. 평면도/현황/대장 동일하게 노출(읽기/편집). */
function DescField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm py-0.5">
      <span className="w-24 shrink-0 text-content-muted text-xs pt-1">설명</span>
      <textarea defaultValue={value} rows={2} onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value); }}
        className="flex-1 px-1 py-0.5 border border-transparent hover:border-line focus:border-primary rounded text-sm resize-none" />
    </label>
  );
}

export function AssetInspector({ asset, mode, onPatch, onSelectAsset }: Props) {
  const ro = mode === 'view';
  const patch = (p: Partial<Asset>) => onPatch?.(asset.id, p);
  const { data: connections = [] } = useAssetConnections(asset.id);
  const { deleteCable, updateCable } = useCableMutations();

  // 랙 모듈(parentAssetId 있음) — leaf 자산. 카테고리/슬롯 위치는 읽기전용으로 노출하고
  // 상위 랙으로 돌아가는 breadcrumb 를 보여준다. (구 RackModuleDialog 의 RO 정보 대체.)
  const isModule = asset.parentAssetId != null;
  const effectiveAssets = useEffectiveAssets();
  const parentRack = isModule
    ? effectiveAssets.find((a) => a.id === asset.parentAssetId) ?? null
    : null;
  const slotIndex = asset.slotIndex ?? 0;
  const slotSpan = asset.slotSpan ?? 1;
  const categoryLabel = asset.assetType?.name ?? '';

  // 종류 — 읽기전용. assetType.name(대장 레코드) 우선, 없으면 placementKind.
  const kindLabel = asset.assetType?.name ?? asset.assetType?.placementKind ?? '';
  // 크기 — 평면도에 배치된 자산에만 존재(현황·대장 리스트에는 없음).
  const isPlaced = asset.width2d != null || asset.height2d != null;
  const sizeValue = isPlaced
    ? `${asset.width2d != null ? Math.round(asset.width2d) : '-'} x ${asset.height2d != null ? Math.round(asset.height2d) : '-'}`
    : '';

  return (
    <>
      {/* 랙으로 — 모듈에서 상위 랙 패널로 복귀. onSelectAsset 이 에디터/현황/대장 모두에서
          공유 선택을 통해 상위 랙 상세 패널을 연다. */}
      {isModule && parentRack && (
        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={() => onSelectAsset(parentRack.id)}
            className="text-xs text-primary hover:text-primary-hover hover:underline"
          >
            ← {parentRack.name}
          </button>
        </div>
      )}

      <section className="px-4 py-3">
        {ro ? (
          <>
            <ReadField label="이름" value={asset.name} />
            {/* 모듈은 종류 대신 카테고리/슬롯 위치(RO)를 보여준다. */}
            {isModule ? (
              <>
                <ReadField label="카테고리" value={categoryLabel} />
                <ReadField label="슬롯 위치" value={`슬롯 ${slotIndex + 1}–${slotIndex + slotSpan} (${slotSpan}슬롯)`} />
              </>
            ) : (
              <ReadField label="종류" value={kindLabel} />
            )}
            <ReadField label="담당자" value={asset.manager ?? ''} />
            <ReadField label="설치일" value={toDateInputValue(asset.installDate)} />
            <ReadField label="상태" value={asset.status ?? ''} />
            {isPlaced && <ReadField label="크기 (px)" value={sizeValue} />}
            <ReadField label="설명" value={asset.description ?? ''} />
          </>
        ) : (
          <>
            <Field label="이름" value={asset.name} onCommit={(v) => v.trim() && patch({ name: v.trim() })} />
            {/* 종류는 항상 읽기전용 — 변경은 대장 종류 변경(별도 흐름)에서만.
                모듈은 종류 대신 카테고리/슬롯 위치(RO). */}
            {isModule ? (
              <>
                <ReadField label="카테고리" value={categoryLabel} />
                <ReadField label="슬롯 위치" value={`슬롯 ${slotIndex + 1}–${slotIndex + slotSpan} (${slotSpan}슬롯)`} />
              </>
            ) : (
              <ReadField label="종류" value={kindLabel} />
            )}
            <Field label="담당자" value={asset.manager ?? ''} onCommit={(v) => patch({ manager: v || null })} />
            <Field label="설치일" type="date" value={toDateInputValue(asset.installDate)} onCommit={(v) => patch({ installDate: v || null })} />
            <Field label="상태" value={asset.status ?? ''} onCommit={(v) => patch({ status: v || null })} />
            {isPlaced && (
              <ReadField label="크기 (px)" value={sizeValue} />
            )}
            <DescField value={asset.description ?? ''} onCommit={(v) => patch({ description: v || null })} />
          </>
        )}
      </section>

      <section className="px-4 py-3 border-t border-line">
        <h3 className="text-sm font-semibold text-content mb-1">속성</h3>
        {(asset.assetType?.fieldTemplate ?? []).length === 0 ? (
          <p className="text-xs text-content-faint">이 종류엔 속성 없음</p>
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
          {/* 단일 유지보수 UX(LogsTab) — 종류/날짜/심각도/설명 + 편집. 보류 큐 공유. */}
          <LogsTab equipmentId={asset.id} readOnly={ro} />
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

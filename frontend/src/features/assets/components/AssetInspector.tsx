import { useRef, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import type { Asset } from '../../../types/asset';
import { toDateInputValue } from '../../../utils/date';
import { IconAction } from './detail/SectionShell';
import { DetailTabs } from './detail/DetailTabs';
import { AssetPhotoSection } from './AssetPhotoSection';
import { InspectionSection } from './detail/InspectionSection';
import { LogsTab } from '../../equipment/components/detail/LogsTab';
import { useEffectiveAssetConnections } from '../../connections/hooks/useEffectiveAssetConnections';
import { AssetConnectionsSection } from '../../connections/components/AssetConnectionsSection';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { statusIsOn } from '../nodeStatus';

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
  /** 종류별 공간 섹션(랙 실장도 / OFD 경로 / 분전반 회로) — 있으면 정보 탭 하단에 함께 노출. */
  spatial?: ReactNode;
  /** 공간 섹션 제목(실장도 등). */
  spatialLabel?: string;
  /** @deprecated 생애주기 표시 제거로 미사용. 호출부 호환을 위해 유지. */
  today?: Date;
}

/* 인라인 편집 affordance(#6·#8): 밑줄(줄찍찍) 제거. 평소엔 값을 plain text 로 보여주고,
   우측 연필(옅게→hover 시 또렷이) 또는 값 클릭 시 인풋으로 전환. 편집 인풋은 중립 보더. */
const INLINE_INPUT =
  'flex-1 min-w-0 px-1.5 py-0.5 rounded text-sm bg-surface border border-line ' +
  'focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-colors';

const ROW = 'group flex items-center gap-2 text-sm py-1';
const LABEL = 'w-20 shrink-0 text-content-muted text-xs';
const VALUE = 'flex-1 min-w-0 text-sm text-content truncate';
const PENCIL =
  'shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 group-focus-within:opacity-100 transition-opacity';

function openPicker(el: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!el) return;
  el.focus();
  // 날짜는 picker 도 띄워 클릭 1번에 바로 선택. (지원 브라우저 한정 — 없으면 focus 로 충분.)
  const anyEl = el as HTMLInputElement & { showPicker?: () => void };
  if (el instanceof HTMLInputElement && el.type === 'date' && typeof anyEl.showPicker === 'function') {
    try { anyEl.showPicker(); } catch { /* user-gesture 밖이면 무시 */ }
  }
}

function Field({ label, value, onCommit, type = 'text' }: { label: string; value: string; onCommit: (v: string) => void; type?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(type === 'date');
  const commit = (v: string) => { if (v !== value) onCommit(v); };
  const start = () => { setEditing(true); requestAnimationFrame(() => openPicker(ref.current)); };
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      {editing ? (
        <input
          ref={ref}
          type={type}
          defaultValue={value}
          autoFocus={type !== 'date'}
          onBlur={(e) => { commit(e.target.value); if (type !== 'date') setEditing(false); }}
          // Enter 즉시 반영(blur→commit). 날짜는 선택만 해도 즉시 반영(onChange).
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          onChange={type === 'date' ? (e) => commit(e.target.value) : undefined}
          className={INLINE_INPUT} />
      ) : (
        <button type="button" onClick={start} className={`${VALUE} text-left hover:text-primary transition-colors`}>
          {value || <span className="text-content-faint">—</span>}
        </button>
      )}
      <span className={PENCIL}>
        <IconAction onClick={start} title={`${label} 수정`}>
          <Pencil size={13} />
        </IconAction>
      </span>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm py-1">
      <span className={LABEL}>{label}</span>
      <span className={VALUE}>{value || <span className="text-content-faint">—</span>}</span>
    </div>
  );
}

/** 설명 — 여러 줄. 평면도/현황/대장 동일하게 노출(읽기/편집). */
function DescField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const start = () => { setEditing(true); requestAnimationFrame(() => ref.current?.focus()); };
  return (
    <div className="group flex items-start gap-2 text-sm py-1">
      <span className={`${LABEL} pt-1`}>설명</span>
      {editing ? (
        <textarea ref={ref} defaultValue={value} rows={2} autoFocus
          onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value); setEditing(false); }}
          className={`${INLINE_INPUT} resize-none`} />
      ) : (
        <button type="button" onClick={start} className="flex-1 min-w-0 text-sm text-content text-left whitespace-pre-wrap break-words hover:text-primary transition-colors">
          {value || <span className="text-content-faint">—</span>}
        </button>
      )}
      <span className={`${PENCIL} pt-0.5`}>
        <IconAction onClick={start} title="설명 수정">
          <Pencil size={13} />
        </IconAction>
      </span>
    </div>
  );
}

function StatusPill({ on }: { on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${on ? 'bg-success-bg text-success' : 'bg-surface-2 text-content-muted'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-success' : 'bg-content-faint'}`} />
      {on ? 'ON' : 'OFF'}
    </span>
  );
}
function StatusField({ value, onCommit, readOnly }: { value: string | null; onCommit?: (v: string) => void; readOnly?: boolean }) {
  const on = statusIsOn(value);
  return (
    <div className="flex items-center gap-2 text-sm py-1">
      <span className="w-20 shrink-0 text-content-muted text-xs">상태</span>
      {readOnly ? (
        <StatusPill on={on} />
      ) : (
        <button type="button" role="switch" aria-checked={on} onClick={() => onCommit?.(on ? 'OFF' : 'ON')}
          title="클릭하여 ON/OFF 전환"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-transform active:scale-95">
          <StatusPill on={on} />
        </button>
      )}
    </div>
  );
}

export function AssetInspector({ asset, mode, onPatch, onSelectAsset, spatial, spatialLabel }: Props) {
  const ro = mode === 'view';
  const patch = (p: Partial<Asset>) => onPatch?.(asset.id, p);
  // C1/C2: 연결은 effective(워킹카피)에서 읽고 stage 로 쓴다 — 서버 즉시 CRUD 제거.
  const connections = useEffectiveAssetConnections(asset.id);
  const stageCableUpdate = useSubstationWorkingCopy((s) => s.stageCableUpdate);
  const stageCableDelete = useSubstationWorkingCopy((s) => s.stageCableDelete);

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

  // 정보 탭 — 식별/생애주기 필드(밑줄 없음, 연필-인라인) + (있으면) 공간 섹션(실장도 등).
  // 필드는 라인 없이 여백으로 구분, 공간 섹션 사이에만 아주 옅은 구분선 하나.
  const infoTab = (
    <div className="space-y-0.5">
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
          <StatusField value={asset.status} readOnly />
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
          <StatusField value={asset.status} onCommit={(v) => patch({ status: v })} />
          {isPlaced && (
            <ReadField label="크기 (px)" value={sizeValue} />
          )}
          <DescField value={asset.description ?? ''} onCommit={(v) => patch({ description: v || null })} />
        </>
      )}

      {/* 공간 섹션(실장도/OFD 경로/분전반 회로) — 정보 탭 안. 필드 블록과 옅은 구분선 하나로만 분리. */}
      {spatial && (
        <div className="mt-4 pt-3 border-t border-line">
          {spatialLabel && (
            <h3 className="text-sm font-semibold text-content-muted mb-2">{spatialLabel}</h3>
          )}
          {spatial}
        </div>
      )}
    </div>
  );

  const tabs = [
    { label: '정보', render: () => infoTab },
    { label: '점검', render: () => <InspectionSection assetId={asset.id} /> },
    // 고장/수리 이력(점검은 별도 점검 탭). 종류/날짜/심각도/설명 + 편집. 보류 큐 공유.
    { label: '고장이력', render: () => <LogsTab equipmentId={asset.id} readOnly={ro} /> },
    { label: '사진', render: () => <AssetPhotoSection assetId={asset.id} /> },
    {
      label: '연결',
      render: () => (
        <AssetConnectionsSection
          assetId={asset.id}
          connections={connections}
          onDelete={(id) => { if (window.confirm('이 연결을 삭제할까요?')) stageCableDelete(id); }}
          onUpdate={(id, p) => stageCableUpdate(id, p)}
          onSelectAsset={onSelectAsset}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 랙으로 — 모듈에서 상위 랙 패널로 복귀. onSelectAsset 이 에디터/현황/대장 모두에서
          공유 선택을 통해 상위 랙 상세 패널을 연다. */}
      {isModule && parentRack && (
        <div className="px-4 pt-2 shrink-0">
          <button
            type="button"
            onClick={() => onSelectAsset(parentRack.id)}
            className="text-xs text-primary hover:text-primary-hover hover:underline"
          >
            ← {parentRack.name}
          </button>
        </div>
      )}
      <DetailTabs tabs={tabs} />
    </div>
  );
}

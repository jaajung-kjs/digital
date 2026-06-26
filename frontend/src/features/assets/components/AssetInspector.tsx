import { useRef, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import type { Asset } from '../../../types/asset';
import { toDateInputValue } from '../../../utils/date';
import { IconAction } from './detail/SectionShell';
import { EditableField } from './EditableField';
import { DetailTabs } from './detail/DetailTabs';
import { AssetPhotoSection } from './AssetPhotoSection';
import { InspectionSection } from './detail/InspectionSection';
import { LogsTab } from './detail/LogsTab';
import { AssetConnectionsTab } from '../../connections/components/AssetConnectionsTab';
import { isRackModuleAsset } from '../../workingCopy/assetClassify';
import { statusIsOn } from '../nodeStatus';
import { useTraceGraph } from '../../trace/traceGraph';
import { fiberSlotLabel } from '../../fiber/fiberSlotLabel';

/**
 * 단일 상세 인스펙터(SSOT) — 평면도(에디터)·현황·대장 그리드 모든 진입점에서
 * 같은 필드·같은 편집·같은 staging(상위가 넘기는 onPatch=stageAssetUpdate)으로 동작.
 *
 * onPatch 는 Asset 부분 패치를 받는다(UpdateAssetInput 의 상위집합) — 설명/크기 같은
 * 자산 레벨 필드도 Asset 에 직접 존재하므로 별도 overlay 없이 동일 경로로 stage.
 *   - 설명(description): 모든 컨텍스트에서 편집 가능.
 *   - 크기(width2d/height2d): 평면도에 배치된 자산(=에디터 컨텍스트)에서만 노출/편집.
 *     비배치(현황·대장 리스트)에서는 width2d/height2d 가 없으므로 자동으로 숨겨진다.
 */
interface Props {
  asset: Asset;
  mode: 'edit' | 'view';
  onPatch?: (id: string, patch: Partial<Asset>) => void;
  /** @deprecated 연결 탭이 읽기전용 경로 뷰로 바뀌며 끝점 직접 네비게이션 제거 — 호출부 호환 위해 유지. */
  onSelectAsset?: (id: string) => void;
  /** 종류별 공간 섹션(랙 실장도 / OFD 경로 / 분전반 회로) — 있으면 정보 탭 하단에 함께 노출. */
  spatial?: ReactNode;
  /** 공간 섹션 제목(실장도 등). */
  spatialLabel?: string;
  /** @deprecated 생애주기 표시 제거로 미사용. 호출부 호환을 위해 유지. */
  today?: Date;
  /** 처음 활성화할 탭 라벨(예: '연결'). 없으면 첫 탭. */
  initialTab?: string;
}

/* 인라인 편집 affordance(#6·#8): 밑줄(줄찍찍) 제거. 평소엔 값을 plain text 로 보여주고,
   우측 연필(옅게→hover 시 또렷이) 또는 값 클릭 시 인풋으로 전환. 편집 인풋은 중립 보더. */
const INLINE_INPUT =
  'flex-1 min-w-0 px-1.5 py-0.5 rounded text-sm bg-surface border border-line ' +
  'focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-colors';

const LABEL = 'w-20 shrink-0 text-content-muted text-xs';
const VALUE = 'flex-1 min-w-0 text-sm text-content truncate';
const PENCIL =
  'shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 group-focus-within:opacity-100 transition-opacity';

/** 단일 줄 텍스트·날짜 편집 — 공유 EditableField 래퍼. valueClickEdits 로 값 클릭도 편집 시작. */
function Field({ label, value, onCommit, type = 'text' }: { label: string; value: string; onCommit: (v: string) => void; type?: 'text' | 'date' }) {
  return (
    <div className="flex items-center gap-2 text-sm py-1">
      <span className={LABEL}>{label}</span>
      <EditableField value={value} type={type} ariaLabel={label} valueClickEdits onCommit={onCommit} />
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
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${on ? 'bg-danger-bg text-danger' : 'bg-surface-2 text-content-muted'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-danger' : 'bg-content-faint'}`} />
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

/**
 * P5b-render: 스칼라(식별/생애주기) 필드를 스키마-드리븐으로 렌더. 새 자산 필드 추가가
 * JSX 편집이 아니라 이 스키마 한 줄 추가로 끝나도록 한다. 현재 하드코딩과 라벨·순서·컴포넌트·
 * 커밋 강제(coercion)가 바이트 동일해야 한다 — 각 타입별 핸들러가 그 규칙을 캡슐화한다.
 *
 * 종류별(fieldTemplate) 필드는 의도적으로 제외(보류): #7 에서 Asset.attributes 가 제거돼
 * fieldTemplate 키의 자산별 값 소스가 없고(스칼라 컬럼은 백엔드 ASSET_SCALAR_FIELDS 로 고정),
 * AssetInspector 테스트가 모델/속성 UI 미렌더를 명시적으로 단언한다. 값 소스가 확인되면 추가.
 */
type FieldType = 'text' | 'date' | 'status' | 'textarea';
interface AssetFieldDef {
  key: keyof Asset | string;
  label: string;
  type: FieldType;
}
const BASE_ASSET_FIELDS: AssetFieldDef[] = [
  { key: 'name',        label: '이름',   type: 'text' },
  { key: 'manager',     label: '담당자', type: 'text' },
  { key: 'installDate', label: '설치일', type: 'date' },
  { key: 'status',      label: '상태',   type: 'status' },
  { key: 'description', label: '설명',   type: 'textarea' },
];

/** 타입별: asset → 표시/편집 값(문자열). 하드코딩과 동일한 추출 규칙. */
function fieldValue(field: AssetFieldDef, asset: Asset): string {
  // 종류별(fieldTemplate) 키는 동적 — Asset 의 명시 컬럼 밖이라 이 한 곳만 동적 인덱싱 허용.
  // (Asset 타입은 인덱스 시그니처 없이 명시 필드만 — 오타·잔재 컬럼은 타입에러로 차단.)
  const raw = (asset as unknown as Record<string, unknown>)[field.key];
  if (field.type === 'date') return toDateInputValue((raw as string | null) ?? null);
  return (raw as string | null) ?? '';
}

/** 타입별: 편집 커밋 시 patch 강제(coercion). 하드코딩과 동일한 규칙(바이트 동일 출력). */
function fieldPatch(field: AssetFieldDef, v: string): Partial<Asset> | null {
  switch (field.key) {
    case 'name':
      return v.trim() ? { name: v.trim() } : null; // 비어 있으면 patch 안 함
    case 'status':
      return { status: v };
    default:
      return { [field.key]: v || null }; // manager/installDate/description
  }
}

export function AssetInspector({ asset, mode, onPatch, spatial, spatialLabel, initialTab }: Props) {
  const ro = mode === 'view';
  const patch = (p: Partial<Asset>) => onPatch?.(asset.id, p);
  const { graph } = useTraceGraph();

  // 랙 모듈(parentAssetId + slotIndex 둘 다 있음) — leaf 자산. 카테고리/슬롯 위치는 읽기전용으로 노출.
  // 상위 자산 네비게이션은 헤더 브레드크럼(AssetDetailPanel)으로 이동.
  const isModule = isRackModuleAsset(asset);
  const slotIndex = asset.slotIndex ?? 0;
  const slotSpan = asset.slotSpan ?? 1;
  const categoryLabel = asset.assetType?.name ?? '';

  // 종류 — 읽기전용. assetType.name(대장 레코드).
  const kindLabel = asset.assetType?.name ?? '';
  // 크기 — 평면도에 배치된 자산에만 존재(현황·대장 리스트에는 없음).
  const isPlaced = asset.width2d != null || asset.height2d != null;
  const sizeValue = isPlaced
    ? `${asset.width2d != null ? Math.round(asset.width2d) : '-'} x ${asset.height2d != null ? Math.round(asset.height2d) : '-'}`
    : '';

  // 스키마-드리븐 렌더러 — type → 기존 컴포넌트. read/edit 모두 하드코딩과 동일 DOM·props.
  const renderField = (field: AssetFieldDef) => {
    // 경로슬롯(conduit): 이름은 파생(자국-대국#코어수) 읽기전용 — 수정 불가.
    if (field.key === 'name' && asset.assetType?.role === 'slot') {
      return <ReadField key="name" label={field.label} value={fiberSlotLabel(asset.id, graph) || (asset.name ?? '')} />;
    }
    // 상태 필드: read/edit 모두 StatusField(값은 raw status, readOnly 토글만 다름).
    if (field.type === 'status') {
      return ro
        ? <StatusField key={field.key} value={asset.status} readOnly />
        : <StatusField key={field.key} value={asset.status} onCommit={(v) => patch({ status: v })} />;
    }
    const value = fieldValue(field, asset);
    if (ro) return <ReadField key={field.key} label={field.label} value={value} />;
    const commit = (v: string) => { const p = fieldPatch(field, v); if (p) patch(p); };
    if (field.type === 'textarea') return <DescField key={field.key} value={value} onCommit={commit} />;
    return (
      <Field
        key={field.key}
        label={field.label}
        value={value}
        onCommit={commit}
        {...(field.type === 'date' ? { type: 'date' } : {})}
      />
    );
  };

  // 정보 탭 — 식별/생애주기 필드(밑줄 없음, 연필-인라인) + (있으면) 공간 섹션(실장도 등).
  // 필드는 라인 없이 여백으로 구분, 공간 섹션 사이에만 아주 옅은 구분선 하나.
  // 순서 재현: 이름 → [종류/모듈 카테고리·슬롯(RO)] → 담당자 → 설치일 → 상태 → [크기(RO)] → 설명.
  // 종류/카테고리/슬롯/크기는 자산 컬럼이 아니라 파생 RO 값이라 스키마 밖(JSX)에 그대로 둔다.
  const kindFields = isModule ? (
    <>
      <ReadField label="카테고리" value={categoryLabel} />
      <ReadField label="슬롯 위치" value={`슬롯 ${slotIndex + 1}–${slotIndex + slotSpan} (${slotSpan}슬롯)`} />
    </>
  ) : (
    <ReadField label="종류" value={kindLabel} />
  );
  const infoTab = (
    <div className="space-y-0.5">
      {renderField(BASE_ASSET_FIELDS[0]) /* 이름 */}
      {kindFields}
      {renderField(BASE_ASSET_FIELDS[1]) /* 담당자 */}
      {renderField(BASE_ASSET_FIELDS[2]) /* 설치일 */}
      {renderField(BASE_ASSET_FIELDS[3]) /* 상태 */}
      {isPlaced && <ReadField label="크기 (px)" value={sizeValue} />}
      {renderField(BASE_ASSET_FIELDS[4]) /* 설명 */}

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
    { label: '고장이력', render: () => <LogsTab assetId={asset.id} readOnly={ro} /> },
    { label: '사진', render: () => <AssetPhotoSection assetId={asset.id} /> },
    { label: '연결', render: () => <AssetConnectionsTab assetId={asset.id} /> },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DetailTabs tabs={tabs} initial={initialTab} />
    </div>
  );
}

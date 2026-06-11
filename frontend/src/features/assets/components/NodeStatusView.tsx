import { useEffect, useMemo, useState } from 'react';
import { useNodeAssets, type NodeKind } from '../../../hooks/useNodeAssets';
import { useSelection } from '../../workspace/SelectionContext';
import { installLocation, inspectionState, type AssetListItem } from '../nodeStatus';
import { assetAlert } from '../alerts';
import { useAsset } from '../hooks/useAsset';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets, useEffectiveAssetsOverlay, useUnifiedDirty } from '../../workingCopy/hooks';
import { StatusSummary } from './StatusSummary';
import { AssetDetailPanel } from './AssetDetailPanel';
import { Badge, type BadgeStatus } from '../../../components/ui';
import type { Asset } from '../../../types/asset';

const COLUMNS = ['종류', '이름', '설치장소', '설치일', '담당자', '마지막 점검일', '상태'] as const;

function uniq(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

/** asset overlay update patch 의 공유 필드만 골라 AssetListItem 키로 매핑(있는 키만). */
function assetPatchToListItem(patch: Partial<Asset>): Partial<AssetListItem> {
  const out: Partial<AssetListItem> = {};
  if ('name' in patch) out.name = patch.name as string;
  if ('manager' in patch) out.manager = patch.manager ?? null;
  if ('installDate' in patch) out.installDate = patch.installDate ?? null;
  if ('status' in patch) out.status = patch.status ?? null;
  return out;
}

// 자산 상태 = ON/OFF 이진(기본 ON, 'OFF' 일 때만 OFF). 색은 ON=success/OFF=neutral.
const statusIsOn = (status: string | null | undefined) => status !== 'OFF';

function AssetRow({
  item,
  today,
  selected,
  onSelect,
}: {
  item: AssetListItem;
  today: Date;
  selected?: boolean;
  onSelect: () => void;
}) {
  const alert = assetAlert({ installDate: item.installDate }, today);
  const insp = inspectionState(item.lastMaintenanceDate, today);
  const inspClass =
    insp.level === 'none' ? 'text-content-faint' : insp.level === 'overdue' ? 'text-warning font-medium' : 'text-content';
  return (
    <tr
      onClick={onSelect}
      className={`h-12 cursor-pointer border-b border-line transition-colors ${
        selected ? 'bg-info-bg shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-surface-2'
      }`}
    >
      <td className="pl-4 pr-2 text-sm text-content align-middle whitespace-nowrap">{item.assetTypeName}</td>
      <td className="px-2 text-sm align-middle whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-content">{item.name}</span>
          {alert && <Badge status="danger">{alert.label}</Badge>}
        </span>
      </td>
      <td className="px-2 text-sm text-content-muted align-middle whitespace-nowrap max-w-[14rem] truncate" title={installLocation(item)}>{installLocation(item)}</td>
      <td className="px-2 text-sm text-content-muted align-middle whitespace-nowrap">
        {item.installDate ? new Date(item.installDate).toLocaleDateString('ko-KR') : '—'}
      </td>
      <td className="px-2 text-sm text-content-muted align-middle whitespace-nowrap">{item.manager ?? '—'}</td>
      <td className={`px-2 text-sm align-middle whitespace-nowrap ${inspClass}`}>{insp.label}</td>
      <td className="px-2 pr-4 text-sm align-middle whitespace-nowrap">
        <Badge status={statusIsOn(item.status) ? 'success' : 'neutral'}>
          {statusIsOn(item.status) ? 'ON' : 'OFF'}
        </Badge>
      </td>
    </tr>
  );
}

/**
 * 선택된 자산의 인스펙터(본부·사업소 — 워킹카피가 SSOT).
 *
 * SSOT 불변식: 모든 편집은 자산이 속한 변전소 working copy 에 stage 돼야 한다(직접 PUT 제거).
 * - 대상 변전소(targetSubstationId)의 working copy 가 로드돼 있으면: 인스펙터는 편집 모드,
 *   자산은 effective(스테이징 반영)에서 해석 → stage 한 편집이 인스펙터·리스트에 즉시 반영.
 * - 가드: 다른 변전소가 로드돼 있고 미저장(dirty>0)이면 절대 전환하지 않고 읽기전용 + 안내.
 * - 로드 직후(effective 비어있음) 동안만 useAsset 페치로 읽기전용 표시(스테이지 불가).
 */
function StagedEditDetailPanel({
  assetId,
  targetSubstationId,
  loadedSubstationId,
  blockedByDirtyName,
  onClose,
}: {
  assetId: string;
  targetSubstationId: string;
  /** 현재 로드된 변전소(=working copy store 의 substationId). */
  loadedSubstationId: string | null;
  /** 가드 발동 시(다른 변전소가 미저장) — 그 변전소 이름(없으면 null). 가드 아니면 undefined. */
  blockedByDirtyName: string | null | undefined;
  onClose: () => void;
}) {
  const effective = useEffectiveAssets();
  const { data: fetched } = useAsset(assetId);

  // 가드: 다른 변전소가 미저장 상태 → 읽기전용 + 안내. 편집(stage) 차단.
  if (blockedByDirtyName !== undefined) {
    const name = blockedByDirtyName ?? '다른 변전소';
    return (
      <aside className="w-96 shrink-0 border-l border-line bg-surface h-full overflow-y-auto">
        <div className="px-4 py-3 border-b border-line bg-warning-bg text-sm text-warning">
          다른 변전소({name})에 미저장 변경이 있습니다. 먼저 저장하거나 되돌린 뒤 편집하세요.
        </div>
        {fetched && (
          <AssetDetailPanel key={fetched.id} asset={fetched} mode="view" onClose={onClose} />
        )}
      </aside>
    );
  }

  // 대상 변전소가 아직 로드 안 됨(로딩 중) → useAsset 페치로 읽기전용 표시(스테이지 불가).
  const loaded = loadedSubstationId === targetSubstationId;
  const asset = loaded ? effective.find((a) => a.id === assetId) : undefined;
  const display = asset ?? fetched;
  if (!display) {
    return (
      <aside className="w-96 shrink-0 border-l border-line bg-surface h-full overflow-y-auto p-4 text-sm text-content-muted">
        불러오는 중…
      </aside>
    );
  }
  return (
    <AssetDetailPanel
      key={display.id}
      asset={display}
      mode={asset ? 'edit' : 'view'}
      onClose={onClose}
      onPatch={
        asset
          ? (id, patch) => useSubstationWorkingCopy.getState().stageAssetUpdate(id, patch)
          : undefined
      }
    />
  );
}

export function NodeStatusView({
  nodeType,
  nodeId,
  rows,
  resolveAsset,
  onPatch,
}: {
  nodeType: NodeKind;
  nodeId: string;
  /** 행 데이터 직접 주입(예: 현황 — 통합 store overlay 머지). 없으면 useNodeAssets 사용. */
  rows?: AssetListItem[];
  /** 선택 자산의 풀 Asset 을 해석(변전소: effective 에서 lookup). 없으면 useAsset 페치(읽기전용). */
  resolveAsset?: (id: string) => Asset | undefined;
  /** 편집 스테이지(변전소 — 통합 store). 있으면 인스펙터는 편집 모드. */
  onPatch?: (id: string, patch: Partial<Asset>) => void;
}) {
  // rows 가 주입되면(현황 — 통합 store 머지) useNodeAssets 구독은 불필요 → 비활성화.
  const skip = rows !== undefined;
  const { data: fetchedItems = [] } = useNodeAssets(skip ? null : nodeType, skip ? null : nodeId);

  // 본부·사업소 경로: resolveAsset/onPatch 가 주입되지 않은 곳(변전소 현황은 SubstationStatusView 가 주입).
  // 이 경로는 더 이상 직접 저장하지 않고, 자산이 속한 변전소 working copy 에 온디맨드 로드 후 stage 한다.
  const isHqPath = resolveAsset === undefined && onPatch === undefined;
  const loadedSubstationId = useSubstationWorkingCopy((s) => s.substationId);
  const dirty = useUnifiedDirty();
  const overlay = useEffectiveAssetsOverlay();
  const effectiveAssetsRef = useEffectiveAssets();

  // 라이브 머지(본부·사업소): 로드된 변전소에 속한 행만 effective(스테이징 반영)로 덮어쓴다.
  // 다른 변전소 행은 백엔드 페치 그대로 — 변전소 현황(useSubstationStatusRows)과 동일한 동작.
  const fetchedMerged = useMemo(() => {
    if (!isHqPath || !loadedSubstationId) return fetchedItems;
    const deleted = new Set(overlay.deletes);
    return fetchedItems
      .filter((r) => !(r.substationId === loadedSubstationId && deleted.has(r.id)))
      .map((r) => {
        if (r.substationId !== loadedSubstationId) return r;
        const p = overlay.updates[r.id];
        return p ? { ...r, ...assetPatchToListItem(p) } : r;
      });
  }, [isHqPath, loadedSubstationId, fetchedItems, overlay]);

  // rows 가 주어지면 그것을 데이터 소스로(필터/요약 모두 items 기준).
  const items = rows ?? fetchedMerged;
  const today = useMemo(() => new Date(), []);

  // 선택: 공유 SelectionContext 가 있으면(변전소 워크스페이스 — 에디터 선택 브리지) 그것을,
  // 없으면(본부·사업소 — provider 없음) 로컬 state 를 사용한다.
  const sel = useSelection();
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selectedId = sel ? sel.selectedAssetId : localSelected;
  const setSelectedId = sel ? sel.setSelectedAssetId : setLocalSelected;

  // 선택된 자산이 속한 변전소(본부·사업소 경로) — 행 데이터(AssetListItem)에서 해석.
  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : undefined;
  const targetSubstationId = isHqPath ? selectedItem?.substationId : undefined;

  // 가드 조건: 다른 변전소가 로드돼 있고 미저장(dirty>0)이면 전환 금지.
  const blocked =
    !!targetSubstationId &&
    !!loadedSubstationId &&
    loadedSubstationId !== targetSubstationId &&
    dirty > 0;
  // 가드 시 안내에 쓸, 현재 로드된(미저장) 변전소 이름 — 페치 행에서 해석(없으면 null).
  const dirtySubstationName = useMemo(
    () => (blocked ? fetchedItems.find((i) => i.substationId === loadedSubstationId)?.substationName ?? null : null),
    [blocked, fetchedItems, loadedSubstationId],
  );

  // 온디맨드 로드: 대상 변전소가 아직 로드 안 됐고 가드에 걸리지 않으면 load.
  // load 는 idempotent(loadSeq 가드) + substationId 가 바뀔 때만 진입 → 루프 없음.
  const load = useSubstationWorkingCopy((s) => s.load);
  useEffect(() => {
    if (isHqPath && targetSubstationId && !blocked && loadedSubstationId !== targetSubstationId) {
      void load(targetSubstationId);
    }
  }, [isHqPath, targetSubstationId, blocked, loadedSubstationId, load]);
  void effectiveAssetsRef; // 구독 유지(effective 갱신 시 리스트/인스펙터 재렌더).

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const statuses = useMemo(() => uniq(items.map((i) => i.status)), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (typeFilter && i.assetTypeName !== typeFilter) return false;
      if (statusFilter && i.status !== statusFilter) return false;
      return true;
    });
  }, [items, search, typeFilter, statusFilter]);

  const total = items.length;
  const summaryItems = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) map.set(i.assetTypeName, (map.get(i.assetTypeName) ?? 0) + 1);
    return Array.from(map.entries()).map(([label, count]) => ({ key: label, label, count }));
  }, [items]);

  const renderRow = (item: AssetListItem) => (
    <AssetRow
      key={item.id}
      item={item}
      today={today}
      selected={selectedId === item.id}
      onSelect={() => setSelectedId(item.id)}
    />
  );

  // 인스펙터에 표시할 자산. 변전소는 resolveAsset(effective lookup)로 즉시 해석되고,
  // 본부·사업소는 selectedId 만 있으면 ReadOnlyDetailPanel 이 useAsset 으로 페치한다.
  const resolvedAsset = selectedId && resolveAsset ? resolveAsset(selectedId) : undefined;

  return (
    <div className="flex h-full bg-surface">
      <div className="flex-1 min-w-0 flex flex-col">
        <StatusSummary
          total={total}
          items={summaryItems}
          active={typeFilter}
          onSelect={(key) => setTypeFilter((cur) => (cur === key ? '' : key))}
        />

        <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-line bg-surface">
          <input
            className="text-sm border border-line rounded px-2 py-1 bg-surface text-content"
            placeholder="이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="text-sm border border-line rounded px-2 py-1 bg-surface text-content"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">상태 전체</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-content-faint px-4 py-3">
              {items.length === 0 ? '자산이 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left bg-surface-2 border-b border-line sticky top-0">
                  {COLUMNS.map((c, i) => (
                    <th key={c} className={`${i === 0 ? 'pl-4 pr-2' : i === COLUMNS.length - 1 ? 'px-2 pr-4' : 'px-2'} py-2 text-xs font-medium uppercase tracking-wide text-content-muted`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{filtered.map(renderRow)}</tbody>
            </table>
          )}
        </div>
      </div>

      {selectedId &&
        (resolveAsset ? (
          resolvedAsset && (
            <AssetDetailPanel
              key={resolvedAsset.id}
              asset={resolvedAsset}
              mode={onPatch ? 'edit' : 'view'}
              onClose={() => setSelectedId(null)}
              onPatch={onPatch}
            />
          )
        ) : (
          targetSubstationId && (
            <StagedEditDetailPanel
              assetId={selectedId}
              targetSubstationId={targetSubstationId}
              loadedSubstationId={loadedSubstationId}
              blockedByDirtyName={blocked ? dirtySubstationName : undefined}
              onClose={() => setSelectedId(null)}
            />
          )
        ))}
    </div>
  );
}

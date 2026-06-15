import { useMemo, useState } from 'react';
import { formatDate } from '../../../utils/date';
import { INSPECTIONS } from '../../workingCopy/recordTypes';
import { useNodeAssets, type NodeKind } from '../../../hooks/useNodeAssets';
import { useSelection } from '../../workspace/SelectionContext';
import { installLocation, inspectionState, projectStatusRows, statusIsOn, type AssetListItem } from '../nodeStatus';
import { assetAlert } from '../alerts';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets, useEffectiveAssetsOverlay, useRecordsByType, useWorkingCopyLoader } from '../../workingCopy/hooks';
import { StatusSummary } from './StatusSummary';
import { AssetDetailPanel } from './AssetDetailPanel';
import { StagedAssetDetailPanel } from './StagedAssetDetailPanel';
import { Badge } from '../../../components/ui';
import type { Asset } from '../../../types/asset';
import { sortRows, useGridSort, type SortType } from '../../../components/grid/useGridSort';
import { SortableHeaderCell } from '../../../components/grid/SortableHeaderCell';
import { rowClass } from '../../../components/grid/rowClasses';

interface ColumnDef {
  label: string;
  type: SortType;
  /** 정렬 비교 키 추출(text=문자열|null, date=ISO 문자열|null, status=ON/OFF). */
  accessor: (i: AssetListItem) => string | null;
}

const COLUMN_DEFS: ColumnDef[] = [
  { label: '종류', type: 'text', accessor: (i) => i.assetTypeName },
  { label: '이름', type: 'text', accessor: (i) => i.name },
  { label: '설치장소', type: 'text', accessor: (i) => installLocation(i) },
  { label: '설치일', type: 'date', accessor: (i) => i.installDate },
  { label: '담당자', type: 'text', accessor: (i) => i.manager },
  { label: '마지막 점검일', type: 'date', accessor: (i) => i.lastMaintenanceDate },
  { label: '상태', type: 'status', accessor: (i) => (statusIsOn(i.status) ? 'ON' : 'OFF') },
];

function uniq(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}


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
  const statusOn = statusIsOn(item.status);
  return (
    <tr
      onClick={onSelect}
      className={rowClass(selected ?? false)}
    >
      <td className="pl-4 pr-2 text-[13px] text-content align-middle whitespace-nowrap">{item.assetTypeName}</td>
      <td className="px-2 text-[13px] align-middle whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-content">{item.name}</span>
          {alert && <Badge status="danger">{alert.label}</Badge>}
        </span>
      </td>
      <td className="px-2 text-[13px] text-content-muted align-middle whitespace-nowrap max-w-[14rem] truncate" title={installLocation(item)}>{installLocation(item)}</td>
      <td className="px-2 text-[13px] text-content-muted align-middle whitespace-nowrap tabular-nums">
        {item.installDate ? formatDate(item.installDate) : '—'}
      </td>
      <td className="px-2 text-[13px] text-content-muted align-middle whitespace-nowrap">{item.manager ?? '—'}</td>
      <td className={`px-2 text-[13px] align-middle whitespace-nowrap ${inspClass}`}>{insp.label}</td>
      <td className="px-2 pr-4 text-[13px] align-middle whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusOn ? 'bg-danger' : 'bg-content-faint'}`} />
          <span className={statusOn ? 'text-content' : 'text-content-muted'}>{statusOn ? 'ON' : 'OFF'}</span>
        </span>
      </td>
    </tr>
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
  const overlay = useEffectiveAssetsOverlay();
  const inspectionRecords = useRecordsByType(INSPECTIONS);
  const effectiveAssetsRef = useEffectiveAssets();

  // 라이브 머지(본부·사업소): 전역 워킹카피라 **어느 변전소 자산이든** 편집이 라이브로 보인다.
  // 변전소 현황(useSubstationStatusRows)과 동일한 단일 투영 projectStatusRows. 신규 자산은 이
  // 노드 범위(serverRows 의 변전소)로 한정(scopeId=null). 포커스 변전소만 보이던 문제 해소.
  const fetchedMerged = useMemo(() => {
    if (!isHqPath) return fetchedItems;
    const inspections = inspectionRecords.map((r) => ({
      assetId: r.assetId,
      inspectionDate: String(r.inspectionDate ?? ''),
    }));
    return projectStatusRows(fetchedItems, overlay, inspections, null);
  }, [isHqPath, fetchedItems, overlay, inspectionRecords]);

  // rows 가 주어지면 그것을 데이터 소스로(필터/요약 모두 items 기준).
  const items = rows ?? fetchedMerged;
  const today = useMemo(() => new Date(), []);

  // 선택: 단일 selectionStore(useSelection 백킹) — 변전소·본부·사업소 어디서나 공유.
  const sel = useSelection();
  const selectedId = sel.selectedAssetId;
  const setSelectedId = sel.setSelectedAssetId;

  // 선택된 자산이 속한 변전소(본부·사업소 경로) — 행 데이터(AssetListItem)에서 해석.
  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : undefined;
  const targetSubstationId = isHqPath ? selectedItem?.substationId : undefined;

  // 전역 워킹카피라 변전소 dirty 가드 없음 — 자산 A는 어디서 열든 자산 A. 온디맨드 로드는
  // 정식 훅(useWorkingCopyLoader)으로 — 손으로 재구현하던 effect 제거(중복 통일).
  useWorkingCopyLoader(isHqPath ? targetSubstationId ?? null : null);
  void effectiveAssetsRef; // 구독 유지(effective 갱신 시 리스트/인스펙터 재렌더).

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 3-state 정렬: 1클릭 asc → 2클릭 desc → 3클릭 취소(null=원본 순서). 한 번에 한 컬럼만.
  const { sort, cycleSort } = useGridSort();

  // items(오버레이 머지 후)에서 정렬 사본을 파생. sort 가 null 이면 원본 순서 그대로.
  const sortedItems = useMemo(() => {
    if (!sort) return items;
    const def = COLUMN_DEFS.find((c) => c.label === sort.col);
    if (!def) return items;
    return sortRows(items, def.accessor, def.type, sort.dir);
  }, [items, sort]);

  const statuses = useMemo(() => uniq(items.map((i) => i.status)), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedItems.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (typeFilter && i.assetTypeName !== typeFilter) return false;
      if (statusFilter && i.status !== statusFilter) return false;
      return true;
    });
  }, [sortedItems, search, typeFilter, statusFilter]);

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

  const lastColIdx = COLUMN_DEFS.length - 1;

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

        <div className="flex-1 overflow-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-content-faint px-4 py-3">
              {items.length === 0 ? '자산이 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left bg-surface-2 border-b border-line-strong sticky top-0">
                  {COLUMN_DEFS.map((c, i) => (
                    <SortableHeaderCell
                      key={c.label}
                      label={c.label}
                      first={i === 0}
                      last={i === lastColIdx}
                      sortable
                      active={sort?.col === c.label}
                      dir={sort?.dir ?? 'asc'}
                      onClick={() => cycleSort(c.label)}
                    />
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
            <StagedAssetDetailPanel
              assetId={selectedId}
              targetSubstationId={targetSubstationId}
              loadedSubstationId={loadedSubstationId}
              onClose={() => setSelectedId(null)}
            />
          )
        ))}
    </div>
  );
}

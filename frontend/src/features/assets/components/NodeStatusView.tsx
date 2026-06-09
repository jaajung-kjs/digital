import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNodeAssets, type NodeKind } from '../../../hooks/useNodeAssets';
import { useSelection } from '../../workspace/SelectionContext';
import { useWorkspaceNav } from '../../workspace/WorkspaceNavContext';
import { installLocation, inspectionState, type AssetListItem } from '../nodeStatus';
import { assetAlert } from '../alerts';
import { StatusSummary } from './SubstationStatusView';

const COLUMNS = ['종류', '이름', '설치장소', '설치일', '담당자', '마지막 점검일', '상태'] as const;

function uniq(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

function AssetRow({
  item,
  today,
  onSelect,
  onGotoFloor,
}: {
  item: AssetListItem;
  today: Date;
  onSelect: () => void;
  onGotoFloor?: () => void;
}) {
  const alert = assetAlert(
    { warrantyUntil: item.warrantyUntil, replaceDue: item.replaceDue } as Parameters<typeof assetAlert>[0],
    today,
  );
  const insp = inspectionState(item.lastMaintenanceDate, today);
  const inspClass =
    insp.level === 'none' ? 'text-gray-400' : insp.level === 'overdue' ? 'text-orange-600 font-medium' : '';
  return (
    <tr onClick={onSelect} className="cursor-pointer hover:bg-blue-50 border-b border-gray-100">
      <td className="px-2 py-1 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: item.assetTypeColor ?? '#9ca3af' }}
          />
          {item.assetTypeName}
        </span>
      </td>
      <td className="px-2 py-1 text-sm">
        <span className="inline-flex items-center gap-1.5">
          {item.name}
          {alert && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                alert.kind === 'warranty' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {alert.label}
            </span>
          )}
        </span>
      </td>
      <td className="px-2 py-1 text-sm text-gray-600">{installLocation(item)}</td>
      <td className="px-2 py-1 text-sm text-gray-600">
        {item.installDate ? new Date(item.installDate).toLocaleDateString('ko-KR') : '—'}
      </td>
      <td className="px-2 py-1 text-sm text-gray-600">{item.manager ?? '—'}</td>
      <td className={`px-2 py-1 text-sm ${inspClass}`}>{insp.label}</td>
      <td className="px-2 py-1 text-sm text-gray-600">{item.status ?? '—'}</td>
      <td className="px-2 py-1 text-right">
        {item.floorId && (
          <button
            title="도면에서 보기"
            onClick={(e) => {
              e.stopPropagation();
              onGotoFloor?.();
            }}
            className="text-xs px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100"
          >
            도면
          </button>
        )}
      </td>
    </tr>
  );
}

export function NodeStatusView({
  nodeType,
  nodeId,
  rows,
  onRowClick,
}: {
  nodeType: NodeKind;
  nodeId: string;
  /** 행 데이터 직접 주입(예: 현황 — 통합 store overlay 머지). 없으면 useNodeAssets 사용. */
  rows?: AssetListItem[];
  /** 행 클릭 동작 재정의(예: 홈에서 변전소 워크스페이스로 드릴). 없으면 공유 선택을 설정. */
  onRowClick?: (item: AssetListItem) => void;
}) {
  const { data: fetchedItems = [] } = useNodeAssets(nodeType, nodeId);
  // rows 가 주어지면 그것을 데이터 소스로(필터/그룹/요약 모두 items 기준).
  const items = rows ?? fetchedItems;
  const today = useMemo(() => new Date(), []);
  const sel = useSelection();
  const ws = useWorkspaceNav();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [substationFilter, setSubstationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const isSubstation = nodeType === 'substation';

  const types = useMemo(() => uniq(items.map((i) => i.assetTypeName)), [items]);
  const substations = useMemo(() => uniq(items.map((i) => i.substationName)), [items]);
  const statuses = useMemo(() => uniq(items.map((i) => i.status)), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (typeFilter && i.assetTypeName !== typeFilter) return false;
      if (substationFilter && i.substationName !== substationFilter) return false;
      if (statusFilter && i.status !== statusFilter) return false;
      return true;
    });
  }, [items, search, typeFilter, substationFilter, statusFilter]);

  const total = items.length;
  const summaryItems = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) map.set(i.assetTypeName, (map.get(i.assetTypeName) ?? 0) + 1);
    return Array.from(map.entries()).map(([label, count]) => ({ key: label, label, count }));
  }, [items]);

  const gotoFloor = (item: AssetListItem) => {
    if (!item.floorId) return;
    if (ws) ws.gotoFloor(item.floorId);
    else navigate(`/substations/${item.substationId}/workspace?view=plan&floor=${item.floorId}`);
  };

  const renderRow = (item: AssetListItem) => (
    <AssetRow
      key={item.id}
      item={item}
      today={today}
      onSelect={() => (onRowClick ? onRowClick(item) : sel?.setSelectedAssetId(item.id))}
      onGotoFloor={item.floorId ? () => gotoFloor(item) : undefined}
    />
  );

  // Group rows by substation when not a substation node.
  const grouped = useMemo(() => {
    if (isSubstation) return null;
    const map = new Map<string, AssetListItem[]>();
    for (const i of filtered) {
      const list = map.get(i.substationName) ?? [];
      list.push(i);
      map.set(i.substationName, list);
    }
    return Array.from(map.entries());
  }, [filtered, isSubstation]);

  return (
    <div className="h-full flex flex-col">
      <StatusSummary total={total} items={summaryItems} />

      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <input
          className="text-sm border border-gray-200 rounded px-2 py-1"
          placeholder="이름 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">종류 전체</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {!isSubstation && (
          <select
            className="text-sm border border-gray-200 rounded px-2 py-1"
            value={substationFilter}
            onChange={(e) => setSubstationFilter(e.target.value)}
          >
            <option value="">변전소 전체</option>
            {substations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1"
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
          <p className="text-sm text-gray-400 px-4 py-3">
            {items.length === 0 ? '자산이 없습니다.' : '검색 결과가 없습니다.'}
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200 text-left bg-white sticky top-0">
                {COLUMNS.map((c) => (
                  <th key={c} className="px-2 py-1 text-xs font-semibold text-gray-500">
                    {c}
                  </th>
                ))}
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {isSubstation
                ? filtered.map(renderRow)
                : grouped!.map(([substationName, rows]) => (
                    <Fragment key={`g-${substationName}`}>
                      <tr>
                        <td colSpan={8} className="bg-gray-50 font-semibold px-3 py-1 text-xs">
                          {substationName} ({rows.length})
                        </td>
                      </tr>
                      {rows.map(renderRow)}
                    </Fragment>
                  ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

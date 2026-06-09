import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { useNodeAssets, type NodeKind } from '../../../hooks/useNodeAssets';
import { useSelection } from '../../workspace/SelectionContext';
import { useWorkspaceNav } from '../../workspace/WorkspaceNavContext';
import { installLocation, inspectionState, type AssetListItem } from '../nodeStatus';
import { assetAlert } from '../alerts';
import { StatusSummary } from './SubstationStatusView';
import { Badge, IconButton, type BadgeStatus } from '../../../components/ui';

const COLUMNS = ['종류', '이름', '설치장소', '설치일', '담당자', '마지막 점검일', '상태'] as const;

function uniq(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

/** 자유 텍스트 상태값 → Badge 상태(정상=success, 점검요/임박=warning, 이상/교체=danger, 기타=neutral). */
function statusBadge(status: string): BadgeStatus {
  if (/정상|양호|운영/.test(status)) return 'success';
  if (/이상|고장|교체|불량/.test(status)) return 'danger';
  if (/점검|임박|주의|예정/.test(status)) return 'warning';
  return 'neutral';
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
  const alert = assetAlert({ installDate: item.installDate }, today);
  const insp = inspectionState(item.lastMaintenanceDate, today);
  const inspClass =
    insp.level === 'none' ? 'text-content-faint' : insp.level === 'overdue' ? 'text-warning font-medium' : 'text-content';
  return (
    <tr onClick={onSelect} className="cursor-pointer hover:bg-surface-2 border-b border-line">
      <td className="px-2 py-2 text-sm text-content">
        <span className="inline-flex items-center gap-1.5">
          {/* ISA-101: 종류 점은 무채색(설비=중립). 색은 상태에만. */}
          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 bg-eq-3" />
          {item.assetTypeName}
        </span>
      </td>
      <td className="px-2 py-2 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-content">{item.name}</span>
          {alert && <Badge status="danger">{alert.label}</Badge>}
        </span>
      </td>
      <td className="px-2 py-2 text-sm text-content-muted">{installLocation(item)}</td>
      <td className="px-2 py-2 text-sm text-content-muted">
        {item.installDate ? new Date(item.installDate).toLocaleDateString('ko-KR') : '—'}
      </td>
      <td className="px-2 py-2 text-sm text-content-muted">{item.manager ?? '—'}</td>
      <td className={`px-2 py-2 text-sm ${inspClass}`}>{insp.label}</td>
      <td className="px-2 py-2 text-sm">
        {item.status ? (
          <Badge status={statusBadge(item.status)}>{item.status}</Badge>
        ) : (
          <span className="text-content-muted">—</span>
        )}
      </td>
      <td className="px-2 py-2 text-right">
        {item.floorId && (
          <IconButton
            aria-label="도면에서 보기"
            title="도면에서 보기"
            className="p-1.5 text-content-faint hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onGotoFloor?.();
            }}
          >
            <MapIcon size={15} />
          </IconButton>
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
  // rows 가 주입되면(현황 — 통합 store 머지) useNodeAssets 구독은 불필요 → 비활성화.
  const skip = rows !== undefined;
  const { data: fetchedItems = [] } = useNodeAssets(skip ? null : nodeType, skip ? null : nodeId);
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

      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-line bg-surface">
        <input
          className="text-sm border border-line rounded px-2 py-1 bg-surface text-content"
          placeholder="이름 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="text-sm border border-line rounded px-2 py-1 bg-surface text-content"
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
            className="text-sm border border-line rounded px-2 py-1 bg-surface text-content"
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
                {COLUMNS.map((c) => (
                  <th key={c} className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-content-muted">
                    {c}
                  </th>
                ))}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {isSubstation
                ? filtered.map(renderRow)
                : grouped!.map(([substationName, rows]) => (
                    <Fragment key={`g-${substationName}`}>
                      <tr>
                        <td colSpan={8} className="bg-surface-2 font-medium text-content-muted px-3 py-1.5 text-xs">
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

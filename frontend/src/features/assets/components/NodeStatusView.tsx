import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { useNodeAssets, type NodeKind } from '../../../hooks/useNodeAssets';
import { useSelection } from '../../workspace/SelectionContext';
import { useWorkspaceNav } from '../../workspace/WorkspaceNavContext';
import { installLocation, inspectionState, type AssetListItem } from '../nodeStatus';
import { assetAlert } from '../alerts';
import { useAsset } from '../hooks/useAsset';
import { StatusSummary } from './StatusSummary';
import { AssetDetailPanel } from './AssetDetailPanel';
import { Badge, IconButton, type BadgeStatus } from '../../../components/ui';
import type { Asset, UpdateAssetInput } from '../../../types/asset';

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
  selected,
  onSelect,
  onGotoFloor,
}: {
  item: AssetListItem;
  today: Date;
  selected?: boolean;
  onSelect: () => void;
  onGotoFloor?: () => void;
}) {
  const alert = assetAlert({ installDate: item.installDate }, today);
  const insp = inspectionState(item.lastMaintenanceDate, today);
  const inspClass =
    insp.level === 'none' ? 'text-content-faint' : insp.level === 'overdue' ? 'text-warning font-medium' : 'text-content';
  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer border-b border-line transition-colors ${
        selected ? 'bg-info-bg shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-surface-2'
      }`}
    >
      <td className="pl-4 pr-2 py-2 text-sm text-content">
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
      <td className="pl-2 pr-4 py-2 text-right">
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

/**
 * 선택된 자산의 read-only 인스펙터(본부·사업소 — 편집은 변전소 워크스페이스에서).
 * 자산 상세를 useAsset 으로 직접 페치한다(목록 행에는 인스펙터에 필요한 풀 Asset 이 없음).
 */
function ReadOnlyDetailPanel({
  assetId,
  onClose,
  onGotoRegister,
}: {
  assetId: string;
  onClose: () => void;
  onGotoRegister: (id: string) => void;
}) {
  const { data: asset } = useAsset(assetId);
  if (!asset) {
    return (
      <aside className="w-96 shrink-0 border-l border-line bg-surface h-full overflow-y-auto p-4 text-sm text-content-muted">
        불러오는 중…
      </aside>
    );
  }
  return (
    <AssetDetailPanel
      key={asset.id}
      asset={asset}
      mode="view"
      onClose={onClose}
      onGotoRegister={onGotoRegister}
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
  onPatch?: (id: string, patch: Partial<UpdateAssetInput>) => void;
}) {
  // rows 가 주입되면(현황 — 통합 store 머지) useNodeAssets 구독은 불필요 → 비활성화.
  const skip = rows !== undefined;
  const { data: fetchedItems = [] } = useNodeAssets(skip ? null : nodeType, skip ? null : nodeId);
  // rows 가 주어지면 그것을 데이터 소스로(필터/요약 모두 items 기준).
  const items = rows ?? fetchedItems;
  const today = useMemo(() => new Date(), []);
  const ws = useWorkspaceNav();
  const navigate = useNavigate();

  // 선택: 공유 SelectionContext 가 있으면(변전소 워크스페이스 — 에디터 선택 브리지) 그것을,
  // 없으면(본부·사업소 — provider 없음) 로컬 state 를 사용한다.
  const sel = useSelection();
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selectedId = sel ? sel.selectedAssetId : localSelected;
  const setSelectedId = sel ? sel.setSelectedAssetId : setLocalSelected;

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
      selected={selectedId === item.id}
      onSelect={() => setSelectedId(item.id)}
      onGotoFloor={item.floorId ? () => gotoFloor(item) : undefined}
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
                    <th key={c} className={`${i === 0 ? 'pl-4 pr-2' : 'px-2'} py-2 text-xs font-medium uppercase tracking-wide text-content-muted`}>
                      {c}
                    </th>
                  ))}
                  <th className="pl-2 pr-4 py-2" />
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
          <ReadOnlyDetailPanel
            assetId={selectedId}
            onClose={() => setSelectedId(null)}
            onGotoRegister={(id) =>
              navigate(`/substations/${
                items.find((i) => i.id === id)?.substationId ?? nodeId
              }/workspace?view=status&assetId=${id}`)
            }
          />
        ))}
    </div>
  );
}

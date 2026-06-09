import { useNodeStats } from '../../../hooks/useNodeStats';
import { SubstationAssetGrid } from './SubstationAssetGrid';

export function StatusSummary({ total, items }: { total: number; items: { key: string; label: string; count: number }[] }) {
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
      <span className="text-xs px-2 py-1 rounded bg-gray-100 font-medium">전체 {total}</span>
      {items.map((c) => (
        <span key={c.key} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">{c.label} {c.count}</span>
      ))}
    </div>
  );
}

export function SubstationStatusView({ substationId }: { substationId: string }) {
  const { data: stats } = useNodeStats('substation', substationId);
  const items = (stats?.self.byCategory ?? []).map((c) => ({
    key: c.categoryId,
    label: c.name,
    count: c.count,
  }));
  return (
    <div className="h-full flex flex-col">
      <StatusSummary total={stats?.self.total ?? 0} items={items} />
      <div className="flex-1 min-h-0">
        <SubstationAssetGrid substationId={substationId} />
      </div>
    </div>
  );
}

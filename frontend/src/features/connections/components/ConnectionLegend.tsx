import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { useCableGroups } from '../../cables/hooks/useCableGroups';
import type { CableGroup } from '../../../types/cableGroup';

type GroupState = 'on' | 'off' | 'partial';

export function ConnectionLegend() {
  const connectionFilters = useEditorStore((s) => s.connectionFilters);
  const setConnectionFilters = useEditorStore((s) => s.setConnectionFilters);
  const { data: cableCategories } = useCableCategories();
  const { data: cableGroups } = useCableGroups();
  const initialized = useRef(false);
  const [collapsed, setCollapsed] = useState(false);

  const groups = (cableGroups ?? []).filter((g) => g.isActive);

  // Map: groupId -> [categoryId, ...]
  const groupedIds = useMemo(() => {
    const map = new Map<string, string[]>();
    groups.forEach((g) => map.set(g.id, []));
    for (const cat of cableCategories ?? []) {
      if (cat.groupId && map.has(cat.groupId)) map.get(cat.groupId)!.push(cat.id);
    }
    return map;
  }, [groups, cableCategories]);

  const allIds = useMemo(() => {
    const out: string[] = [];
    for (const ids of groupedIds.values()) out.push(...ids);
    return out;
  }, [groupedIds]);

  // Initialize filters once when categories load (null → "show all")
  useEffect(() => {
    if (allIds.length === 0) return;
    if (initialized.current) return;
    initialized.current = true;
    if (connectionFilters === null) {
      setConnectionFilters(allIds);
    }
  }, [allIds, connectionFilters, setConnectionFilters]);

  const activeFilters = connectionFilters ?? allIds;

  const groupState = (g: CableGroup): GroupState => {
    const ids = groupedIds.get(g.id) ?? [];
    if (ids.length === 0) return 'off';
    const activeCount = ids.filter((c) => activeFilters.includes(c)).length;
    if (activeCount === 0) return 'off';
    if (activeCount === ids.length) return 'on';
    return 'partial';
  };

  const toggleGroup = (g: CableGroup) => {
    const ids = groupedIds.get(g.id) ?? [];
    if (ids.length === 0) return;
    const state = groupState(g);
    if (state === 'on') {
      setConnectionFilters(activeFilters.filter((c) => !ids.includes(c)));
    } else {
      // off | partial → enable all in group
      const next = new Set(activeFilters);
      ids.forEach((c) => next.add(c));
      setConnectionFilters([...next]);
    }
  };

  const allSelected =
    allIds.length > 0 && allIds.every((c) => activeFilters.includes(c));
  const noneSelected = activeFilters.length === 0;
  const allIndeterminate = !allSelected && !noneSelected;

  const toggleAll = () => {
    if (allSelected) {
      setConnectionFilters([]);
    } else {
      setConnectionFilters(allIds);
    }
  };

  // Collapsed → small chip (click to expand). Expanded → header + group toggles.
  if (collapsed) {
    const activeGroups = groups.filter((g) => groupState(g) !== 'off').length;
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="케이블 필터 펼치기"
        className="absolute left-3 bottom-10 z-legend flex items-center gap-1.5 bg-surface/85 backdrop-blur-sm border border-line rounded-lg px-2.5 py-1.5 shadow-sm text-xs text-content-muted hover:bg-surface-2 hover:text-content transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Filter size={13} />
        <span className="font-medium">케이블 필터</span>
        <span className="text-xs text-content-faint">
          {activeGroups}/{groups.length}
        </span>
      </button>
    );
  }

  return (
    <div
      className="absolute left-3 bottom-10 z-legend bg-surface/85 backdrop-blur-sm border border-line rounded-lg px-2.5 py-2 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="접기"
          className="flex items-center gap-1 text-xs font-medium text-content-muted hover:text-content transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        >
          <ChevronDown size={13} />
          <span>케이블 필터</span>
        </button>
        <label className="flex items-center gap-1 cursor-pointer ml-auto">
          <input
            type="checkbox"
            ref={(el) => {
              if (el) el.indeterminate = allIndeterminate;
            }}
            checked={allSelected}
            onChange={toggleAll}
            className="w-3 h-3 rounded border-line text-primary focus:ring-primary/40"
          />
          <span className="text-xs text-content-muted">전체</span>
        </label>
      </div>
      <div className="flex items-center gap-1">
        {groups.map((g) => {
          const state = groupState(g);
          const ids = groupedIds.get(g.id) ?? [];
          const total = ids.length;
          const activeCount = ids.filter((c) =>
            activeFilters.includes(c),
          ).length;
          const color = g.color ?? '#6b7280';
          const disabled = total === 0;

          let style: React.CSSProperties = {};
          let className = '';
          if (state === 'on') {
            style = {
              backgroundColor: color,
              borderColor: color,
              color: '#ffffff',
            };
            className = 'border';
          } else if (state === 'partial') {
            style = {
              backgroundColor: `${color}22`,
              borderColor: color,
              color: color,
            };
            className = 'border border-dashed';
          } else {
            className = 'border border-line bg-surface text-content-muted';
          }

          const title =
            total === 0
              ? `${g.name} (사용 가능한 카테고리 없음)`
              : state === 'partial'
                ? `${g.name} ${activeCount}/${total} 활성 — 클릭하면 전체 켜짐`
                : state === 'on'
                  ? `${g.name} 전체 활성 — 클릭하면 끔`
                  : `${g.name} 전체 비활성 — 클릭하면 켬`;

          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggleGroup(g)}
              disabled={disabled}
              title={title}
              className={`${className} rounded-full px-2 py-0.5 text-xs leading-none font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
              style={style}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{
                  backgroundColor: state === 'on' ? '#ffffff' : color,
                  opacity: state === 'off' ? 0.5 : 1,
                }}
              />
              <span>{g.name}</span>
              {state === 'partial' && (
                <span className="opacity-70">
                  {activeCount}/{total}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import type { CableDisplayGroup } from '../../../types/cableCategory';

const CABLE_DISPLAY_GROUPS: CableDisplayGroup[] = [
  '전원',
  '접지',
  '네트워크',
  '광',
  '제어',
];

// Group representative colors derived from seed displayColor values
// (전원→CBL-FCV/FR/VCT/HIV #ef4444, 접지→CBL-IV/BARE #eab308,
//  네트워크→CBL-UTP #3b82f6, 광→CBL-OPT/OPJ/OPT-B #22c55e,
//  제어→CBL-COAX/SIG #6b7280)
const GROUP_COLORS: Record<CableDisplayGroup, string> = {
  '전원': '#ef4444',
  '접지': '#eab308',
  '네트워크': '#3b82f6',
  '광': '#22c55e',
  '제어': '#6b7280',
};

type GroupState = 'on' | 'off' | 'partial';

export function ConnectionLegend() {
  const connectionFilters = useEditorStore((s) => s.connectionFilters);
  const setConnectionFilters = useEditorStore((s) => s.setConnectionFilters);
  const { data: cableCategories } = useCableCategories();
  const initialized = useRef(false);
  const [collapsed, setCollapsed] = useState(false);

  // Map: displayGroup -> [category code, ...] (only categories with displayGroup)
  const groupedCodes = useMemo(() => {
    const map = new Map<CableDisplayGroup, string[]>();
    CABLE_DISPLAY_GROUPS.forEach((g) => map.set(g, []));
    for (const cat of cableCategories ?? []) {
      if (cat.displayGroup && map.has(cat.displayGroup)) {
        map.get(cat.displayGroup)!.push(cat.code);
      }
    }
    return map;
  }, [cableCategories]);

  // Flat list of all category codes (only those with a displayGroup)
  const allCodes = useMemo(() => {
    const out: string[] = [];
    for (const codes of groupedCodes.values()) out.push(...codes);
    return out;
  }, [groupedCodes]);

  // Initialize filters once when categories load (null → "show all")
  useEffect(() => {
    if (allCodes.length === 0) return;
    if (initialized.current) return;
    initialized.current = true;
    if (connectionFilters === null) {
      setConnectionFilters(allCodes);
    }
  }, [allCodes, connectionFilters, setConnectionFilters]);

  const activeFilters = connectionFilters ?? allCodes;

  const groupState = (group: CableDisplayGroup): GroupState => {
    const codes = groupedCodes.get(group) ?? [];
    if (codes.length === 0) return 'off';
    const activeCount = codes.filter((c) => activeFilters.includes(c)).length;
    if (activeCount === 0) return 'off';
    if (activeCount === codes.length) return 'on';
    return 'partial';
  };

  const toggleGroup = (group: CableDisplayGroup) => {
    const codes = groupedCodes.get(group) ?? [];
    if (codes.length === 0) return;
    const state = groupState(group);
    if (state === 'on') {
      setConnectionFilters(activeFilters.filter((c) => !codes.includes(c)));
    } else {
      // off | partial → enable all in group
      const next = new Set(activeFilters);
      codes.forEach((c) => next.add(c));
      setConnectionFilters([...next]);
    }
  };

  const allSelected =
    allCodes.length > 0 && allCodes.every((c) => activeFilters.includes(c));
  const noneSelected = activeFilters.length === 0;
  const allIndeterminate = !allSelected && !noneSelected;

  const toggleAll = () => {
    if (allSelected) {
      setConnectionFilters([]);
    } else {
      setConnectionFilters(allCodes);
    }
  };

  // Collapsed → small chip (click to expand). Expanded → header + group toggles.
  if (collapsed) {
    const activeGroups = CABLE_DISPLAY_GROUPS.filter((g) => groupState(g) !== 'off').length;
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="케이블 필터 펼치기"
        className="absolute left-3 bottom-10 z-[15] flex items-center gap-1.5 bg-surface/85 backdrop-blur-sm border border-line rounded-lg px-2.5 py-1.5 shadow-sm text-xs text-content-muted hover:bg-surface-2 hover:text-content transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Filter size={13} />
        <span className="font-medium">케이블 필터</span>
        <span className="text-[10px] text-content-faint">
          {activeGroups}/{CABLE_DISPLAY_GROUPS.length}
        </span>
      </button>
    );
  }

  return (
    <div
      className="absolute left-3 bottom-10 z-[15] bg-surface/85 backdrop-blur-sm border border-line rounded-lg px-2.5 py-2 shadow-sm"
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
          <span className="text-[11px] text-content-muted">전체</span>
        </label>
      </div>
      <div className="flex items-center gap-1">
        {CABLE_DISPLAY_GROUPS.map((group) => {
          const state = groupState(group);
          const codes = groupedCodes.get(group) ?? [];
          const total = codes.length;
          const activeCount = codes.filter((c) =>
            activeFilters.includes(c),
          ).length;
          const color = GROUP_COLORS[group];
          const disabled = total === 0;

          // Visual style per state:
          //   on      → filled with group color
          //   partial → dashed border, light fill
          //   off     → gray outline
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
              ? `${group} (사용 가능한 카테고리 없음)`
              : state === 'partial'
                ? `${group} ${activeCount}/${total} 활성 — 클릭하면 전체 켜짐`
                : state === 'on'
                  ? `${group} 전체 활성 — 클릭하면 끔`
                  : `${group} 전체 비활성 — 클릭하면 켬`;

          return (
            <button
              key={group}
              type="button"
              onClick={() => toggleGroup(group)}
              disabled={disabled}
              title={title}
              className={`${className} rounded-full px-2 py-0.5 text-[11px] leading-none font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
              style={style}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{
                  backgroundColor: state === 'on' ? '#ffffff' : color,
                  opacity: state === 'off' ? 0.5 : 1,
                }}
              />
              <span>{group}</span>
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

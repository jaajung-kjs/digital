import { useEffect } from 'react';
import type { CableType } from '../../../types/connection';
import { CABLE_COLORS } from '../../editor/renderers/connectionRenderer';
import { useEditorStore } from '../../editor/stores/editorStore';

interface LegendItem {
  type: CableType;
  label: string;
  color: string;
}

const ALL_LEGEND_ITEMS: LegendItem[] = [
  { type: 'LAN', label: 'LAN', color: CABLE_COLORS.LAN },
  { type: 'FIBER', label: 'FIBER', color: CABLE_COLORS.FIBER },
  { type: 'AC', label: 'AC 전원', color: CABLE_COLORS.AC },
  { type: 'DC', label: 'DC 전원', color: CABLE_COLORS.DC },
  { type: 'GROUND', label: '접지', color: CABLE_COLORS.GROUND },
];

export function ConnectionLegend() {
  const connectionFilters = useEditorStore((s) => s.connectionFilters);
  const setConnectionFilters = useEditorStore((s) => s.setConnectionFilters);

  // Initialize filters to show all only if empty (avoid resetting on re-mount)
  useEffect(() => {
    if (connectionFilters.length === 0) {
      setConnectionFilters(ALL_LEGEND_ITEMS.map((i) => i.type));
    }
  }, [connectionFilters.length, setConnectionFilters]);

  const toggleFilter = (type: CableType) => {
    if (connectionFilters.includes(type)) {
      if (connectionFilters.length <= 1) return;
      setConnectionFilters(connectionFilters.filter((t) => t !== type));
    } else {
      setConnectionFilters([...connectionFilters, type]);
    }
  };

  const allSelected = ALL_LEGEND_ITEMS.every((i) => connectionFilters.includes(i.type));
  const toggleAll = () => {
    if (allSelected) {
      setConnectionFilters([ALL_LEGEND_ITEMS[0].type]);
    } else {
      setConnectionFilters(ALL_LEGEND_ITEMS.map((i) => i.type));
    }
  };

  return (
    <div className="absolute top-14 right-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-sm" style={{ zIndex: 15 }}>
      <div className="text-xs font-medium text-gray-500 mb-1.5">케이블 필터</div>
      <label className="flex items-center gap-2 cursor-pointer mb-1 pb-1 border-b border-gray-100">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-600 font-medium">전체</span>
      </label>
      <div className="flex flex-col gap-1">
        {ALL_LEGEND_ITEMS.map((item) => (
          <label key={item.type} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={connectionFilters.includes(item.type)}
              onChange={() => toggleFilter(item.type)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div
              className="w-5 h-0.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-700">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

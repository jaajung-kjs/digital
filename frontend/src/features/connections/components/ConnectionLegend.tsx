import { useEffect } from 'react';
import type { ViewMode } from '../../../types/floorPlan';
import type { CableType } from '../../../types/connection';
import { CABLE_COLORS } from '../../editor/renderers/connectionRenderer';
import { useEditorStore } from '../../editor/stores/editorStore';

interface LegendItem {
  type: CableType;
  label: string;
  color: string;
}

const LEGEND_BY_MODE: Partial<Record<ViewMode, LegendItem[]>> = {
  'connection-network': [
    { type: 'LAN', label: 'LAN', color: CABLE_COLORS.LAN },
    { type: 'FIBER', label: 'FIBER', color: CABLE_COLORS.FIBER },
  ],
  'connection-power': [
    { type: 'AC', label: 'AC 전원', color: CABLE_COLORS.AC },
    { type: 'DC', label: 'DC 전원', color: CABLE_COLORS.DC },
  ],
  'connection-ground': [
    { type: 'GROUND', label: '접지', color: CABLE_COLORS.GROUND },
  ],
};

interface ConnectionLegendProps {
  viewMode: ViewMode;
}

export function ConnectionLegend({ viewMode }: ConnectionLegendProps) {
  const items = LEGEND_BY_MODE[viewMode];
  const connectionFilters = useEditorStore((s) => s.connectionFilters);
  const setConnectionFilters = useEditorStore((s) => s.setConnectionFilters);

  // Initialize filters when entering a view mode (show all by default)
  useEffect(() => {
    if (items) {
      setConnectionFilters(items.map((i) => i.type));
    }
  }, [viewMode, items, setConnectionFilters]);

  if (!items) return null;

  const toggleFilter = (type: CableType) => {
    if (connectionFilters.includes(type)) {
      if (connectionFilters.length <= 1) return;
      setConnectionFilters(connectionFilters.filter((t) => t !== type));
    } else {
      setConnectionFilters([...connectionFilters, type]);
    }
  };

  const allSelected = items.every((i) => connectionFilters.includes(i.type));
  const toggleAll = () => {
    if (allSelected) {
      setConnectionFilters([items[0].type]);
    } else {
      setConnectionFilters(items.map((i) => i.type));
    }
  };

  return (
    <div className="absolute top-14 right-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-sm" style={{ zIndex: 15 }}>
      <div className="text-xs font-medium text-gray-500 mb-1.5">케이블 필터</div>
      {items.length > 1 && (
        <label className="flex items-center gap-2 cursor-pointer mb-1 pb-1 border-b border-gray-100">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600 font-medium">전체</span>
        </label>
      )}
      <div className="flex flex-col gap-1">
        {items.map((item) => (
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

import { useEffect, useRef } from 'react';
import { CABLE_TYPES, type CableType } from '../../../types/connection';
import { useEditorStore } from '../../editor/stores/editorStore';

export function ConnectionLegend() {
  const connectionFilters = useEditorStore((s) => s.connectionFilters);
  const setConnectionFilters = useEditorStore((s) => s.setConnectionFilters);
  const initialized = useRef(false);

  // Initialize filters to show all on first mount only
  useEffect(() => {
    if (!initialized.current && connectionFilters.length === 0) {
      setConnectionFilters(CABLE_TYPES.map((t) => t.value));
    }
    initialized.current = true;
  }, [connectionFilters.length, setConnectionFilters]);

  const toggleFilter = (type: CableType) => {
    if (connectionFilters.includes(type)) {
      setConnectionFilters(connectionFilters.filter((t) => t !== type));
    } else {
      setConnectionFilters([...connectionFilters, type]);
    }
  };

  const allSelected = CABLE_TYPES.every((t) => connectionFilters.includes(t.value));
  const toggleAll = () => {
    if (allSelected) {
      setConnectionFilters([]);
    } else {
      setConnectionFilters(CABLE_TYPES.map((t) => t.value));
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
        {CABLE_TYPES.map((item) => (
          <label key={item.value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={connectionFilters.includes(item.value)}
              onChange={() => toggleFilter(item.value)}
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

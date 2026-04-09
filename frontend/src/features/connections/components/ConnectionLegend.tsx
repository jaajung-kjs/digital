import { useEffect, useMemo, useRef } from 'react';
import { CABLE_TYPES } from '../../../types/connection';
import { buildCableTypesFromCategories } from '../../../types/connection';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useCableCategories } from '../../../hooks/useMaterialCategories';

export function ConnectionLegend() {
  const connectionFilters = useEditorStore((s) => s.connectionFilters);
  const setConnectionFilters = useEditorStore((s) => s.setConnectionFilters);
  const initialized = useRef(false);
  const { data: cableCategoryData } = useCableCategories();

  const legendItems = useMemo(() => {
    if (cableCategoryData) {
      return buildCableTypesFromCategories(cableCategoryData).map(c => ({
        key: c.value,
        color: c.color,
        label: c.label,
      }));
    }
    return CABLE_TYPES.map(t => ({ key: t.value, color: t.color, label: t.label }));
  }, [cableCategoryData]);

  // Initialize filters to show all on first mount only
  useEffect(() => {
    if (!initialized.current && connectionFilters.length === 0) {
      setConnectionFilters(legendItems.map((t) => t.key));
    }
    initialized.current = true;
  }, [connectionFilters.length, setConnectionFilters, legendItems]);

  const toggleFilter = (key: string) => {
    if (connectionFilters.includes(key)) {
      setConnectionFilters(connectionFilters.filter((t) => t !== key));
    } else {
      setConnectionFilters([...connectionFilters, key]);
    }
  };

  const allSelected = legendItems.every((t) => connectionFilters.includes(t.key));
  const toggleAll = () => {
    if (allSelected) {
      setConnectionFilters([]);
    } else {
      setConnectionFilters(legendItems.map((t) => t.key));
    }
  };

  return (
    <div className="absolute top-14 right-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-sm" style={{ zIndex: 15 }}>
      <div className="text-xs font-medium text-gray-500 mb-1.5">케이블 필터</div>
      <label className="flex items-center gap-2 cursor-pointer mb-1 pb-1 border-b border-gray-100">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <span className="text-xs text-gray-600 font-medium">전체</span>
      </label>
      <div className="flex flex-col gap-1">
        {legendItems.map((item) => (
          <label key={item.key} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={connectionFilters.includes(item.key)} onChange={() => toggleFilter(item.key)} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-gray-700">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

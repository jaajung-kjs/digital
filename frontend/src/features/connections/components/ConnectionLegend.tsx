import { useEffect, useRef, useMemo } from 'react';
import { CABLE_TYPES } from '../../../types/connection';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useMaterialCategories } from '../../materials/hooks/useMaterialCategories';

interface FilterItem {
  key: string;
  label: string;
  color: string;
}

export function ConnectionLegend() {
  const connectionFilters = useEditorStore((s) => s.connectionFilters);
  const setConnectionFilters = useEditorStore((s) => s.setConnectionFilters);
  const { data: cableCategories } = useMaterialCategories('CABLE');
  const initialized = useRef(false);

  // Build filter items from DB categories with hardcoded fallback
  const filterItems: FilterItem[] = useMemo(() => {
    if (cableCategories && cableCategories.length > 0) {
      return cableCategories.map((cat) => ({
        key: cat.code,
        label: cat.name,
        color: cat.displayColor || '#6b7280',
      }));
    }
    // Fallback to hardcoded CABLE_TYPES
    return CABLE_TYPES.map((t) => ({
      key: t.value,
      label: t.label,
      color: t.color,
    }));
  }, [cableCategories]);

  // Initialize filters to show all — only once, after filterItems are available.
  // connectionFilters === null means "not yet initialized".
  // Filter keys are DB category codes ONLY (CBL-UTP, CBL-FCV, etc.)
  useEffect(() => {
    if (filterItems.length === 0) return;
    if (initialized.current) return;
    initialized.current = true;
    if (connectionFilters === null) {
      setConnectionFilters(filterItems.map((item) => item.key));
    }
  }, [connectionFilters, setConnectionFilters, filterItems]);

  const allKeys = useMemo(() => filterItems.map((item) => item.key), [filterItems]);
  const activeFilters = connectionFilters ?? allKeys;

  const toggleFilter = (key: string) => {
    if (activeFilters.includes(key)) {
      setConnectionFilters(activeFilters.filter((t) => t !== key));
    } else {
      setConnectionFilters([...activeFilters, key]);
    }
  };

  const allSelected = filterItems.every((item) => activeFilters.includes(item.key));
  const toggleAll = () => {
    if (allSelected) {
      setConnectionFilters([]);
    } else {
      setConnectionFilters(allKeys);
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
        {filterItems.map((item) => (
          <label key={item.key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activeFilters.includes(item.key)}
              onChange={() => toggleFilter(item.key)}
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

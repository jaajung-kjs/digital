import { useState, useMemo } from 'react';
import { useRoomEquipment } from '../hooks/useEquipment';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  EQUIPMENT_CATEGORIES,
} from '../types/equipment';
import type { EquipmentItem } from '../../../types/floorPlan';

interface EquipmentPanelProps {
  roomId: string;
  onSelect: (equipment: EquipmentItem) => void;
  onAdd?: () => void;
}

export function EquipmentPanel({
  roomId,
  onSelect,
  onAdd,
}: EquipmentPanelProps) {
  const { data: equipment, isLoading, error } = useRoomEquipment(roomId);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const filtered = useMemo(() => {
    if (!equipment) return [];
    return equipment.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.model?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        !categoryFilter || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [equipment, search, categoryFilter]);

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        장비 목록을 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        장비 목록을 불러올 수 없습니다.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">장비 목록</h3>
          {onAdd && (
            <button
              onClick={onAdd}
              className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
            >
              + 추가
            </button>
          )}
        </div>
        <input
          type="text"
          placeholder="장비 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
        >
          <option value="">전체 카테고리</option>
          {EQUIPMENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">
            {equipment?.length === 0
              ? '등록된 장비가 없습니다.'
              : '검색 결과가 없습니다.'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((item) => (
              <li
                key={item.id}
                onClick={() => onSelect(item)}
                className="cursor-pointer px-3 py-2 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {CATEGORY_ICONS[item.category] || CATEGORY_ICONS.OTHER}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {item.name}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {CATEGORY_LABELS[item.category] || item.category}
                      {item.manager && ` · ${item.manager}`}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

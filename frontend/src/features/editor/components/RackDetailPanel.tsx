import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { useEditorStore } from '../stores/editorStore';
import { RackEquipmentForm } from './RackEquipmentForm';
import { getCategoryColor, EQUIPMENT_CATEGORIES } from '../../../types/rack';
import type { RackDetail } from '../../../types/rack';

interface RackEquipmentItem {
  id: string;
  name: string;
  category: string;
  model: string | null;
  manufacturer: string | null;
  startU: number | null;
  heightU: number;
  materialCategoryId: string | null;
  specParams: unknown;
}

interface RackDetailResponse {
  data: RackDetail & {
    equipment: RackEquipmentItem[];
  };
}

function useRackDetail(rackId: string) {
  return useQuery({
    queryKey: ['rack-detail', rackId],
    queryFn: async () => {
      const { data } = await api.get<RackDetailResponse>(`/racks/${rackId}`);
      return data.data;
    },
    enabled: !!rackId,
  });
}

interface RackDetailPanelProps {
  rackId: string;
  roomId: string;
}

export function RackDetailPanel({ rackId, roomId: _roomId }: RackDetailPanelProps) {
  const { data: rack, isLoading, error } = useRackDetail(rackId);
  const [showAddForm, setShowAddForm] = useState(false);
  const setSelectedRackId = useEditorStore((s) => s.setSelectedRackId);
  const setDetailPanelEquipmentId = useEditorStore((s) => s.setDetailPanelEquipmentId);
  const queryClient = useQueryClient();

  const totalU = rack?.totalU ?? 42;
  const equipment = rack?.equipment ?? [];

  const usedU = useMemo(() => {
    return equipment.reduce((sum, eq) => sum + eq.heightU, 0);
  }, [equipment]);

  const usagePercent = totalU > 0 ? Math.round((usedU / totalU) * 100) : 0;

  // Build U-slot occupancy map
  const slotMap = useMemo(() => {
    const map = new Map<number, RackEquipmentItem>();
    for (const eq of equipment) {
      if (eq.startU != null) {
        for (let u = eq.startU; u < eq.startU + eq.heightU; u++) {
          map.set(u, eq);
        }
      }
    }
    return map;
  }, [equipment]);

  const handleClose = () => {
    setSelectedRackId(null);
  };

  const handleEquipmentClick = (equipmentId: string) => {
    setDetailPanelEquipmentId(equipmentId);
  };

  const handleAddSuccess = () => {
    setShowAddForm(false);
    queryClient.invalidateQueries({ queryKey: ['rack-detail', rackId] });
  };

  if (isLoading) {
    return (
      <div className="absolute right-0 top-0 bottom-0 w-[480px] bg-white border-l shadow-xl z-30 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !rack) {
    return (
      <div className="absolute right-0 top-0 bottom-0 w-[480px] bg-white border-l shadow-xl z-30 p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-red-600">오류</h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-500">랙 정보를 불러올 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[480px] bg-white border-l shadow-xl z-30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{rack.name}</h2>
          <p className="text-xs text-gray-500">{totalU}U 표준랙</p>
        </div>
        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
          title="닫기"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: U-slot visualization */}
        <div className="w-[200px] border-r overflow-y-auto p-3">
          <div className="text-xs font-medium text-gray-500 mb-2">전면 뷰</div>
          <div className="border border-gray-300 rounded">
            {Array.from({ length: totalU }, (_, i) => {
              const uNumber = totalU - i;
              const eq = slotMap.get(uNumber);
              if (eq && eq.startU != null) {
                // Only render the equipment block on its top U position
                if (uNumber === eq.startU + eq.heightU - 1) {
                  const catColor = getCategoryColor(eq.category as Parameters<typeof getCategoryColor>[0]);
                  return (
                    <div
                      key={uNumber}
                      className="flex cursor-pointer hover:brightness-110 transition-all"
                      style={{ height: `${eq.heightU * 20}px` }}
                      onClick={() => handleEquipmentClick(eq.id)}
                      title={`${eq.name} (${eq.startU}-${eq.startU + eq.heightU - 1}U)`}
                    >
                      <div className="w-8 flex items-center justify-center text-[10px] text-gray-400 border-r border-gray-200 bg-gray-50 shrink-0">
                        {uNumber}U
                      </div>
                      <div
                        className="flex-1 flex items-center justify-center text-xs font-medium text-white border-b border-gray-200 px-1"
                        style={{ backgroundColor: catColor }}
                      >
                        <span className="truncate">{eq.name}</span>
                      </div>
                    </div>
                  );
                }
                // Skip rendering for U slots that are part of multi-U equipment (not the top)
                return null;
              }

              // Empty slot
              return (
                <div key={uNumber} className="flex" style={{ height: '20px' }}>
                  <div className="w-8 flex items-center justify-center text-[10px] text-gray-400 border-r border-gray-200 bg-gray-50 shrink-0">
                    {uNumber}U
                  </div>
                  <div className="flex-1 border-b border-gray-100" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Equipment list */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-xs font-medium text-gray-500 mb-2">
            설비 목록 ({equipment.length}개)
          </div>

          {equipment.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">설비가 없습니다</p>
          ) : (
            <div className="space-y-1.5">
              {equipment.map((eq) => {
                const catInfo = EQUIPMENT_CATEGORIES.find((c) => c.value === eq.category);
                return (
                  <button
                    key={eq.id}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors"
                    onClick={() => handleEquipmentClick(eq.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: catInfo?.color ?? '#95A5A6' }}
                      />
                      <span className="text-sm font-medium text-gray-800 truncate">{eq.name}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 ml-4">
                      {eq.startU != null
                        ? `${eq.startU}-${eq.startU + eq.heightU - 1}U`
                        : '미배치'
                      }
                      {eq.model && ` | ${eq.model}`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">
            사용: {usedU}/{totalU}U ({usagePercent}%)
          </span>
          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${usagePercent}%`,
                backgroundColor: usagePercent > 80 ? '#ef4444' : usagePercent > 50 ? '#f59e0b' : '#22c55e',
              }}
            />
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          설비 추가
        </button>
      </div>

      {/* Add equipment form modal */}
      {showAddForm && (
        <RackEquipmentForm
          rackId={rackId}
          totalU={totalU}
          occupiedSlots={slotMap}
          onSuccess={handleAddSuccess}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

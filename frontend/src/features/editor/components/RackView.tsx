import { useState, useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { RackEquipmentForm } from './RackEquipmentForm';

interface RackViewProps {
  equipmentId: string;  // the EQP-RACK equipment ID (can be temp ID)
}

/**
 * Shared rack U-slot visualization + equipment list + add button.
 * Used by EquipmentDetailPanel's "내부 설비" tab for EQP-RACK equipment.
 * Works entirely from local state (editorStore) — no server API calls.
 */
export function RackView({ equipmentId }: RackViewProps) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const setDetailPanelEquipmentId = useEditorStore((s) => s.setDetailPanelEquipmentId);

  const rackEquipment = useMemo(
    () => localEquipment.find((e) => e.id === equipmentId),
    [localEquipment, equipmentId]
  );
  const internalEquipment = useMemo(
    () => localEquipment.filter((e) => e.parentEquipmentId === equipmentId),
    [localEquipment, equipmentId]
  );

  const [showAddForm, setShowAddForm] = useState(false);

  const totalU = (rackEquipment?.specParams as Record<string, unknown> | null)?.u as number ?? 42;

  const usedU = useMemo(() => {
    return internalEquipment.reduce((sum, eq) => sum + (eq.heightU ?? 1), 0);
  }, [internalEquipment]);

  const usagePercent = totalU > 0 ? Math.round((usedU / totalU) * 100) : 0;

  const slotMap = useMemo(() => {
    const map = new Map<number, typeof internalEquipment[number]>();
    for (const eq of internalEquipment) {
      if (eq.startU != null) {
        const h = eq.heightU ?? 1;
        for (let u = eq.startU; u < eq.startU + h; u++) {
          map.set(u, eq);
        }
      }
    }
    return map;
  }, [internalEquipment]);

  const handleEquipmentClick = (eqId: string) => {
    setDetailPanelEquipmentId(eqId);
  };

  const handleAddSuccess = () => {
    setShowAddForm(false);
  };

  if (!rackEquipment) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-400">랙 장비를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* U-slot + Equipment list body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: U-slot visualization */}
        <div className="w-[200px] border-r overflow-y-auto p-3">
          <div className="text-xs font-medium text-gray-500 mb-2">전면 뷰</div>
          <div className="border border-gray-300 rounded">
            {Array.from({ length: totalU }, (_, i) => {
              const uNumber = totalU - i;
              const eq = slotMap.get(uNumber);
              if (eq && eq.startU != null) {
                const h = eq.heightU ?? 1;
                if (uNumber === eq.startU + h - 1) {
                  const catColor = eq.displayColor ?? '#95A5A6';
                  return (
                    <div
                      key={uNumber}
                      className="flex cursor-pointer hover:brightness-110 transition-all"
                      style={{ height: `${h * 20}px` }}
                      onClick={() => handleEquipmentClick(eq.id)}
                      title={`${eq.name} (${eq.startU}-${eq.startU + h - 1}U)`}
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
                return null;
              }

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
            설비 목록 ({internalEquipment.length}개)
          </div>

          {internalEquipment.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">설비가 없습니다</p>
          ) : (
            <div className="space-y-1.5">
              {internalEquipment.map((eq) => {
                const h = eq.heightU ?? 1;
                return (
                  <button
                    key={eq.id}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors"
                    onClick={() => handleEquipmentClick(eq.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: eq.displayColor ?? '#95A5A6' }}
                      />
                      <span className="text-sm font-medium text-gray-800 truncate">{eq.name}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 ml-4">
                      {eq.startU != null
                        ? `${eq.startU}-${eq.startU + h - 1}U`
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
      <div className="border-t px-4 py-3 bg-gray-50 shrink-0">
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

      {showAddForm && (
        <RackEquipmentForm
          rackEquipmentId={equipmentId}
          totalU={totalU}
          occupiedSlots={slotMap}
          onSuccess={handleAddSuccess}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

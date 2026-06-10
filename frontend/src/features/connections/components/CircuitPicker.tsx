import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useEffectiveDistCircuits } from '../../workingCopy/hooks';
import type { DistributionCircuit } from '../../../types/distributionCircuit';
import { groupCircuitsByFeeder } from '../../../types/distributionCircuit';

interface CircuitPickerProps {
  distributionEquipmentId: string;
  distributionName?: string;
  /** 선택된 회로 id. */
  onSelect: (circuitId: string) => void;
  onCancel: () => void;
}

/**
 * 케이블 그리기 중 source/target 이 분전반(DISTRIBUTION) 일 때 회로를 고르는
 * picker. RackModulePicker 와 대칭 — 작업본(localDistributionCircuits)에서
 * 읽어 미저장 tempId 도 해석된다. feeder 그룹별로 분기 목록을 나열.
 */
export function CircuitPicker({
  distributionEquipmentId,
  distributionName,
  onSelect,
  onCancel,
}: CircuitPickerProps) {
  // SSOT-2d Task 3 — 읽기를 통합 스토어 effective 로. effective 는 substation 전역
  // DistributionCircuit 이며 groupCircuitsByFeeder 가 distributionEquipmentId 로 필터한다.
  const effectiveCircuits = useEffectiveDistCircuits() as unknown as DistributionCircuit[];

  const byFeeder = useMemo(
    () => groupCircuitsByFeeder(effectiveCircuits, distributionEquipmentId),
    [effectiveCircuits, distributionEquipmentId],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-[420px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">회로 선택</h3>
            {distributionName && (
              <p className="text-xs text-gray-400 mt-0.5">{distributionName}</p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            title="닫기 (ESC)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {byFeeder.size === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              이 분전반에 등록된 회로가 없습니다. 먼저 상세 패널의 "회로" 탭에서
              전원 계통/분기를 추가하세요.
            </p>
          ) : (
            [...byFeeder.entries()].map(([feederName, branches]) => (
              <div key={feederName} className="rounded-md border border-gray-200">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-700">{feederName}</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {branches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                      >
                        {c.branchName}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

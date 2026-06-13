import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { feedersOfPanel } from '../../assets/distributionSubtree';

interface CircuitPickerProps {
  distributionEquipmentId: string;
  distributionName?: string;
  /** 선택된 전원 계통(FEEDER) asset id. */
  onSelect: (feederAssetId: string) => void;
  onCancel: () => void;
}

/**
 * 케이블 그리기 중 source/target 이 분전반(DISTRIBUTION) 일 때 전원 계통(피더)을 고르는
 * picker. 회로는 분전반 → FEEDER Asset 계층이고, 케이블은 피더로 직접 그려진다
 * (CB = 피더로 가는 출력 케이블). 작업본(effective assets)에서 읽어 미저장 tempId 도
 * 해석된다. onSelect 는 선택된 FEEDER asset id 를 넘긴다.
 */
export function CircuitPicker({
  distributionEquipmentId,
  distributionName,
  onSelect,
  onCancel,
}: CircuitPickerProps) {
  const effectiveAssets = useEffectiveAssets();

  const feeders = useMemo(
    () => feedersOfPanel(effectiveAssets, distributionEquipmentId),
    [effectiveAssets, distributionEquipmentId],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
      <div className="bg-surface rounded-lg shadow-xl w-[420px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-content">전원 계통 선택</h3>
            {distributionName && (
              <p className="text-xs text-content-faint mt-0.5">{distributionName}</p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-2 text-content-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title="닫기 (ESC)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {feeders.length === 0 ? (
            <p className="text-sm text-content-faint text-center py-6">
              이 분전반에 전원 계통(피더)이 없습니다. 상세 패널에서 추가하세요.
            </p>
          ) : (
            <ul className="rounded-md border border-line divide-y divide-line overflow-hidden">
              {feeders.map((feeder) => (
                <li key={feeder.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(feeder.id)}
                    className="w-full px-3 py-2.5 text-left text-sm text-content-muted hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {feeder.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

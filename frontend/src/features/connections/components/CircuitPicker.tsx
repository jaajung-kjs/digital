import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { feederGroupsOfPanel } from '../../assets/distributionSubtree';

interface CircuitPickerProps {
  distributionEquipmentId: string;
  distributionName?: string;
  /** 선택된 분기(BRANCH) asset id. */
  onSelect: (branchAssetId: string) => void;
  onCancel: () => void;
}

/**
 * 케이블 그리기 중 source/target 이 분전반(DISTRIBUTION) 일 때 회로를 고르는
 * picker. 단계3b — 회로는 FEEDER/BRANCH Asset 계층. 작업본(effective assets)에서
 * 읽어 미저장 tempId 도 해석된다. feeder 그룹별로 분기 목록을 나열하고,
 * onSelect 는 선택된 BRANCH asset id 를 넘긴다.
 */
export function CircuitPicker({
  distributionEquipmentId,
  distributionName,
  onSelect,
  onCancel,
}: CircuitPickerProps) {
  const effectiveAssets = useEffectiveAssets();

  const feederGroups = useMemo(
    () => feederGroupsOfPanel(effectiveAssets, distributionEquipmentId),
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
            <h3 className="text-sm font-semibold text-content">회로 선택</h3>
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

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {feederGroups.length === 0 ? (
            <p className="text-sm text-content-faint text-center py-6">
              이 분전반에 등록된 회로가 없습니다. 먼저 상세 패널의 "회로" 탭에서
              전원 계통/분기를 추가하세요.
            </p>
          ) : (
            feederGroups.map(({ feeder, branches }) => (
              <div key={feeder.id} className="rounded-md border border-line">
                <div className="px-3 py-2 bg-surface-2 border-b border-line">
                  <span className="text-sm font-semibold text-content-muted">{feeder.name}</span>
                </div>
                <ul className="divide-y divide-line">
                  {branches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="w-full px-3 py-2 text-left text-sm text-content-muted hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        {c.name}
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

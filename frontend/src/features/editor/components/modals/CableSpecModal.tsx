import { useMemo, useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useCableDrawing } from '../../stores/interactionStore';
import { useInteractionStore } from '../../stores/interactionStore';
import { useCableCategories } from '../../../cables/hooks/useCableCategories';
import type { CableCategory } from '../../../../types/cableCategory';
import { MaterialSelectionModal } from '../MaterialSelectionModal';

export function CableSpecModalWrapper() {
  return <CableSpecModal />;
}

/**
 * 케이블 종류(카테고리) 선택 전용 모달. 종류-우선 흐름의 첫 단계
 * (phase==='selectingType')에서만 노출된다. 출발/도착 endpoint·역할·생성은
 * 캔버스/피커 + commitCable 가 담당한다(1.3~1.5).
 *
 * 카테고리는 `preselectedCableDisplayGroup`(사이드바 pill)로 필터링하거나,
 * 미지정 시 전체를 보여준다.
 */
function CableSpecModal() {
  const cable = useCableDrawing();
  const phase = cable?.phase ?? 'idle';
  const preselectedGroup = useEditorStore(
    (s) => s.preselectedCableDisplayGroup,
  );
  const { data: cableCategories } = useCableCategories();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Reset selection when the modal opens.
  useEffect(() => {
    if (phase === 'selectingType') setSelectedCategoryId(null);
  }, [phase]);

  const visibleCategories = useMemo<CableCategory[]>(() => {
    const all = (cableCategories ?? []).filter((c) => c.isActive);
    if (!preselectedGroup) return all;
    return all.filter((c) => c.displayGroup === preselectedGroup);
  }, [cableCategories, preselectedGroup]);

  if (phase !== 'selectingType') return null;

  const selectedCat = selectedCategoryId
    ? visibleCategories.find((c) => c.id === selectedCategoryId) ?? null
    : null;

  const handleConfirm = () => {
    if (!selectedCat) return;
    useInteractionStore.getState().cableSetType({
      id: selectedCat.id,
      code: selectedCat.code,
      name: selectedCat.name,
      displayColor: selectedCat.displayColor,
    });
    setSelectedCategoryId(null);
  };

  const handleCancel = () => {
    useEditorStore.getState().cancelCableDrawing();
  };

  return (
    <MaterialSelectionModal
      title={
        preselectedGroup
          ? `케이블 — ${preselectedGroup}`
          : '케이블 카테고리 선택'
      }
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmDisabled={!selectedCat}
      selectedLabel={selectedCat?.name}
    >
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
        {visibleCategories.length === 0 ? (
          <p className="text-sm text-content-faint text-center py-6">
            사용 가능한 카테고리가 없습니다.
          </p>
        ) : (
          visibleCategories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            const swatch = cat.displayColor ?? '#9ca3af';
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                  active
                    ? 'border-primary bg-info-bg ring-1 ring-primary/30'
                    : 'border-line hover:bg-surface-2'
                }`}
              >
                <span
                  aria-hidden
                  className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-black/5"
                  style={{ backgroundColor: swatch }}
                />
                <span className="text-sm text-content text-left flex-1 truncate">
                  {cat.name}
                </span>
                {cat.displayGroup && (
                  <span className="text-[11px] text-content-faint">
                    {cat.displayGroup}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </MaterialSelectionModal>
  );
}

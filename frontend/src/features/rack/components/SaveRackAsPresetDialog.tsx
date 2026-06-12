import { useMemo, useState } from 'react';
import { useEffectiveAssets, useEffectiveRackModules } from '../../workingCopy/hooks';
import { useCreateRackPreset, useUpdateRackPreset } from '../hooks/useRackPresets';
import type {
  CreateRackPresetInput,
  RackPreset,
  RackPresetModuleInput,
  UpdateRackPresetInput,
} from '../../../types/rackPreset';

interface SaveRackAsPresetDialogProps {
  rackEquipmentId: string;
  /** 드롭다운에서 선택된 기존 프리셋. 있으면 이름/설명 prefill + 같은 이름으로
   *  저장하면 PATCH(덮어쓰기) 흐름. null/undefined 면 새 프리셋(POST). */
  originalPreset?: RackPreset | null;
  onClose: () => void;
  /** 저장 성공 시 호출 (id 전달). PresetActionsBar 가 selectedPresetId 를
   *  새 또는 같은 프리셋으로 맞춰서 다음 저장도 연속 가능하게. */
  onSaved?: (presetId: string) => void;
}

/**
 * 현재 랙의 working copy 를 RackPreset 으로 저장한다.
 *
 * 두 모드를 하나의 다이얼로그로 통일:
 *  - originalPreset 있고 이름 안 바꿈 → 덮어쓰기 (PATCH)
 *  - 그 외 → 새로 저장 (POST)
 *
 * 사용자는 항상 이름 입력 단계를 거치며, 이름을 바꾸는 순간 자동으로
 * "새 프리셋" 모드가 됨. 버튼 라벨이 모드를 명시함.
 */
export function SaveRackAsPresetDialog({
  rackEquipmentId,
  originalPreset,
  onClose,
  onSaved,
}: SaveRackAsPresetDialogProps) {
  // SSOT-2d3a Task 5 — 랙/모듈을 통합 스토어 effective 에서 읽는다.
  const effectiveAssets = useEffectiveAssets();
  const rackModules = useEffectiveRackModules(rackEquipmentId);
  const createPreset = useCreateRackPreset();
  const updatePreset = useUpdateRackPreset();

  const [name, setName] = useState(originalPreset?.name ?? '');
  const [description, setDescription] = useState(originalPreset?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  const rack = useMemo(
    () => effectiveAssets.find((a) => a.id === rackEquipmentId),
    [effectiveAssets, rackEquipmentId],
  );

  const modules = useMemo(
    () => [...rackModules].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0)),
    [rackModules],
  );

  const orphanModules = useMemo(
    () => modules.filter((m) => !m.assetType?.code),
    [modules],
  );

  const totalU = rack?.totalU ?? 42;
  const canvasWidth = rack?.width2d ?? 0;
  const canvasHeight = rack?.height2d ?? 0;

  // 모드 판별: 기존 프리셋이 있고 이름이 그대로면 PATCH, 아니면 POST.
  const isOverwriteMode = !!originalPreset && name.trim() === originalPreset.name;

  const isPending = createPreset.isPending || updatePreset.isPending;
  const canSave =
    !!rack &&
    name.trim().length > 0 &&
    canvasWidth > 0 &&
    canvasHeight > 0 &&
    orphanModules.length === 0 &&
    !isPending;

  const buildModuleInputs = (): RackPresetModuleInput[] =>
    modules
      .filter((m) => !!m.assetType?.code)
      .map((m) => ({
        slotIndex: m.slotIndex ?? 0,
        slotSpan: m.slotSpan ?? 1,
        categoryCode: m.assetType!.code as string,
        defaultName: m.name || null,
      }));

  const doCreate = async () => {
    if (!rack) return;
    const payload: CreateRackPresetInput = {
      name: name.trim(),
      totalU,
      canvasWidth,
      canvasHeight,
      description: description.trim() || null,
      modules: buildModuleInputs(),
    };
    try {
      const created = await createPreset.mutateAsync(payload);
      onSaved?.(created.id);
      onClose();
    } catch (e: unknown) {
      setError(extractErrorMessage(e, '새 프리셋 저장에 실패했습니다.'));
    }
  };

  const doOverwrite = async () => {
    if (!rack || !originalPreset) return;
    const payload: UpdateRackPresetInput = {
      name: name.trim(),
      description: description.trim() || null,
      totalU,
      canvasWidth,
      canvasHeight,
      modules: buildModuleInputs(),
    };
    try {
      await updatePreset.mutateAsync({ id: originalPreset.id, input: payload });
      onSaved?.(originalPreset.id);
      onClose();
    } catch (e: unknown) {
      setError(extractErrorMessage(e, '프리셋 덮어쓰기에 실패했습니다.'));
    }
  };

  const handleSaveClick = () => {
    setError(null);
    if (isOverwriteMode) {
      setShowOverwriteConfirm(true);
    } else {
      void doCreate();
    }
  };

  if (!rack) {
    return (
      <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50">
        <div className="bg-surface rounded-lg p-6 max-w-md w-full mx-4">
          <p className="text-sm text-content-muted">랙 장비를 찾을 수 없습니다.</p>
          <div className="flex justify-end mt-4">
            <button onClick={onClose} className="px-4 py-2 text-content hover:bg-surface-2 rounded-md">
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50">
        <div className="bg-surface rounded-lg p-6 max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-1">
            {isOverwriteMode ? '프리셋 덮어쓰기' : '프리셋 저장'}
          </h3>
          <p className="text-xs text-content-faint mb-4">
            {isOverwriteMode
              ? `기존 '${originalPreset!.name}' 프리셋을 현재 랙 구성으로 덮어씁니다. 이름을 바꾸면 새 프리셋으로 저장됩니다.`
              : originalPreset
                ? '이름을 변경했습니다 — 새 프리셋으로 저장됩니다. 원래 이름으로 되돌리면 덮어쓰기 모드로 돌아갑니다.'
                : '현재 랙 구성을 새 프리셋으로 저장합니다.'}
          </p>

          <div className="mb-3">
            <label className="block text-sm font-medium text-content mb-1">
              이름 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="예: 표준 네트워크 랙"
              autoFocus
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-content mb-1">설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
              rows={2}
              placeholder="(선택)"
            />
          </div>

          {/* snapshot summary */}
          <div className="mb-3 px-3 py-2 bg-surface-2 rounded-md border border-line text-xs text-content-muted space-y-0.5">
            <div>
              <span className="font-medium text-content">슬롯:</span> {totalU}U
            </div>
            <div>
              <span className="font-medium text-content">캔버스:</span>{' '}
              {Math.round(canvasWidth)} × {Math.round(canvasHeight)}
            </div>
            <div>
              <span className="font-medium text-content">모듈:</span> {modules.length}개 포함
            </div>
          </div>

          {orphanModules.length > 0 && (
            <p className="mb-3 text-xs text-warning">
              카테고리 코드가 없는 모듈이 {orphanModules.length}개 있어 저장할 수 없습니다.
            </p>
          )}

          {error && <p className="mb-3 text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-content hover:bg-surface-2 rounded-md disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSaveClick}
              disabled={!canSave}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50"
            >
              {isPending
                ? '저장 중…'
                : isOverwriteMode
                  ? '덮어쓰기'
                  : '새로 저장'}
            </button>
          </div>
        </div>
      </div>

      {showOverwriteConfirm && originalPreset && (
        <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-[60]">
          <div className="bg-surface rounded-lg p-6 max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold mb-2">기존 프리셋 덮어쓰기</h4>
            <p className="text-sm text-content-muted mb-4">
              <strong className="text-content">'{originalPreset.name}'</strong> 프리셋의 모듈 구성이 현재 랙 ({modules.length}개 모듈) 로 영구 교체됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowOverwriteConfirm(false)}
                disabled={isPending}
                className="px-4 py-2 text-content hover:bg-surface-2 rounded-md disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={() => {
                  setShowOverwriteConfirm(false);
                  void doOverwrite();
                }}
                disabled={isPending}
                className="px-4 py-2 bg-danger text-white rounded-md hover:opacity-90 disabled:opacity-50"
              >
                덮어쓰기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function extractErrorMessage(e: unknown, fallback: string): string {
  return (
    (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ??
    (e as { message?: string })?.message ??
    fallback
  );
}

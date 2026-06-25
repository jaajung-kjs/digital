import { useState } from 'react';
import { useUpdateRackPreset } from '../hooks/useRackPresets';
import type { RackPreset } from '../../../types/rackPreset';

interface EditRackPresetDialogProps {
  preset: RackPreset;
  onClose: () => void;
}

/**
 * P10: lightweight rename/description editor for an existing preset.
 *
 * Module-slot editing is intentionally NOT included here — the preferred
 * workflow is "apply preset → tweak in working copy → save as new preset
 * (or overwrite via API)". The full slot editor will land in a follow-up.
 */
export function EditRackPresetDialog({
  preset,
  onClose,
}: EditRackPresetDialogProps) {
  const updatePreset = useUpdateRackPreset();

  const [name, setName] = useState(preset.name);
  const [description, setDescription] = useState(preset.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== preset.name ||
    (description.trim() || null) !== (preset.description ?? null);

  const canSave = name.trim().length > 0 && dirty && !updatePreset.isPending;

  const handleSave = async () => {
    setError(null);
    try {
      await updatePreset.mutateAsync({
        id: preset.id,
        input: {
          name: name.trim(),
          description: description.trim() || null,
        },
      });
      onClose();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ??
        (e as { message?: string })?.message ??
        '프리셋 수정에 실패했습니다.';
      setError(msg);
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-modal">
      <div className="bg-surface rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-1">프리셋 수정</h3>
        <p className="text-xs text-content-faint mb-4">
          {preset.totalU}U · 모듈 {preset.modules.length}개
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
          />
        </div>

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={updatePreset.isPending}
            className="px-4 py-2 text-content hover:bg-surface-2 rounded-md disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50"
          >
            {updatePreset.isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

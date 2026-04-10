interface MaterialSelectionModalProps {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled: boolean;
  children: React.ReactNode;
  selectedLabel?: string | null;
}

export function MaterialSelectionModal({
  title,
  onConfirm,
  onCancel,
  confirmDisabled,
  children,
  selectedLabel,
}: MaterialSelectionModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="mb-4">{children}</div>
        {selectedLabel && (
          <div className="mb-3 p-2 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">선택: {selectedLabel}</p>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

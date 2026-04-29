interface DraftRecoveryDialogProps {
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * Shown on plan load when a localStorage draft exists for the current floor.
 * Lets the user restore the draft or discard it and load the latest server state.
 */
export function DraftRecoveryDialog({ onRestore, onDiscard }: DraftRecoveryDialogProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-2">저장하지 않은 변경사항이 있습니다</h3>
        <p className="text-sm text-gray-500 mb-4">
          이전에 작업하던 내용을 이어서 편집하거나, 변경사항을 폐기하고 최신 도면을 불러올 수 있습니다.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onDiscard} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg">
            변경사항 폐기
          </button>
          <button onClick={onRestore} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            이어서 편집
          </button>
        </div>
      </div>
    </div>
  );
}

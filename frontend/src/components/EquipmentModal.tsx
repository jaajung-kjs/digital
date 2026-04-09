/**
 * EquipmentModal — Stub component for adding equipment to a rack.
 * TODO: Implement full UI (was deleted during refactoring).
 */

import type { CreateEquipmentRequest } from '../types/rack';

interface EquipmentModalProps {
  initialStartU: number | null;
  onClose: () => void;
  onSubmit: (data: CreateEquipmentRequest) => void;
  isLoading: boolean;
  error: string | null;
}

export function EquipmentModal({ initialStartU, onClose, onSubmit, isLoading, error }: EquipmentModalProps) {
  const handleSubmit = () => {
    onSubmit({
      name: '',
      startU: initialStartU ?? 1,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">설비 추가</h3>
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        <p className="text-sm text-gray-500 mb-4">시작 U: {initialStartU ?? '-'}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">취소</button>
          <button onClick={handleSubmit} disabled={isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {isLoading ? '추가 중...' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

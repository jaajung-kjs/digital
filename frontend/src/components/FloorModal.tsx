import { useState, useEffect } from 'react';
import type {
  FloorListItem,
  CreateFloorRequest,
  UpdateFloorRequest,
} from '../types';

interface FloorModalProps {
  floor?: FloorListItem | null;
  onClose: () => void;
  onSubmit: (data: CreateFloorRequest & UpdateFloorRequest) => void;
  isLoading: boolean;
  error: string | null;
}

export function FloorModal({
  floor,
  onClose,
  onSubmit,
  isLoading,
  error,
}: FloorModalProps) {
  const isEdit = !!floor;
  const [formData, setFormData] = useState({
    name: '',
    floorNumber: '',
    description: '',
  });

  useEffect(() => {
    if (floor) {
      setFormData({
        name: floor.name,
        floorNumber: floor.floorNumber || '',
        description: floor.description || '',
      });
    }
  }, [floor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: formData.name,
      floorNumber: formData.floorNumber || undefined,
      description: formData.description || undefined,
    };
    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-medium text-gray-900">
            {isEdit ? '층 편집' : '층 추가'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              층 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              maxLength={100}
              placeholder="예: B1층 ICT실"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              층 번호
            </label>
            <input
              type="text"
              value={formData.floorNumber}
              onChange={(e) => setFormData({ ...formData, floorNumber: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={20}
              placeholder="예: B1, 1F, 2F"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              설명
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="예: 메인 서버실"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading || !formData.name}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type {
  Equipment,
  UpdateEquipmentRequest,
  EquipmentCategory,
} from '../types/rack';
import { EQUIPMENT_CATEGORIES, getCategoryColor } from '../types/rack';

interface EquipmentDetailModalProps {
  equipment: Equipment;
  onClose: () => void;
  onUpdate: (data: UpdateEquipmentRequest) => void;
  onDelete: () => void;
  isLoading: boolean;
  error: string | null;
}

export function EquipmentDetailModal({
  equipment,
  onClose,
  onUpdate,
  onDelete,
  isLoading,
  error,
}: EquipmentDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: equipment.name,
    model: equipment.model || '',
    manufacturer: equipment.manufacturer || '',
    serialNumber: equipment.serialNumber || '',
    category: equipment.category,
    installDate: equipment.installDate
      ? new Date(equipment.installDate).toISOString().split('T')[0]
      : '',
    manager: equipment.manager || '',
    description: equipment.description || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: UpdateEquipmentRequest = {
      name: formData.name,
      startU: equipment.startU, // 기존 위치 유지
      heightU: 1, // 항상 1U
      category: formData.category,
      model: formData.model || null,
      manufacturer: formData.manufacturer || null,
      serialNumber: formData.serialNumber || null,
      installDate: formData.installDate || null,
      manager: formData.manager || null,
      description: formData.description || null,
    };

    onUpdate(data);
  };

  const getCategoryLabel = (category: EquipmentCategory) => {
    return EQUIPMENT_CATEGORIES.find((c) => c.value === category)?.label || category;
  };

  // 보기 모드
  if (!isEditing) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: getCategoryColor(equipment.category) }}
              />
              <h2 className="text-lg font-medium text-gray-900">
                {equipment.name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6">
            {/* 에러 메시지 */}
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* 정보 표시 */}
            <div className="space-y-6">
              {/* 기본 정보 */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">기본 정보</h3>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-gray-500">모델</dt>
                    <dd className="text-gray-900">{equipment.model || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">제조사</dt>
                    <dd className="text-gray-900">{equipment.manufacturer || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">시리얼</dt>
                    <dd className="text-gray-900">{equipment.serialNumber || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">카테고리</dt>
                    <dd className="text-gray-900">{getCategoryLabel(equipment.category)}</dd>
                  </div>
                </dl>
              </div>

              {/* 추가 정보 */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">추가 정보</h3>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-gray-500">설치일</dt>
                    <dd className="text-gray-900">
                      {equipment.installDate
                        ? new Date(equipment.installDate).toLocaleDateString()
                        : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">담당자</dt>
                    <dd className="text-gray-900">{equipment.manager || '-'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-gray-500">설명</dt>
                    <dd className="text-gray-900">{equipment.description || '-'}</dd>
                  </div>
                </dl>
              </div>

              {/* 포트 정보 */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">포트 정보</h3>
                <p className="text-sm text-gray-900">
                  {equipment.portCount}개의 포트
                </p>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex justify-between gap-3 pt-6 mt-6 border-t">
              <button
                onClick={onDelete}
                disabled={isLoading}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                삭제
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  닫기
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  편집
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 편집 모드
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-medium text-gray-900">설비 편집</h2>
          <button
            onClick={() => setIsEditing(false)}
            className="text-gray-400 hover:text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* 기본 정보 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 border-b pb-2">기본 정보</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                maxLength={100}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">모델명</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">제조사</label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={100}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시리얼 번호</label>
                <input
                  type="text"
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as EquipmentCategory })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {EQUIPMENT_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 추가 정보 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 border-b pb-2">추가 정보</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">설치일</label>
                <input
                  type="date"
                  value={formData.installDate}
                  onChange={(e) => setFormData({ ...formData, installDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
                <input
                  type="text"
                  value={formData.manager}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={100}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
              />
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
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

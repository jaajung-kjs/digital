import { useState } from 'react';
import { useEquipmentDetail, useDeleteEquipment } from '../hooks/useEquipment';
import { PhotoHistory } from './PhotoHistory';
import { MaintenanceLog as MaintenanceLogList } from './MaintenanceLog';
import { ConnectionDiagram } from './ConnectionDiagram';
import { EquipmentForm } from './EquipmentForm';
import { useIsAdmin } from '../../../stores/authStore';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
} from '../types/equipment';

type TabKey = 'photos' | 'maintenance' | 'connections';

interface EquipmentDetailDrawerProps {
  equipmentId: string;
  roomId: string;
  onClose: () => void;
}

export function EquipmentDetailDrawer({
  equipmentId,
  roomId,
  onClose,
}: EquipmentDetailDrawerProps) {
  const { data: equipment, isLoading } = useEquipmentDetail(equipmentId);
  const deleteEquipment = useDeleteEquipment();
  const isAdmin = useIsAdmin();
  const [activeTab, setActiveTab] = useState<TabKey>('photos');
  const [isEditing, setIsEditing] = useState(false);

  const handleDelete = async () => {
    if (!confirm('이 장비를 삭제하시겠습니까?')) return;
    await deleteEquipment.mutateAsync(equipmentId);
    onClose();
  };

  if (isLoading) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 flex w-96 items-center justify-center border-l border-gray-200 bg-white shadow-lg">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 flex w-96 items-center justify-center border-l border-gray-200 bg-white shadow-lg">
        <p className="text-gray-500">장비를 찾을 수 없습니다.</p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-gray-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700">장비 수정</h2>
          <button
            onClick={() => setIsEditing(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            취소
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <EquipmentForm
            equipment={equipment}
            onSuccess={() => setIsEditing(false)}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'photos', label: '사진' },
    { key: 'maintenance', label: '정비이력' },
    { key: 'connections', label: '연결' },
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-gray-200 bg-white shadow-lg">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            &larr; 닫기
          </button>
          {isAdmin && (
            <div className="flex gap-1">
              <button
                onClick={() => setIsEditing(true)}
                className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
              >
                수정
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteEquipment.isPending}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl">
            {CATEGORY_ICONS[equipment.category] || CATEGORY_ICONS.OTHER}
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              {equipment.name}
            </h2>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              {CATEGORY_LABELS[equipment.category] || equipment.category}
            </span>
          </div>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {equipment.model && (
            <>
              <dt className="text-gray-500">모델</dt>
              <dd className="text-gray-700">{equipment.model}</dd>
            </>
          )}
          {equipment.manufacturer && (
            <>
              <dt className="text-gray-500">제조사</dt>
              <dd className="text-gray-700">{equipment.manufacturer}</dd>
            </>
          )}
          {equipment.manager && (
            <>
              <dt className="text-gray-500">담당자</dt>
              <dd className="text-gray-700">{equipment.manager}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-center text-sm font-medium ${
              activeTab === tab.key
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'photos' && (
          <PhotoHistory equipmentId={equipmentId} />
        )}
        {activeTab === 'maintenance' && (
          <MaintenanceLogList equipmentId={equipmentId} />
        )}
        {activeTab === 'connections' && (
          <ConnectionDiagram roomId={roomId} equipmentId={equipmentId} />
        )}
      </div>
    </div>
  );
}

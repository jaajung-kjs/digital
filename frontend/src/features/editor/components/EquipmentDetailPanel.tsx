import { useState } from 'react';
import type {
  Equipment,
  UpdateEquipmentRequest,
} from '../../../types/rack';
import { getCategoryColor } from '../../../types/rack';
import { EquipmentInfoTab } from './tabs/EquipmentInfoTab';
import { EquipmentPhotosTab } from './tabs/EquipmentPhotosTab';
import { EquipmentLogsTab } from './tabs/EquipmentLogsTab';
import { EquipmentConnectionsTab } from './tabs/EquipmentConnectionsTab';

type TabId = 'info' | 'photos' | 'logs' | 'connections';

const TABS: { id: TabId; label: string }[] = [
  { id: 'info', label: '정보' },
  { id: 'photos', label: '사진' },
  { id: 'logs', label: '이력' },
  { id: 'connections', label: '연결' },
];

interface EquipmentDetailPanelProps {
  equipment: Equipment;
  onClose: () => void;
  onUpdate: (data: UpdateEquipmentRequest) => void;
  onDelete: () => void;
  isLoading: boolean;
  error: string | null;
}

export function EquipmentDetailPanel({
  equipment,
  onClose,
  onUpdate,
  onDelete,
  isLoading,
  error,
}: EquipmentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
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

        {/* 탭 네비게이션 */}
        <div className="flex border-b px-6 sticky top-[65px] bg-white z-10">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="p-6">
          {activeTab === 'info' && (
            <EquipmentInfoTab
              equipment={equipment}
              onUpdate={onUpdate}
              onDelete={onDelete}
              isLoading={isLoading}
              error={error}
            />
          )}
          {activeTab === 'photos' && (
            <EquipmentPhotosTab equipment={equipment} />
          )}
          {activeTab === 'logs' && (
            <EquipmentLogsTab equipment={equipment} />
          )}
          {activeTab === 'connections' && (
            <EquipmentConnectionsTab equipment={equipment} />
          )}
        </div>
      </div>
    </div>
  );
}

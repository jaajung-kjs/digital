import { useState, type ReactNode } from 'react';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { isTempId } from '../../../../../utils/idHelpers';
import { InfoTab } from '../InfoTab';
import { PhotosTab, SnapshotPhotosTab } from '../PhotosTab';
import { LogsTab } from '../LogsTab';
import { ConnectionsTab } from '../ConnectionsTab';
import { useMergedEquipmentDetail } from '../hooks/useEquipmentDetail';

export type BaseTabKey = 'photos' | 'info' | 'logs' | 'fourth' | 'fifth';

export interface BaseTabSlot {
  label: string;
  render: () => ReactNode;
}

interface Props {
  equipmentId: string;
  floorId: string;
  /** 4번째 탭 교체. 기본은 '연결' = ConnectionsTab. */
  fourthTab?: BaseTabSlot;
  /** 5번째 탭 추가. 기본 없음. */
  fifthTab?: BaseTabSlot;
  initialTab?: BaseTabKey;
}

export function BaseEquipmentTabsPanel({
  equipmentId,
  floorId,
  fourthTab,
  fifthTab,
  initialTab = 'info',
}: Props) {
  const snapshotActive = useSnapshotStore((s) => s.active);
  const isTemp = isTempId(equipmentId);
  const { equipment, isLoading, error } = useMergedEquipmentDetail(equipmentId);
  const [activeTab, setActiveTab] = useState<BaseTabKey>(initialTab);

  const tabs: { key: BaseTabKey; label: string }[] = [
    { key: 'photos', label: '사진' },
    { key: 'info', label: '정보' },
    { key: 'logs', label: '점검/고장' },
    { key: 'fourth', label: fourthTab?.label ?? '연결' },
    ...(fifthTab ? [{ key: 'fifth' as const, label: fifthTab.label }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 px-2 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {!isTemp && isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : !isTemp && error ? (
          <div className="p-4 text-center text-sm text-red-500">데이터를 불러올 수 없습니다.</div>
        ) : equipment ? (
          <>
            {activeTab === 'photos' && (
              snapshotActive
                ? <SnapshotPhotosTab equipmentId={equipmentId} />
                : <PhotosTab equipment={equipment} readOnly={false} />
            )}
            {activeTab === 'info' && <InfoTab equipment={equipment} readOnly={snapshotActive} />}
            {activeTab === 'logs' && (
              snapshotActive ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                  이 버전의 점검/고장 이력은 포함되어 있지 않습니다
                </div>
              ) : (
                <LogsTab equipmentId={equipmentId} readOnly={false} />
              )
            )}
            {activeTab === 'fourth' && (
              fourthTab
                ? fourthTab.render()
                : <ConnectionsTab equipmentId={equipmentId} floorId={floorId} />
            )}
            {activeTab === 'fifth' && fifthTab?.render()}
          </>
        ) : null}
      </div>
    </div>
  );
}

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
  /** 4번째 탭 교체. 기본은 '연결' = ConnectionsTab. */
  fourthTab?: BaseTabSlot;
  /** 5번째 탭 추가. 기본 없음. */
  fifthTab?: BaseTabSlot;
  initialTab?: BaseTabKey;
  /** 탭 인덱스 기반 초기 탭 (0=사진, 1=정보, 2=점검/고장, 3=연결, 4=fifth). initialTab보다 우선. */
  defaultTabIndex?: number;
}

const TAB_KEYS: BaseTabKey[] = ['photos', 'info', 'logs', 'fourth', 'fifth'];

function resolveInitialTab(
  defaultTabIndex?: number,
  initialTab?: BaseTabKey,
): BaseTabKey {
  if (defaultTabIndex !== undefined) {
    return TAB_KEYS[defaultTabIndex] ?? 'info';
  }
  return initialTab ?? 'info';
}

export function BaseEquipmentTabsPanel({
  equipmentId,
  fourthTab,
  fifthTab,
  initialTab,
  defaultTabIndex,
}: Props) {
  const snapshotActive = useSnapshotStore((s) => s.active);
  const isTemp = isTempId(equipmentId);
  const { equipment, isLoading, error } = useMergedEquipmentDetail(equipmentId);
  const [activeTab, setActiveTab] = useState<BaseTabKey>(() =>
    resolveInitialTab(defaultTabIndex, initialTab),
  );

  const tabs: { key: BaseTabKey; label: string }[] = [
    { key: 'photos', label: '사진' },
    { key: 'info', label: '정보' },
    { key: 'logs', label: '고장이력' },
    { key: 'fourth', label: fourthTab?.label ?? '연결' },
    ...(fifthTab ? [{ key: 'fifth' as const, label: fifthTab.label }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-line shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 px-2 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-content-muted hover:text-content-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {!isTemp && isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : !isTemp && error ? (
          <div className="p-4 text-center text-sm text-danger">데이터를 불러올 수 없습니다.</div>
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
                <div className="flex items-center justify-center py-12 text-sm text-content-faint">
                  이 버전의 고장 이력은 포함되어 있지 않습니다
                </div>
              ) : (
                <LogsTab equipmentId={equipmentId} readOnly={false} />
              )
            )}
            {activeTab === 'fourth' && (
              fourthTab
                ? fourthTab.render()
                : <ConnectionsTab equipmentId={equipmentId} />
            )}
            {activeTab === 'fifth' && fifthTab?.render()}
          </>
        ) : null}
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { isTempId } from '../../../utils/idHelpers';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useOfdConnectionFlowStore } from '../../fiber/stores/ofdConnectionFlowStore';
import { RackView } from './RackView';
import { InfoTab } from '../../equipment/components/detail/InfoTab';
import { PhotosTab, SnapshotPhotosTab } from '../../equipment/components/detail/PhotosTab';
import { LogsTab } from '../../equipment/components/detail/LogsTab';
import { ConnectionsTab } from '../../equipment/components/detail/ConnectionsTab';
import { SnapshotRackView } from '../../equipment/components/detail/SnapshotRackView';
import type { EquipmentDetail } from '../../equipment/components/detail/types';

interface EquipmentDetailPanelProps {
  equipmentId: string;
  floorId: string;
}

type TabKey = 'photos' | 'info' | 'logs' | 'connections' | 'rack';

const BASE_TABS: { key: TabKey; label: string }[] = [
  { key: 'photos', label: '사진' },
  { key: 'info', label: '정보' },
  { key: 'logs', label: '점검/고장' },
  { key: 'connections', label: '연결' },
];

function useEquipmentDetail(equipmentId: string) {
  const isTemp = isTempId(equipmentId);
  return useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: async () => {
      const { data } = await api.get<{ data: EquipmentDetail }>(`/equipment/${equipmentId}`);
      return data.data;
    },
    enabled: !!equipmentId && !isTemp,
  });
}

function useMergedEquipmentDetail(equipmentId: string): {
  equipment: EquipmentDetail | null;
  isLoading: boolean;
  error: unknown;
} {
  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const isTemp = isTempId(equipmentId);
  const { data: backendData, isLoading, error } = useEquipmentDetail(equipmentId);
  const localEquipment = useEditorStore((s) => s.localEquipment);

  // In snapshot mode, read from snapshot data — no backend or editor state
  if (snapshotActive) {
    const snapEq = snapshotEquipment.find((e) => e.id === equipmentId);
    if (!snapEq) {
      return { equipment: null, isLoading: false, error: null };
    }
    const equipment: EquipmentDetail = {
      id: snapEq.id,
      name: snapEq.name,
      model: snapEq.model ?? null,
      manufacturer: snapEq.manufacturer ?? null,
      manager: snapEq.manager ?? null,
      description: snapEq.description ?? null,
      installDate: null,
      width2d: snapEq.width,
      height2d: snapEq.height,
      frontImageUrl: null,
      rearImageUrl: null,
      materialCategoryCode: snapEq.materialCategoryCode ?? null,
      materialCategoryName: snapEq.materialCategoryName ?? null,
      displayColor: snapEq.displayColor ?? null,
      specification: snapEq.specification ?? null,
      specParams: snapEq.specParams ?? null,
    };
    return { equipment, isLoading: false, error: null };
  }

  const localEq = localEquipment.find((e) => e.id === equipmentId);

  if (!localEq) {
    return { equipment: null, isLoading: isTemp ? false : isLoading, error };
  }

  const pick = <T,>(localVal: T | undefined | null, backendVal: T | undefined | null): T | null =>
    localVal !== undefined ? (localVal ?? null) : (backendVal ?? null);

  const equipment: EquipmentDetail = {
    id: localEq.id,
    name: localEq.name,
    model: pick(localEq.model, backendData?.model),
    manufacturer: pick(localEq.manufacturer, backendData?.manufacturer),
    manager: pick(localEq.manager, backendData?.manager),
    description: pick(localEq.description, backendData?.description),
    installDate: backendData?.installDate ?? null,
    width2d: localEq.width,
    height2d: localEq.height,
    frontImageUrl: backendData?.frontImageUrl ?? null,
    rearImageUrl: backendData?.rearImageUrl ?? null,
    materialCategoryId: localEq.materialCategoryId ?? null,
    materialCategoryCode: localEq.materialCategoryCode ?? null,
    materialCategoryName: localEq.materialCategoryName ?? null,
    displayColor: localEq.displayColor ?? null,
    specification: localEq.specification ?? null,
    specParams: localEq.specParams ?? null,
  };

  return { equipment, isLoading: isTemp ? false : isLoading, error: isTemp ? null : error };
}

export function EquipmentDetailPanel({ equipmentId, floorId }: EquipmentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const setDetailPanelEquipmentId = useEditorStore((s) => s.setDetailPanelEquipmentId);
  const snapshotActive = useSnapshotStore((s) => s.active);
  const isTemp = isTempId(equipmentId);
  const { equipment, isLoading, error } = useMergedEquipmentDetail(equipmentId);
  const ofdPhase = useOfdConnectionFlowStore((s) => s.phase);
  const ofdFlowOfdId = useOfdConnectionFlowStore((s) => s.ofdId);

  // Determine if this is a rack equipment — use snapshot data when active
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const editorEquipment = useEditorStore((s) => s.localEquipment);
  const localEquipment = snapshotActive ? snapshotEquipment : editorEquipment;
  const localEq = localEquipment.find((e) => e.id === equipmentId);
  const isRackEquipment = localEq?.materialCategoryCode?.startsWith('EQP-RACK') ?? false;

  // Build tab list: add "내부 설비" tab when equipment is EQP-RACK (regardless of Rack entity)
  const tabs = useMemo(() => {
    if (isRackEquipment) {
      return [...BASE_TABS, { key: 'rack' as TabKey, label: '내부 설비' }];
    }
    return BASE_TABS;
  }, [isRackEquipment]);

  // Check if this is a child of a rack (has parentEquipmentId)
  const parentEquipmentId = localEq?.parentEquipmentId ?? null;

  // I35: ESC to close panel (when no modal/lightbox is open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't close if a modal/lightbox/dialog is open (check for z-index 50+ overlays)
        const overlays = document.querySelectorAll('[class*="fixed inset-0"]');
        if (overlays.length > 0) return;
        setDetailPanelEquipmentId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setDetailPanelEquipmentId]);

  // Auto-switch to connections tab when OFD flow targets this equipment
  useEffect(() => {
    if (ofdPhase === 'selectingPort' && ofdFlowOfdId === equipmentId) {
      setActiveTab('connections');
    }
  }, [ofdPhase, ofdFlowOfdId, equipmentId]);

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 bg-white border-l border-gray-200 shadow-[-4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col ${
        activeTab === 'rack' ? 'w-[480px]' : 'w-[360px]'
      }`}
      style={{ animation: 'slideInRight 0.25s ease-out' }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* I33: Back button for rack child equipment */}
          {parentEquipmentId && (
            <button
              onClick={() => setDetailPanelEquipmentId(parentEquipmentId)}
              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
              title="랙으로 돌아가기"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h3 className="text-sm font-bold text-gray-900 truncate">
            {!isTemp && isLoading ? '로딩 중...' : equipment?.name ?? '설비 상세'}
          </h3>
          {equipment && (
            <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
              {localEq?.materialCategoryName ?? localEq?.materialCategoryCode ?? '-'}
            </span>
          )}
        </div>
        <button
          onClick={() => setDetailPanelEquipmentId(null)}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
          title="닫기"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Snapshot read-only banner */}
      {snapshotActive && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 font-medium text-center shrink-0">
          과거 도면 보기 중 (읽기 전용)
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-2 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!isTemp && isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : !isTemp && error ? (
          <div className="p-4 text-center text-sm text-red-500">
            데이터를 불러올 수 없습니다.
          </div>
        ) : equipment ? (
          <>
            {activeTab === 'photos' && (
              snapshotActive ? (
                <SnapshotPhotosTab equipmentId={equipmentId} />
              ) : (
                <PhotosTab equipment={equipment} readOnly={false} />
              )
            )}
            {activeTab === 'info' && (
              <InfoTab equipment={equipment} readOnly={snapshotActive} />
            )}
            {activeTab === 'logs' && (
              snapshotActive ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                  이 버전의 점검/고장 이력은 포함되어 있지 않습니다
                </div>
              ) : (
                <LogsTab equipmentId={equipmentId} readOnly={false} />
              )
            )}
            {activeTab === 'connections' && (
              <ConnectionsTab equipmentId={equipmentId} floorId={floorId} materialCategoryCode={equipment.materialCategoryCode} />
            )}
            {activeTab === 'rack' && isRackEquipment && (
              snapshotActive ? (
                <SnapshotRackView equipmentId={equipmentId} />
              ) : (
                <RackView equipmentId={equipmentId} />
              )
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

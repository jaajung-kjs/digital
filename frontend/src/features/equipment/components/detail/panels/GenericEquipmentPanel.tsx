import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../../utils/api';
import { isTempId } from '../../../../../utils/idHelpers';
import { useEditorStore } from '../../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { useOfdConnectionFlowStore } from '../../../../fiber/stores/ofdConnectionFlowStore';
import { InfoTab } from '../InfoTab';
import { PhotosTab, SnapshotPhotosTab } from '../PhotosTab';
import { LogsTab } from '../LogsTab';
import { ConnectionsTab } from '../ConnectionsTab';
import type { EquipmentDetail } from '../types';

export type ExtraTab = {
  key: string;
  label: string;
  render: () => ReactNode;
};

export interface GenericEquipmentPanelProps {
  equipmentId: string;
  floorId: string;
  /** Extra tabs appended after the 4 base tabs (rack 내부 설비, OFD 광경로 등). */
  extraTabs?: ExtraTab[];
  /** Override default initial tab (e.g. 'connections' for OFD flow). */
  initialTab?: string;
  /** Override the base 4 tabs with a custom set. Used by domain panels. */
  overrideBaseTabs?: ExtraTab[];
}

type BaseTabKey = 'photos' | 'info' | 'logs' | 'connections';

const BASE_TABS: { key: BaseTabKey; label: string }[] = [
  { key: 'photos', label: '사진' },
  { key: 'info', label: '정보' },
  { key: 'logs', label: '점검/고장' },
  { key: 'connections', label: '연결' },
];

/* ── shared data merger (re-used by domain panels via export) ───────── */

export function useEquipmentDetail(equipmentId: string) {
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

export function useMergedEquipmentDetail(equipmentId: string): {
  equipment: EquipmentDetail | null;
  isLoading: boolean;
  error: unknown;
} {
  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const isTemp = isTempId(equipmentId);
  const { data: backendData, isLoading, error } = useEquipmentDetail(equipmentId);
  const localEquipment = useEditorStore((s) => s.localEquipment);

  if (snapshotActive) {
    const snapEq = snapshotEquipment.find((e) => e.id === equipmentId);
    if (!snapEq) return { equipment: null, isLoading: false, error: null };
    const equipment: EquipmentDetail = {
      id: snapEq.id,
      name: snapEq.name,
      manager: snapEq.manager ?? null,
      description: snapEq.description ?? null,
      installDate: null,
      width2d: snapEq.width,
      height2d: snapEq.height,
      frontImageUrl: null,
      rearImageUrl: null,
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
    manager: pick(localEq.manager, backendData?.manager),
    description: pick(localEq.description, backendData?.description),
    installDate: backendData?.installDate ?? null,
    width2d: localEq.width,
    height2d: localEq.height,
    frontImageUrl: backendData?.frontImageUrl ?? null,
    rearImageUrl: backendData?.rearImageUrl ?? null,
  };
  return { equipment, isLoading: isTemp ? false : isLoading, error: isTemp ? null : error };
}

/* ── Generic 4-tab panel ─────────────────────────────────────────── */

export function GenericEquipmentPanel({
  equipmentId,
  floorId,
  extraTabs = [],
  initialTab,
  overrideBaseTabs,
}: GenericEquipmentPanelProps) {
  const snapshotActive = useSnapshotStore((s) => s.active);
  const isTemp = isTempId(equipmentId);
  const { equipment, isLoading, error } = useMergedEquipmentDetail(equipmentId);
  const ofdPhase = useOfdConnectionFlowStore((s) => s.phase);
  const ofdFlowOfdId = useOfdConnectionFlowStore((s) => s.ofdId);

  const tabs = useMemo<{ key: string; label: string; render?: () => ReactNode }[]>(() => {
    if (overrideBaseTabs) return [...overrideBaseTabs, ...extraTabs];
    return [...BASE_TABS.map((t) => ({ key: t.key, label: t.label })), ...extraTabs];
  }, [overrideBaseTabs, extraTabs]);

  const [activeTab, setActiveTab] = useState<string>(initialTab ?? tabs[0]?.key ?? 'info');

  // Auto-switch to connections tab when OFD flow targets this equipment (only valid for generic 4-tab variant)
  useEffect(() => {
    if (!overrideBaseTabs && ofdPhase === 'selectingPort' && ofdFlowOfdId === equipmentId) {
      setActiveTab('connections');
    }
  }, [overrideBaseTabs, ofdPhase, ofdFlowOfdId, equipmentId]);

  return (
    <div className="flex flex-col h-full">
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
          <div className="p-4 text-center text-sm text-red-500">데이터를 불러올 수 없습니다.</div>
        ) : equipment ? (
          <>
            {/* extraTabs render their own content */}
            {tabs
              .filter((t) => 'render' in t && t.render)
              .map((t) =>
                activeTab === t.key ? <div key={t.key}>{t.render!()}</div> : null,
              )}

            {/* base 4 tabs (only when overrideBaseTabs is not set) */}
            {!overrideBaseTabs && activeTab === 'photos' && (
              snapshotActive ? (
                <SnapshotPhotosTab equipmentId={equipmentId} />
              ) : (
                <PhotosTab equipment={equipment} readOnly={false} />
              )
            )}
            {!overrideBaseTabs && activeTab === 'info' && (
              <InfoTab equipment={equipment} readOnly={snapshotActive} />
            )}
            {!overrideBaseTabs && activeTab === 'logs' && (
              snapshotActive ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                  이 버전의 점검/고장 이력은 포함되어 있지 않습니다
                </div>
              ) : (
                <LogsTab equipmentId={equipmentId} readOnly={false} />
              )
            )}
            {!overrideBaseTabs && activeTab === 'connections' && (
              <ConnectionsTab equipmentId={equipmentId} floorId={floorId} />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

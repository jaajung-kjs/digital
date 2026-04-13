import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { compressImage } from '../../../utils/imageCompression';
import { generateTempId, isTempId } from '../../../utils/idHelpers';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useOfdConnectionFlowStore } from '../../fiber/stores/ofdConnectionFlowStore';
import { useEquipmentPhotos } from '../../equipment/hooks/useEquipmentPhotos';
import { useMaintenanceLogs } from '../../equipment/hooks/useMaintenanceLogs';
import { ConnectionDiagram } from '../../equipment/components/ConnectionDiagram';
import { FiberPathManager } from '../../fiber/components/FiberPathManager';
import { RackView } from './RackView';
import { MaterialPicker } from '../../materials/components/MaterialPicker';
import { useRecentMaterialsStore } from '../../materials/stores/recentMaterialsStore';
import { getEquipmentCategoryFromMaterial } from '../../../types/material';
import {
  LOG_TYPE_LABELS,
  LOG_TYPE_COLORS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from '../../equipment/types/equipment';

interface EquipmentDetailPanelProps {
  equipmentId: string;
  roomId: string;
}

interface EquipmentDetail {
  id: string;
  name: string;
  category: string;
  model?: string | null;
  manufacturer?: string | null;
  manager?: string | null;
  description?: string | null;
  installDate?: string | null;
  width2d?: number | null;
  height2d?: number | null;
  frontImageUrl?: string | null;
  rearImageUrl?: string | null;
  materialCategoryId?: string | null;
  materialCategoryCode?: string | null;
  materialCategoryName?: string | null;
  displayColor?: string | null;
  specification?: string | null;
  specParams?: Record<string, unknown> | null;
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
      category: snapEq.category || 'NETWORK',
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
    category: localEq.category || 'NETWORK',
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

export function EquipmentDetailPanel({ equipmentId, roomId }: EquipmentDetailPanelProps) {
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
              {localEq?.materialCategoryName ?? localEq?.materialCategoryCode ?? equipment.category}
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
              <ConnectionsTab equipmentId={equipmentId} roomId={roomId} category={equipment.category} />
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



/* ================================================================
   Snapshot Rack View — read-only internal equipment from snapshot
   ================================================================ */

function SnapshotRackView({ equipmentId }: { equipmentId: string }) {
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const setDetailPanelEquipmentId = useEditorStore((s) => s.setDetailPanelEquipmentId);

  const internalEquipment = useMemo(
    () => snapshotEquipment.filter((e) => e.parentEquipmentId === equipmentId),
    [snapshotEquipment, equipmentId]
  );

  if (internalEquipment.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        내부 설비 없음
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {internalEquipment.map((eq) => (
        <div
          key={eq.id}
          onClick={() => setDetailPanelEquipmentId(eq.id)}
          className="border border-gray-200 rounded px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors"
        >
          <p className="text-sm font-medium text-gray-700 truncate">{eq.name}</p>
          {eq.materialCategoryCode && (
            <p className="text-xs text-gray-400">{eq.materialCategoryCode}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   Photo Lightbox Viewer
   ================================================================ */

interface LightboxPhoto {
  id?: string;
  url: string;
  date: string;
  description?: string | null;
}

function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
  onDelete,
}: {
  photos: LightboxPhoto[];
  initialIndex: number;
  onClose: () => void;
  onDelete?: (photoId: string) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  const photo = photos[index];
  if (!photo) return null;

  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const resetView = () => { setScale(1); setTranslate({ x: 0, y: 0 }); };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((s) => Math.min(Math.max(s + delta, 0.5), 5));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (scale <= 1) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [scale, translate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setTranslate({
      x: translateStart.current.x + e.clientX - dragStart.current.x,
      y: translateStart.current.y + e.clientY - dragStart.current.y,
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const goTo = (newIndex: number) => {
    setIndex(newIndex);
    resetView();
  };

  const handleDelete = () => {
    if (!photo.id || !onDelete) return;
    if (!confirm('이 사진을 삭제하시겠습니까?')) return;
    onDelete(photo.id);
    if (photos.length <= 1) {
      onClose();
    } else if (index >= photos.length - 1) {
      setIndex(index - 1);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm">{index + 1} / {photos.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setScale((s) => Math.min(s + 0.5, 5))} className="p-1.5 hover:bg-white/20 rounded" title="확대">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
          <button onClick={() => setScale((s) => Math.max(s - 0.5, 0.5))} className="p-1.5 hover:bg-white/20 rounded" title="축소">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          {scale !== 1 && (
            <button onClick={resetView} className="px-2 py-1 text-xs hover:bg-white/20 rounded">
              {Math.round(scale * 100)}%
            </button>
          )}
          {photo.id && photo.id.startsWith('pending-') && onDelete && (
            <button onClick={handleDelete} className="p-1.5 hover:bg-red-500/50 rounded" title="사진 삭제">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded" title="닫기">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
        {hasPrev && (
          <button
            onClick={() => goTo(index - 1)}
            className="absolute left-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => goTo(index + 1)}
            className="absolute right-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        <img
          src={photo.url}
          alt={photo.description || '사진'}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            cursor: scale > 1 ? 'grab' : 'default',
            transition: isDragging.current ? 'none' : 'transform 0.15s ease',
          }}
          draggable={false}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      <div className="shrink-0 px-4 py-3 text-white text-center">
        <p className="text-sm">{photo.date}</p>
        {photo.description && (
          <p className="text-sm text-white/70 mt-0.5">{photo.description}</p>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ================================================================
   Upload Description Dialog
   ================================================================ */

function UploadDialog({
  fileName,
  side,
  onConfirm,
  onCancel,
  isPending,
}: {
  fileName: string;
  side: 'front' | 'rear';
  onConfirm: (description: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [desc, setDesc] = useState('');

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          {side === 'front' ? '전면' : '후면'} 사진 업로드
        </h4>
        <p className="text-xs text-gray-500 mb-3 truncate">{fileName}</p>
        <input
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(desc); }}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
          placeholder="사진 설명 (예: UPS 교체 후)"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(desc)}
            disabled={isPending}
            className="flex-1 text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? '업로드 중...' : '업로드'}
          </button>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="text-sm px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Snapshot Photos Tab — read-only display of photos from snapshot data
   ================================================================ */

function SnapshotPhotosTab({ equipmentId }: { equipmentId: string }) {
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const [photoSide, setPhotoSide] = useState<'front' | 'rear'>('front');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const snapEq = snapshotEquipment.find((e) => e.id === equipmentId);
  const allPhotos = (snapEq?.photos ?? []).filter((p) => p.side === photoSide);
  const latestPhoto = allPhotos.length > 0 ? allPhotos[0] : null;

  return (
    <div className="p-4">
      {/* Side toggle */}
      <div className="mb-4 flex gap-2">
        {(['front', 'rear'] as const).map((side) => (
          <button
            key={side}
            onClick={() => setPhotoSide(side)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              photoSide === side
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {side === 'front' ? '전면' : '후면'}
          </button>
        ))}
      </div>

      {/* Main photo */}
      {latestPhoto ? (
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200">
          <img
            src={latestPhoto.imageUrl}
            alt={`${photoSide === 'front' ? '전면' : '후면'} 사진`}
            className="w-full cursor-pointer object-contain"
            style={{ maxHeight: '240px' }}
            onClick={() => setLightboxIndex(0)}
          />
        </div>
      ) : (
        <div className="mb-4 flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400">
          {photoSide === 'front' ? '전면' : '후면'} 사진 없음
        </div>
      )}

      {/* Gallery */}
      {allPhotos.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {allPhotos.map((photo, idx) => (
            <div
              key={photo.id}
              className="cursor-pointer overflow-hidden rounded border border-gray-200 hover:border-blue-400"
              onClick={() => setLightboxIndex(idx)}
            >
              <img src={photo.imageUrl} alt="" className="h-16 w-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && allPhotos[lightboxIndex] && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxIndex(null)}
        >
          <img
            src={allPhotos[lightboxIndex].imageUrl}
            alt="확대 사진"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute right-6 top-6 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ================================================================
   Photos Tab
   ================================================================ */

function PhotosTab({ equipment, readOnly }: { equipment: EquipmentDetail; readOnly?: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoSide, setPhotoSide] = useState<'front' | 'rear'>('front');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const pendingUploads = useEditorStore((s) => s.pendingUploads);
  const addPendingUpload = useEditorStore((s) => s.addPendingUpload);
  const removePendingUpload = useEditorStore((s) => s.removePendingUpload);

  const { data: savedPhotos } = useEquipmentPhotos(equipment.id);

  const allPhotos: LightboxPhoto[] = useMemo(() => {
    const uploads = pendingUploads
      .filter((u) => u.equipmentId === equipment.id && u.side === photoSide);

    const saved = (savedPhotos ?? [])
      .filter((p) => p.side === photoSide);

    return [
      ...uploads.map((u) => ({
        id: `pending-${u.id}`,
        url: u.objectUrl,
        date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
        description: u.description || null,
      })),
      ...saved.map((p) => ({
        id: p.id,
        url: p.imageUrl,
        date: new Date(p.takenAt || p.createdAt).toLocaleDateString('ko-KR', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
        description: p.description,
      })),
    ];
  }, [pendingUploads, savedPhotos, equipment.id, photoSide]);

  const latestPhoto = allPhotos.length > 0 ? allPhotos[0] : null;
  const currentImageUrl = latestPhoto?.url ?? null;

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    e.target.value = '';
  };

  const handleConfirmUpload = async (description: string) => {
    if (!pendingFile) return;
    const compressed = await compressImage(pendingFile);
    const objectUrl = URL.createObjectURL(compressed);
    addPendingUpload({
      id: generateTempId(),
      equipmentId: equipment.id,
      side: photoSide,
      file: compressed,
      description,
      objectUrl,
    });
    setPendingFile(null);
  };

  const handleDeletePhoto = (photoId: string) => {
    if (photoId.startsWith('pending-')) {
      const uploadId = photoId.replace('pending-', '');
      removePendingUpload(uploadId);
    }
    // Note: server-side photo deletion is not supported in local-only mode.
    // Photos can only be deleted after save via the backend API.
  };

  const handleDeleteCurrent = () => {
    if (!latestPhoto?.id) return;
    if (confirm(`${photoSide === 'front' ? '전면' : '후면'} 현재 사진을 삭제하시겠습니까?`)) {
      handleDeletePhoto(latestPhoto.id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {pendingFile && (
        <UploadDialog
          fileName={pendingFile.name}
          side={photoSide}
          onConfirm={handleConfirmUpload}
          onCancel={() => setPendingFile(null)}
          isPending={false}
        />
      )}

      {lightboxIndex !== null && allPhotos.length > 0 && (
        <PhotoLightbox
          photos={allPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={readOnly ? undefined : handleDeletePhoto}
        />
      )}

      <div className="relative bg-gray-900 flex-1 flex items-center justify-center min-h-0">
        <div className="absolute top-2 left-2 z-10 flex rounded-md overflow-hidden border border-white/30 shadow-sm">
          <button
            onClick={() => setPhotoSide('front')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              photoSide === 'front' ? 'bg-blue-600 text-white' : 'bg-black/50 text-white/80 hover:bg-black/70'
            }`}
          >
            전면
          </button>
          <button
            onClick={() => setPhotoSide('rear')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              photoSide === 'rear' ? 'bg-blue-600 text-white' : 'bg-black/50 text-white/80 hover:bg-black/70'
            }`}
          >
            후면
          </button>
        </div>

        {!readOnly && (
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <button
              onClick={handleUploadClick}
              className="p-1.5 bg-black/50 rounded-md text-white/80 hover:bg-black/70 hover:text-white transition-colors shadow-sm"
              title={currentImageUrl ? '사진 변경' : '사진 업로드'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            {currentImageUrl && (
              <button
                onClick={handleDeleteCurrent}
                className="p-1.5 bg-black/50 rounded-md text-white/80 hover:bg-black/70 hover:text-red-400 transition-colors shadow-sm"
                title="사진 삭제"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}

        {allPhotos.length > 1 && (
          <div className="absolute bottom-2 left-2 z-10">
            <span className="px-2 py-1 bg-black/50 rounded text-[10px] text-white/80">
              이력 {allPhotos.length}장 - 클릭하여 탐색
            </span>
          </div>
        )}

        {latestPhoto && (
          <div className="absolute bottom-2 right-2 z-10 text-right">
            <span className="px-2 py-1 bg-black/50 rounded text-[10px] text-white/80">
              {latestPhoto.date}
              {latestPhoto.description && ` · ${latestPhoto.description}`}
            </span>
          </div>
        )}

        {currentImageUrl ? (
          <img
            src={currentImageUrl}
            alt={photoSide === 'front' ? '전면' : '후면'}
            className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setLightboxIndex(0)}
          />
        ) : readOnly ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
            <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">{photoSide === 'front' ? '전면' : '후면'} 사진 없음</span>
          </div>
        ) : (
          <button
            onClick={handleUploadClick}
            className="w-full h-full flex flex-col items-center justify-center text-gray-500 hover:text-blue-400 transition-colors"
          >
            <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">{photoSide === 'front' ? '전면' : '후면'} 사진 추가</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Info Tab
   ================================================================ */

function InfoTab({ equipment, readOnly }: { equipment: EquipmentDetail; readOnly?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing && !readOnly) {
    return <EditForm equipment={equipment} onClose={() => setIsEditing(false)} />;
  }

  const widthCm = equipment.width2d != null ? Math.round(equipment.width2d) : '-';
  const heightCm = equipment.height2d != null ? Math.round(equipment.height2d) : '-';

  const fields: { label: string; value: string }[] = [
    { label: '이름', value: equipment.name },
    { label: '분류', value: equipment.specification
      ? equipment.specification
      : (equipment.materialCategoryName ?? equipment.materialCategoryCode ?? equipment.category) },
    { label: '모델', value: equipment.model || '-' },
    { label: '제조사', value: equipment.manufacturer || '-' },
    { label: '담당자', value: equipment.manager || '-' },
    { label: '설치일', value: equipment.installDate ? new Date(equipment.installDate).toLocaleDateString('ko-KR') : '-' },
    { label: '크기 (px)', value: `${widthCm} x ${heightCm}` },
    { label: '설명', value: equipment.description || '-' },
  ];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold text-gray-800">설비 정보</span>
        {!readOnly && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            수정
          </button>
        )}
      </div>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.label}>
            <span className="block text-xs text-gray-400 mb-0.5">{f.label}</span>
            <span className="text-sm text-gray-900">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- Edit Form --- */

function EditForm({ equipment, onClose }: { equipment: EquipmentDetail; onClose: () => void }) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const setLocalEquipment = useEditorStore((s) => s.setLocalEquipment);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);
  const recentEquipment = useRecentMaterialsStore((s) => s.recentEquipment);
  const addRecent = useRecentMaterialsStore((s) => s.addRecent);

  const [editName, setEditName] = useState(equipment.name);
  const [editMaterialCategoryId, setEditMaterialCategoryId] = useState(equipment.materialCategoryId ?? null);
  const [editMaterialCategoryCode, setEditMaterialCategoryCode] = useState(equipment.materialCategoryCode ?? null);
  const [editMaterialCategoryName, setEditMaterialCategoryName] = useState(equipment.materialCategoryName ?? null);
  const [editDisplayColor, setEditDisplayColor] = useState(equipment.displayColor ?? null);
  const [editSpecification, setEditSpecification] = useState(equipment.specification ?? null);
  const [editSpecParams, setEditSpecParams] = useState<Record<string, unknown>>(equipment.specParams as Record<string, unknown> ?? {});
  const [editModel, setEditModel] = useState(equipment.model ?? '');
  const [editManufacturer, setEditManufacturer] = useState(equipment.manufacturer ?? '');
  const [editManager, setEditManager] = useState(equipment.manager ?? '');
  const [editDescription, setEditDescription] = useState(equipment.description ?? '');

  const handleApply = () => {
    const category = editMaterialCategoryCode
      ? getEquipmentCategoryFromMaterial(editMaterialCategoryCode)
      : equipment.category;
    const updated = localEquipment.map((eq) =>
      eq.id === equipment.id
        ? {
            ...eq,
            name: editName,
            category,
            materialCategoryId: editMaterialCategoryId,
            materialCategoryCode: editMaterialCategoryCode,
            materialCategoryName: editMaterialCategoryName,
            displayColor: editDisplayColor,
            specification: editSpecification,
            specParams: editSpecParams,
            description: editDescription || null,
            model: editModel || null,
            manufacturer: editManufacturer || null,
            manager: editManager || null,
          }
        : eq
    );
    setLocalEquipment(updated);
    setHasChanges(true);

    // C1: Track recent material usage after edit
    if (editMaterialCategoryId && editMaterialCategoryCode && editSpecification) {
      addRecent('equipment', {
        categoryId: editMaterialCategoryId,
        categoryCode: editMaterialCategoryCode,
        categoryName: editMaterialCategoryName ?? editSpecification,
        specParams: editSpecParams,
        specification: editSpecification,
      });
    }

    onClose();
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">이름 *</label>
        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">자재 분류</label>
        <MaterialPicker
          categoryType="EQUIPMENT"
          value={editMaterialCategoryId ? { categoryId: editMaterialCategoryId, specParams: editSpecParams } : null}
          onChange={({ categoryId, categoryCode, categoryName, displayColor, specParams, specification }) => {
            setEditMaterialCategoryId(categoryId);
            setEditMaterialCategoryCode(categoryCode);
            setEditMaterialCategoryName(categoryName);
            setEditDisplayColor(displayColor);
            setEditSpecification(specification);
            setEditSpecParams(specParams);
          }}
          recentItems={recentEquipment}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">모델</label>
        <input type="text" value={editModel} onChange={(e) => setEditModel(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400" placeholder="선택 사항" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">제조사</label>
        <input type="text" value={editManufacturer} onChange={(e) => setEditManufacturer(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400" placeholder="선택 사항" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">담당자</label>
        <input type="text" value={editManager} onChange={(e) => setEditManager(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400" placeholder="선택 사항" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">설명</label>
        <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 resize-none" rows={3} placeholder="선택 사항" />
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={handleApply} disabled={!editName.trim()}
          className="flex-1 text-sm px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          적용
        </button>
        <button onClick={onClose}
          className="flex-1 text-sm px-3 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
          취소
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   Logs Tab - with edit, author display, category colors
   ================================================================ */

function LogsTab({ equipmentId, readOnly }: { equipmentId: string; readOnly?: boolean }) {
  const isTemp = isTempId(equipmentId);
  const { data: backendLogs, isLoading } = useMaintenanceLogs(equipmentId);
  const pendingLogs = useEditorStore((s) => s.pendingLogs);
  const addPendingLog = useEditorStore((s) => s.addPendingLog);
  const updatePendingLog = useEditorStore((s) => s.updatePendingLog);
  const removePendingLog = useEditorStore((s) => s.removePendingLog);

  const [showForm, setShowForm] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    logType: 'MAINTENANCE',
    title: '',
    logDate: new Date().toISOString().slice(0, 10),
    severity: 'LOW',
    description: '',
  });

  const allLogs = useMemo(() => {
    const savedLogs = (backendLogs ?? []);

    const pending = pendingLogs
      .filter((l) => l.equipmentId === equipmentId)
      .map((l) => ({
        id: l.id,
        equipmentId: l.equipmentId,
        logType: l.logType as 'MAINTENANCE' | 'FAILURE' | 'REPAIR',
        title: l.title,
        description: l.description,
        logDate: l.logDate,
        severity: l.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
        status: (l.status ?? 'OPEN') as 'OPEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByName: null as string | null,
        updatedByName: null as string | null,
      }));

    return [...pending, ...savedLogs].sort((a, b) => {
      const dateA = a.logDate || a.createdAt;
      const dateB = b.logDate || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [backendLogs, pendingLogs, equipmentId]);

  const resetForm = () => {
    setFormData({ logType: 'MAINTENANCE', title: '', logDate: new Date().toISOString().slice(0, 10), severity: 'LOW', description: '' });
    setEditingLogId(null);
    setShowForm(false);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) return;

    const common = {
      logType: formData.logType,
      title: formData.title,
      logDate: formData.logDate || undefined,
      severity: formData.severity,
      description: formData.description || undefined,
    };

    if (editingLogId) {
      // Check if it's a pending log (editable)
      const isPending = pendingLogs.some((l) => l.id === editingLogId);
      if (isPending) {
        updatePendingLog(editingLogId, common);
      }
      // Backend logs cannot be edited in local-only mode
    } else {
      addPendingLog({ id: generateTempId(), equipmentId, ...common });
    }
    resetForm();
  };

  const handleEditLog = (log: typeof allLogs[0]) => {
    // Now we CAN edit pending logs too
    setFormData({
      logType: log.logType,
      title: log.title,
      logDate: log.logDate ? new Date(log.logDate).toISOString().slice(0, 10) : '',
      severity: log.severity ?? 'LOW',
      description: log.description ?? '',
    });
    setEditingLogId(log.id);
    setShowForm(true);
  };

  const handleDeleteLog = (logId: string) => {
    if (!confirm('이 이력을 삭제하시겠습니까?')) return;
    const isPending = pendingLogs.some((l) => l.id === logId);
    if (isPending) {
      removePendingLog(logId);
    }
    // Backend logs cannot be deleted in local-only mode
  };

  if (!isTemp && isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      {!readOnly && (
        <div className="px-4 pt-3">
          <button
            onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showForm ? '취소' : '+ 새 이력 추가'}
          </button>
        </div>
      )}

      {showForm && !readOnly && (
        <div className="mx-4 mt-2 p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2.5">
          <div className="flex gap-2">
            <select
              value={formData.logType}
              onChange={(e) => setFormData((p) => ({ ...p, logType: e.target.value }))}
              className="flex-1 text-sm border border-gray-300 rounded px-2.5 py-2"
            >
              {Object.entries(LOG_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select
              value={formData.severity}
              onChange={(e) => setFormData((p) => ({ ...p, severity: e.target.value }))}
              className="flex-1 text-sm border border-gray-300 rounded px-2.5 py-2"
            >
              {Object.entries(SEVERITY_COLORS).map(([key]) => (
                <option key={key} value={key}>{SEVERITY_LABELS[key] ?? key}</option>
              ))}
            </select>
          </div>
          <input
            type="text" placeholder="제목"
            value={formData.title}
            onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            className="w-full text-sm border border-gray-300 rounded px-2.5 py-2"
          />
          <input
            type="date"
            value={formData.logDate}
            onChange={(e) => setFormData((p) => ({ ...p, logDate: e.target.value }))}
            className="w-full text-sm border border-gray-300 rounded px-2.5 py-2"
          />
          <textarea
            placeholder="설명 (선택)"
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 resize-none" rows={2}
          />
          <button
            onClick={handleSubmit}
            disabled={!formData.title.trim()}
            className="w-full text-sm px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {editingLogId ? '수정 적용' : '적용'}
          </button>
        </div>
      )}

      <div className="p-4 space-y-3">
        {allLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">이력이 없습니다.</p>
        ) : (
          allLogs.map((log) => (
            <div key={log.id} className="p-3 rounded-lg border border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${LOG_TYPE_COLORS[log.logType] ?? 'bg-gray-200 text-gray-700'}`}>
                    {LOG_TYPE_LABELS[log.logType] ?? log.logType}
                  </span>
                  {log.severity && (
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[log.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                      {SEVERITY_LABELS[log.severity] ?? log.severity}
                    </span>
                  )}
                </div>
                {!readOnly && pendingLogs.some((l) => l.id === log.id) && (
                  <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => handleEditLog(log)}
                        className="p-0.5 text-gray-400 hover:text-blue-500 transition-colors"
                        title="수정"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                      title="삭제"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-gray-900">{log.title}</p>
              {log.description && <p className="text-sm text-gray-500 mt-1">{log.description}</p>}
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs text-gray-400">
                  {log.logDate
                    ? new Date(log.logDate).toLocaleDateString('ko-KR')
                    : new Date(log.createdAt).toLocaleDateString('ko-KR')}
                </p>
                {log.createdByName && (
                  <p className="text-xs text-gray-400">
                    작성: {log.createdByName}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Connections Tab - center aligned text
   ================================================================ */

function ConnectionsTab({ equipmentId, roomId, category }: { equipmentId: string; roomId: string; category?: string }) {
  const isOfd = category === 'OFD';
  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotFiberPaths = useSnapshotStore((s) => s.fiberPaths);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const ofdPhase = useOfdConnectionFlowStore((s) => s.phase);
  const ofdDirection = useOfdConnectionFlowStore((s) => s.direction);
  const ofdFlowOfdId = useOfdConnectionFlowStore((s) => s.ofdId);
  const selectPort = useOfdConnectionFlowStore((s) => s.selectPort);
  const cancelOfd = useOfdConnectionFlowStore((s) => s.cancel);
  const deleteCable = useEditorStore((s) => s.deleteCable);
  const updateCable = useEditorStore((s) => s.updateCable);
  const navigate = useNavigate();

  // Is the OFD flow active and targeting THIS equipment?
  const isFlowActive = ofdPhase === 'selectingPort' && ofdFlowOfdId === equipmentId;

  const handlePortConnect = useCallback((portNumber: number, fiberPathId: string) => {
    if (isFlowActive) {
      // OFD flow is active (either direction): delegate to state machine
      selectPort(fiberPathId, portNumber);
    } else {
      // Direct port click without active flow: start OFD-as-source
      const store = useOfdConnectionFlowStore.getState();
      store.startFromOfd(equipmentId);
      store.selectPort(fiberPathId, portNumber);
    }
  }, [isFlowActive, selectPort, equipmentId]);

  const handlePortDelete = useCallback((cableId: string) => {
    deleteCable(cableId);
  }, [deleteCable]);

  const handlePortSwitch = useCallback((cableId: string, _connectedEquipmentId: string, newFiberPathId: string, newPortNumber: number) => {
    updateCable(cableId, {
      fiberPathId: newFiberPathId,
      fiberPortNumber: newPortNumber,
    });
  }, [updateCable]);

  // In snapshot mode, show read-only fiber paths for OFD
  if (snapshotActive && isOfd) {
    const ofdPaths = snapshotFiberPaths.filter(
      (fp) => fp.ofdAId === equipmentId || fp.ofdBId === equipmentId
    );
    const equipMap = new Map(snapshotEquipment.map((e) => [e.id, e.name]));

    return (
      <div>
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">광경로 슬롯</h3>
          {ofdPaths.length === 0 ? (
            <p className="text-sm text-gray-400">등록된 광경로가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {ofdPaths.map((path) => {
                const remoteId = path.ofdAId === equipmentId ? path.ofdBId : path.ofdAId;
                const remoteName = equipMap.get(remoteId) ?? '알 수 없음';
                const localName = equipMap.get(equipmentId) ?? '알 수 없음';
                return (
                  <div key={path.id} className="rounded border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm font-medium text-gray-700">
                      {localName} - {remoteName}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {path.portCount}코어
                    </span>
                    {path.description && (
                      <p className="mt-1 text-xs text-gray-500">{path.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-4">
          <ConnectionDiagram roomId={roomId} equipmentId={equipmentId} category={category} />
        </div>
      </div>
    );
  }

  // C2: In snapshot mode, block all destructive actions
  if (snapshotActive) {
    return (
      <div>
        {isOfd && (
          <FiberPathManager
            ofdId={equipmentId}
            onNavigateRemote={(remoteRoomId) => {
              navigate(`/rooms/${remoteRoomId}/plan`);
            }}
          />
        )}
        <div className="p-4">
          <ConnectionDiagram roomId={roomId} equipmentId={equipmentId} category={category} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Banner: OFD port selection */}
      {isFlowActive && (
        <div className="mx-4 mt-3 mb-1 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">
            {ofdDirection === 'ofdAsTarget' ? '포트를 선택하여 연결을 완료하세요' : '포트를 선택하세요'}
          </p>
          <button onClick={cancelOfd} className="text-xs text-blue-500 hover:text-blue-700 font-medium">취소</button>
        </div>
      )}
      {/* Banner: waiting for target on canvas */}
      {ofdPhase === 'selectingTarget' && ofdFlowOfdId === equipmentId && (
        <div className="mx-4 mt-3 mb-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <p className="text-xs text-green-700">캔버스에서 대상 설비를 클릭하세요</p>
        </div>
      )}
      {isOfd && (
        <FiberPathManager
          ofdId={equipmentId}
          onPortConnect={handlePortConnect}
          onPortDelete={handlePortDelete}
          onPortSwitch={handlePortSwitch}
          onNavigateRemote={(remoteRoomId) => {
            const { hasChanges } = useEditorStore.getState();
            if (hasChanges) {
              if (!confirm('저장하지 않은 변경사항이 있습니다. 대국 도면으로 이동하시겠습니까?')) return;
              // localStorage 자동 백업이 동작 중이므로 별도 저장 불필요
            }
            navigate(`/rooms/${remoteRoomId}/plan`);
          }}
        />
      )}
      <div className="p-4">
        <ConnectionDiagram roomId={roomId} equipmentId={equipmentId} category={category} />
      </div>
    </div>
  );
}


/* ================================================================
   Rack Content Tab (내부 설비) — delegates to shared RackView
   ================================================================ */


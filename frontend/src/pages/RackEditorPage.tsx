import { useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';
import type { RackDetail } from '../types/rack';

// ==================== 타입 ====================

interface EquipmentPhoto {
  id: string;
  equipmentId: string;
  side: 'front' | 'rear';
  imageUrl: string;
  description: string | null;
  takenAt: string | null;
  createdAt: string;
}

interface MaintenanceLog {
  id: string;
  equipmentId: string;
  logType: 'MAINTENANCE' | 'FAILURE' | 'REPAIR' | 'INSPECTION';
  title: string;
  description: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PortInfo {
  id: string;
  name: string;
  portType: string;
  portNumber: number | null;
  label: string | null;
  speed: string | null;
  connectorType: string | null;
  description: string | null;
  isConnected: boolean;
}

// ==================== 상수 ====================

const LOG_TYPE_LABELS: Record<string, string> = {
  MAINTENANCE: '정기점검',
  FAILURE: '고장',
  REPAIR: '수리',
  INSPECTION: '점검',
};

const LOG_TYPE_COLORS: Record<string, string> = {
  MAINTENANCE: 'bg-blue-100 text-blue-700',
  FAILURE: 'bg-red-100 text-red-700',
  REPAIR: 'bg-orange-100 text-orange-700',
  INSPECTION: 'bg-green-100 text-green-700',
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

const SEVERITY_LABELS: Record<string, string> = {
  LOW: '낮음',
  MEDIUM: '보통',
  HIGH: '높음',
  CRITICAL: '심각',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: '미처리',
  IN_PROGRESS: '처리중',
  RESOLVED: '해결',
  CLOSED: '종료',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'text-red-600',
  IN_PROGRESS: 'text-yellow-600',
  RESOLVED: 'text-green-600',
  CLOSED: 'text-gray-500',
};

const PORT_TYPE_COLORS: Record<string, string> = {
  AC: 'bg-red-100 text-red-700',
  DC: 'bg-orange-100 text-orange-700',
  LAN: 'bg-blue-100 text-blue-700',
  FIBER: 'bg-green-100 text-green-700',
  CONSOLE: 'bg-purple-100 text-purple-700',
  USB: 'bg-teal-100 text-teal-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

type SidebarTab = 'info' | 'logs' | 'photos' | 'connections';

// ==================== API ====================

const fetchRackDetail = async (rackId: string): Promise<RackDetail> => {
  const response = await api.get(`/racks/${rackId}`);
  return response.data.data;
};

const fetchMaintenanceLogs = async (equipmentId: string): Promise<MaintenanceLog[]> => {
  const response = await api.get(`/equipment/${equipmentId}/maintenance-logs`);
  return response.data.data;
};

const fetchEquipmentPhotos = async (equipmentId: string): Promise<EquipmentPhoto[]> => {
  const response = await api.get(`/equipment/${equipmentId}/photos`);
  return response.data.data;
};

const fetchPorts = async (equipmentId: string): Promise<PortInfo[]> => {
  const response = await api.get(`/equipment/${equipmentId}/ports`);
  return response.data.data;
};

// ==================== 유틸 ====================

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

async function compressImage(file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context not available')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            } else { reject(new Error('Blob creation failed')); }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

// ==================== 컴포넌트 ====================

export function RackEditorPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<'front' | 'rear'>('front');
  const [error, setError] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<'front' | 'rear'>('front');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>('info');
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({
    logType: 'INSPECTION' as string,
    title: '',
    severity: '' as string,
    description: '',
  });

  // ==================== 데이터 조회 ====================

  const { data: rack, isLoading: isLoadingRack } = useQuery({
    queryKey: ['rack', rackId],
    queryFn: () => fetchRackDetail(rackId!),
    enabled: !!rackId,
  });

  const { data: maintenanceLogs } = useQuery({
    queryKey: ['maintenance-logs', rackId],
    queryFn: () => fetchMaintenanceLogs(rackId!),
    enabled: !!rackId && (activeTab === 'logs' || activeTab === 'info'),
  });

  const { data: equipmentPhotos } = useQuery({
    queryKey: ['equipment-photos', rackId],
    queryFn: () => fetchEquipmentPhotos(rackId!),
    enabled: !!rackId && activeTab === 'photos',
  });

  const { data: ports } = useQuery({
    queryKey: ['ports', rackId],
    queryFn: () => fetchPorts(rackId!),
    enabled: !!rackId && activeTab === 'connections',
  });

  const lastInspection = useMemo(() => {
    if (!maintenanceLogs) return null;
    const inspections = maintenanceLogs
      .filter(l => l.logType === 'INSPECTION')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return inspections[0] ?? null;
  }, [maintenanceLogs]);

  // ==================== Mutations ====================

  const uploadImageMutation = useMutation({
    mutationFn: async ({ type, file }: { type: 'front' | 'rear'; file: File }) => {
      const compressedFile = await compressImage(file, 1200, 0.8);
      const formData = new FormData();
      formData.append('type', type);
      formData.append('file', compressedFile);
      return api.post(`/racks/${rackId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rack', rackId] });
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteImageMutation = useMutation({
    mutationFn: (type: 'front' | 'rear') => api.delete(`/racks/${rackId}/images/${type}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rack', rackId] }),
    onError: (err) => setError(getErrorMessage(err)),
  });

  const createLogMutation = useMutation({
    mutationFn: (data: { logType: string; title: string; severity?: string; description?: string }) =>
      api.post(`/equipment/${rackId}/maintenance-logs`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-logs', rackId] });
      setShowLogForm(false);
      setLogForm({ logType: 'INSPECTION', title: '', severity: '', description: '' });
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteLogMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance-logs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance-logs', rackId] }),
    onError: (err) => setError(getErrorMessage(err)),
  });

  // ==================== 핸들러 ====================

  const handleImageUpload = (type: 'front' | 'rear') => {
    setUploadType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImageMutation.mutate({ type: uploadType, file });
    e.target.value = '';
  };

  const handleSubmitLog = () => {
    if (!logForm.title.trim()) return;
    createLogMutation.mutate({
      logType: logForm.logType,
      title: logForm.title,
      ...(logForm.severity && { severity: logForm.severity }),
      ...(logForm.description && { description: logForm.description }),
    });
  };

  // ==================== 로딩/에러 ====================

  if (isLoadingRack) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!rack) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-gray-500 mb-4">설비를 찾을 수 없습니다.</p>
        <button onClick={() => navigate(-1)} className="text-blue-600 hover:text-blue-700">돌아가기</button>
      </div>
    );
  }

  const currentImageUrl = viewMode === 'front' ? rack.frontImageUrl : rack.rearImageUrl;

  // ==================== 탭 렌더 ====================

  const TABS: { key: SidebarTab; label: string; icon: JSX.Element }[] = [
    {
      key: 'info', label: '기본',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      key: 'logs', label: '이력',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
    },
    {
      key: 'photos', label: '사진',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    },
    {
      key: 'connections', label: '연결',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
    },
  ];

  const renderInfoTab = () => (
    <div className="p-4 space-y-3 text-sm">
      <div className="flex justify-between">
        <span className="text-gray-500">이름</span>
        <span className="text-gray-900 font-medium">{rack.name}</span>
      </div>
      {rack.code && (
        <div className="flex justify-between">
          <span className="text-gray-500">코드</span>
          <span className="text-gray-900">{rack.code}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-gray-500">사진 수정일</span>
        <span className="text-gray-900">{formatShortDate(rack.updatedAt)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">마지막 점검일</span>
        <span className={lastInspection ? 'text-gray-900' : 'text-gray-400'}>
          {lastInspection ? formatDate(lastInspection.createdAt) : '기록 없음'}
        </span>
      </div>
      {rack.description && (
        <div className="pt-3 border-t">
          <span className="text-gray-500 block mb-1">설명</span>
          <p className="text-gray-900 whitespace-pre-wrap">{rack.description}</p>
        </div>
      )}
    </div>
  );

  const renderLogsTab = () => (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">점검/고장 이력</span>
        <button
          onClick={() => setShowLogForm(!showLogForm)}
          className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {showLogForm ? '취소' : '+ 등록'}
        </button>
      </div>

      {showLogForm && (
        <div className="p-3 border-b bg-gray-50 space-y-2">
          <select
            value={logForm.logType}
            onChange={e => setLogForm(f => ({ ...f, logType: e.target.value }))}
            className="w-full text-sm border rounded px-2 py-1.5"
          >
            {Object.entries(LOG_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="제목"
            value={logForm.title}
            onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))}
            className="w-full text-sm border rounded px-2 py-1.5"
          />
          <select
            value={logForm.severity}
            onChange={e => setLogForm(f => ({ ...f, severity: e.target.value }))}
            className="w-full text-sm border rounded px-2 py-1.5"
          >
            <option value="">심각도 (선택)</option>
            {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <textarea
            placeholder="설명 (선택)"
            value={logForm.description}
            onChange={e => setLogForm(f => ({ ...f, description: e.target.value }))}
            className="w-full text-sm border rounded px-2 py-1.5 h-16 resize-none"
          />
          <button
            onClick={handleSubmitLog}
            disabled={!logForm.title.trim() || createLogMutation.isPending}
            className="w-full text-sm py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {createLogMutation.isPending ? '등록 중...' : '등록'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!maintenanceLogs || maintenanceLogs.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">이력이 없습니다.</div>
        ) : (
          <ul className="divide-y">
            {maintenanceLogs.map(log => (
              <li key={log.id} className="p-3 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${LOG_TYPE_COLORS[log.logType] || 'bg-gray-100 text-gray-600'}`}>
                        {LOG_TYPE_LABELS[log.logType] || log.logType}
                      </span>
                      {log.severity && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${SEVERITY_COLORS[log.severity] || ''}`}>
                          {SEVERITY_LABELS[log.severity] || log.severity}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 truncate">{log.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs ${STATUS_COLORS[log.status] || 'text-gray-500'}`}>
                        {STATUS_LABELS[log.status] || log.status}
                      </span>
                      <span className="text-xs text-gray-400">{formatShortDate(log.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { if (confirm('이 이력을 삭제하시겠습니까?')) deleteLogMutation.mutate(log.id); }}
                    className="p-1 text-gray-400 hover:text-red-500 shrink-0"
                    title="삭제"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const renderPhotosTab = () => {
    const frontPhotos = equipmentPhotos?.filter(p => p.side === 'front') ?? [];
    const rearPhotos = equipmentPhotos?.filter(p => p.side === 'rear') ?? [];

    const renderPhotoGroup = (label: string, photos: EquipmentPhoto[]) => (
      <div className="mb-4">
        <h4 className="text-xs font-medium text-gray-500 px-3 mb-2">{label}</h4>
        {photos.length === 0 ? (
          <p className="text-xs text-gray-400 px-3">사진 없음</p>
        ) : (
          <div className="space-y-2 px-3">
            {photos.map(photo => (
              <div
                key={photo.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                onClick={() => setFullscreenImage(photo.imageUrl)}
              >
                <img
                  src={photo.imageUrl}
                  alt={photo.description || '설비 사진'}
                  className="w-14 h-14 object-cover rounded border"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{photo.description || '설명 없음'}</p>
                  <p className="text-xs text-gray-400">{formatDate(photo.takenAt || photo.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <div className="py-3 overflow-y-auto">
        <p className="text-xs text-gray-500 px-3 mb-3">과거 업로드된 사진 이력</p>
        {!equipmentPhotos ? (
          <div className="p-4 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : equipmentPhotos.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">사진 이력이 없습니다.</div>
        ) : (
          <>
            {renderPhotoGroup('정면', frontPhotos)}
            {renderPhotoGroup('후면', rearPhotos)}
          </>
        )}
      </div>
    );
  };

  const renderConnectionsTab = () => (
    <div className="py-3">
      <p className="text-xs text-gray-500 px-3 mb-3">포트 및 연결 정보</p>
      {!ports ? (
        <div className="p-4 text-center text-sm text-gray-400">불러오는 중...</div>
      ) : ports.length === 0 ? (
        <div className="p-4 text-center text-sm text-gray-400">등록된 포트가 없습니다.</div>
      ) : (
        <ul className="divide-y mx-3">
          {ports.map(port => (
            <li key={port.id} className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PORT_TYPE_COLORS[port.portType] || PORT_TYPE_COLORS.OTHER}`}>
                  {port.portType}
                </span>
                <span className="text-sm text-gray-900 truncate">{port.name}</span>
                {port.label && <span className="text-xs text-gray-400 truncate">({port.label})</span>}
              </div>
              <span className={`text-xs shrink-0 ${port.isConnected ? 'text-green-600' : 'text-gray-400'}`}>
                {port.isConnected ? '연결됨' : '미연결'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // ==================== 렌더 ====================

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="돌아가기">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              {rack.name} {rack.code && <span className="text-gray-500 font-normal">({rack.code})</span>}
            </h1>
            <p className="text-xs text-gray-500">수정: {formatShortDate(rack.updatedAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode('front')}
              className={`px-3 py-1 text-sm ${viewMode === 'front' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              정면
            </button>
            <button
              onClick={() => setViewMode('rear')}
              className={`px-3 py-1 text-sm ${viewMode === 'rear' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              후면
            </button>
          </div>
        </div>
      </header>

      {/* 에러 */}
      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* 메인 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 사진 영역 */}
        <div className="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center p-4">
          <div
            className="relative group bg-gray-200 flex items-center justify-center overflow-hidden cursor-pointer w-full h-full max-w-3xl rounded-xl shadow-lg"
            onClick={() => { if (currentImageUrl) setFullscreenImage(currentImageUrl); }}
          >
            {currentImageUrl ? (
              <img src={currentImageUrl} alt={viewMode === 'front' ? '정면 사진' : '후면 사진'} className="w-full h-full object-contain" />
            ) : (
              <div className="flex flex-col items-center text-gray-400">
                <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">{viewMode === 'front' ? '정면' : '후면'} 사진 없음</span>
              </div>
            )}
            {/* 호버 오버레이 */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleImageUpload(viewMode); }}
                className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100"
                title="업로드"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>
              {currentImageUrl && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFullscreenImage(currentImageUrl); }}
                    className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100"
                    title="전체화면"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`${viewMode === 'front' ? '정면' : '후면'} 사진을 삭제하시겠습니까?`)) {
                        deleteImageMutation.mutate(viewMode);
                      }
                    }}
                    className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50"
                    title="삭제"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              )}
            </div>
            {uploadImageMutation.isPending && (
              <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-blue-600">업로드 중...</p>
            )}
            {currentImageUrl && (
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                수정: {formatShortDate(rack.updatedAt)}
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
        </div>

        {/* 사이드 패널 */}
        <aside className="w-80 bg-white overflow-hidden flex flex-col border-l">
          {/* 탭 네비게이션 */}
          <div className="flex border-b shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* 탭 내용 */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'info' && renderInfoTab()}
            {activeTab === 'logs' && renderLogsTab()}
            {activeTab === 'photos' && renderPhotosTab()}
            {activeTab === 'connections' && renderConnectionsTab()}
          </div>
        </aside>
      </div>

      {/* 전체화면 이미지 뷰어 */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={fullscreenImage}
            alt="전체화면"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

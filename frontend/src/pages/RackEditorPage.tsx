import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';
import type {
  RackDetail,
  Equipment,
  CreateEquipmentRequest,
  UpdateEquipmentRequest,
} from '../types/rack';
import { getCategoryColor } from '../types/rack';
import { EquipmentModal } from '../components/EquipmentModal';
import { EquipmentDetailModal } from '../components/EquipmentDetailModal';

// ==================== API 호출 함수 ====================

const fetchRackDetail = async (rackId: string): Promise<RackDetail> => {
  const response = await api.get(`/racks/${rackId}`);
  return response.data.data;
};

const fetchEquipmentList = async (rackId: string): Promise<Equipment[]> => {
  const response = await api.get(`/racks/${rackId}/equipment`);
  return response.data.data;
};

// 날짜 포맷팅 (짧은 형식)
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

// 이미지 압축 함수
async function compressImage(file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 가로 기준으로 리사이즈
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              reject(new Error('Blob creation failed'));
            }
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

// 드래그 모드 타입 (이동만 지원)
type DragMode = 'none' | 'move';

// ==================== 컴포넌트 ====================

export function RackEditorPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 상태
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'front' | 'rear'>('front');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<'front' | 'rear'>('front');

  // 전체화면 이미지 뷰어
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // 드래그 상태
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStartY, setDragStartY] = useState(0);
  const [dragEquipmentId, setDragEquipmentId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ startU: number; heightU: number } | null>(null);

  // 설비 추가를 위한 클릭 위치 상태
  const [clickedStartU, setClickedStartU] = useState<number | null>(null);

  // 호버 상태
  const [hoveredU, setHoveredU] = useState<number | null>(null);

  // 캔버스 설정 - 기본값 (동적 계산에서 사용)
  const baseUHeight = 54; // 기본 픽셀 per U
  const padding = 24; // 패딩

  // 컨테이너 크기에 맞춰 랙 크기 동적 계산
  const getRackDimensions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return { rackWidth: 240, uHeight: baseUHeight };

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // 랙 너비: 컨테이너의 60% (최소 200px, 최대 400px)
    const rackWidth = Math.min(400, Math.max(200, containerWidth * 0.7));

    // U 높이: 컨테이너 높이에 맞춰 동적 계산 (여백 60px 고려)
    // 12U 기준으로 컨테이너에 맞게 조절
    const availableHeight = containerHeight - padding * 2 - 60;
    const uHeight = Math.min(baseUHeight, Math.max(20, availableHeight / 12));

    return { rackWidth, uHeight };
  }, []);

  // 데이터 조회
  const { data: rack, isLoading: isLoadingRack } = useQuery({
    queryKey: ['rack', rackId],
    queryFn: () => fetchRackDetail(rackId!),
    enabled: !!rackId,
  });

  const { data: equipmentList = [], isLoading: isLoadingEquipment } = useQuery({
    queryKey: ['equipment', rackId],
    queryFn: () => fetchEquipmentList(rackId!),
    enabled: !!rackId,
  });

  // 설비 생성 mutation
  const createEquipmentMutation = useMutation({
    mutationFn: (data: CreateEquipmentRequest) =>
      api.post(`/racks/${rackId}/equipment`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', rackId] });
      queryClient.invalidateQueries({ queryKey: ['rack', rackId] });
      setShowAddModal(false);
      setClickedStartU(null);
      setError(null);
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  // 설비 수정 mutation
  const updateEquipmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEquipmentRequest }) =>
      api.put(`/equipment/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', rackId] });
      queryClient.invalidateQueries({ queryKey: ['rack', rackId] });
      setShowDetailModal(false);
      setError(null);
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  // 설비 이동 mutation
  const moveEquipmentMutation = useMutation({
    mutationFn: ({ id, startU }: { id: string; startU: number }) =>
      api.patch(`/equipment/${id}/move`, { startU }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', rackId] });
      queryClient.invalidateQueries({ queryKey: ['rack', rackId] });
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  // 설비 삭제 mutation
  const deleteEquipmentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', rackId] });
      queryClient.invalidateQueries({ queryKey: ['rack', rackId] });
      setSelectedEquipmentId(null);
      setShowDetailModal(false);
      setError(null);
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  // 이미지 업로드 mutation (압축 적용)
  const uploadImageMutation = useMutation({
    mutationFn: async ({ type, file }: { type: 'front' | 'rear'; file: File }) => {
      // 이미지 압축
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
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  // 이미지 삭제 mutation
  const deleteImageMutation = useMutation({
    mutationFn: (type: 'front' | 'rear') => api.delete(`/racks/${rackId}/images/${type}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rack', rackId] });
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  // 선택된 설비
  const selectedEquipment = equipmentList.find((e) => e.id === selectedEquipmentId);

  // Y 좌표를 U 위치로 변환
  const yToU = useCallback((y: number, rackTotalU: number): number => {
    const { uHeight } = getRackDimensions();
    const rackHeight = rackTotalU * uHeight;
    const rackY = padding;
    const relativeY = y - rackY;
    const u = Math.ceil((rackHeight - relativeY) / uHeight);
    return Math.max(1, Math.min(rackTotalU, u));
  }, [getRackDimensions]);

  // U 위치를 Y 좌표로 변환
  const uToY = useCallback((u: number, rackTotalU: number): number => {
    const { uHeight } = getRackDimensions();
    const rackHeight = rackTotalU * uHeight;
    const rackY = padding;
    return rackY + rackHeight - u * uHeight;
  }, [getRackDimensions]);

  // 해당 U가 비어있는지 확인
  const isSlotAvailable = useCallback((startU: number, heightU: number, excludeId?: string): boolean => {
    for (let u = startU; u < startU + heightU; u++) {
      for (const eq of equipmentList) {
        if (excludeId && eq.id === excludeId) continue;
        if (u >= eq.startU && u < eq.startU + eq.heightU) {
          return false;
        }
      }
    }
    return true;
  }, [equipmentList]);

  // 캔버스 렌더링
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !rack) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 컨테이너 크기에 맞춰 동적 계산
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const { rackWidth, uHeight } = getRackDimensions();
    const rackHeight = rack.totalU * uHeight;

    // 캔버스 크기를 컨테이너에 맞춤
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // 배경
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rackX = (canvas.width - rackWidth) / 2;
    const rackY = padding;

    // 랙 배경
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(rackX - 2, rackY - 2, rackWidth + 4, rackHeight + 4);

    // 랙 내부
    ctx.fillStyle = '#334155';
    ctx.fillRect(rackX, rackY, rackWidth, rackHeight);

    // U 슬롯 그리기
    for (let u = 1; u <= rack.totalU; u++) {
      const slotY = rackY + rackHeight - u * uHeight;
      const slotAvailable = isSlotAvailable(u, 1);
      const isHovered = hoveredU === u && slotAvailable;

      // 슬롯 배경 (빈 슬롯은 밝게, 호버 시 더 밝게)
      if (slotAvailable) {
        ctx.fillStyle = isHovered ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect(rackX + 2, slotY + 1, rackWidth - 4, uHeight - 2);

        // 호버 시 "+설비추가" 텍스트 표시
        if (isHovered) {
          ctx.fillStyle = '#3b82f6';
          ctx.font = 'bold 12px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('+ 설비추가', rackX + rackWidth / 2, slotY + uHeight / 2);
        }
      }

      // U 라인
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rackX, slotY);
      ctx.lineTo(rackX + rackWidth, slotY);
      ctx.stroke();

      // U 번호 (왼쪽)
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${u}`, rackX - 8, slotY + uHeight / 2);
    }

    // 드래그 프리뷰
    if (dragPreview) {
      const previewY = uToY(dragPreview.startU + dragPreview.heightU - 1, rack.totalU);
      const previewHeight = dragPreview.heightU * uHeight;
      const available = isSlotAvailable(dragPreview.startU, dragPreview.heightU, dragEquipmentId || undefined);

      ctx.fillStyle = available ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';
      ctx.fillRect(rackX + 4, previewY, rackWidth - 8, previewHeight - 2);
      ctx.strokeStyle = available ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(rackX + 4, previewY, rackWidth - 8, previewHeight - 2);
      ctx.setLineDash([]);
    }

    // 설비 그리기
    for (const equipment of equipmentList) {
      const eqY = uToY(equipment.startU + equipment.heightU - 1, rack.totalU);
      const eqHeight = equipment.heightU * uHeight;
      const isSelected = equipment.id === selectedEquipmentId;
      const isDragging = equipment.id === dragEquipmentId && dragMode !== 'none';

      if (isDragging) continue; // 드래그 중인 설비는 나중에 그림

      // 설비 배경
      const categoryColor = getCategoryColor(equipment.category);
      ctx.fillStyle = categoryColor;
      ctx.fillRect(rackX + 4, eqY, rackWidth - 8, eqHeight - 2);

      // 선택된 경우 강조
      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(rackX + 4, eqY, rackWidth - 8, eqHeight - 2);
      }

      // 설비 이름
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const displayName = equipment.name.length > 25 ? equipment.name.slice(0, 22) + '...' : equipment.name;
      ctx.fillText(displayName, rackX + rackWidth / 2, eqY + eqHeight / 2);
    }

    // 드래그 중인 설비 (맨 위에)
    if (dragEquipmentId && dragPreview && dragMode !== 'none') {
      const equipment = equipmentList.find(e => e.id === dragEquipmentId);
      if (equipment) {
        const previewY = uToY(dragPreview.startU + dragPreview.heightU - 1, rack.totalU);
        const previewHeight = dragPreview.heightU * uHeight;

        ctx.globalAlpha = 0.8;
        ctx.fillStyle = getCategoryColor(equipment.category);
        ctx.fillRect(rackX + 4, previewY, rackWidth - 8, previewHeight - 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(rackX + 4, previewY, rackWidth - 8, previewHeight - 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(equipment.name, rackX + rackWidth / 2, previewY + previewHeight / 2);
        ctx.globalAlpha = 1;
      }
    }

    // 사용량 표시
    const usedU = equipmentList.reduce((sum, e) => sum + e.heightU, 0);
    const usagePercent = Math.round((usedU / rack.totalU) * 100);
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(
      `사용: ${usedU}U / ${rack.totalU}U (${usagePercent}%)`,
      canvas.width / 2,
      rackY + rackHeight + 25
    );

    // 도움말 텍스트
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px system-ui';
    ctx.fillText('빈 슬롯 클릭: 설비 추가 | 설비 더블클릭: 편집 | 드래그: 이동', canvas.width / 2, rackY + rackHeight + 45);

  }, [rack, equipmentList, selectedEquipmentId, dragPreview, dragEquipmentId, dragMode, isSlotAvailable, uToY, hoveredU, getRackDimensions]);

  // 캔버스 렌더링 트리거
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  useEffect(() => {
    const handleResize = () => renderCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  // 마우스 위치에서 설비 찾기
  const findEquipmentAtPosition = useCallback((x: number, y: number): Equipment | null => {
    if (!rack) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const { rackWidth, uHeight } = getRackDimensions();
    const rackX = (canvas.width - rackWidth) / 2;

    for (const equipment of equipmentList) {
      const eqY = uToY(equipment.startU + equipment.heightU - 1, rack.totalU);
      const eqHeight = equipment.heightU * uHeight;

      if (x >= rackX + 4 && x <= rackX + rackWidth - 4 && y >= eqY && y <= eqY + eqHeight - 2) {
        return equipment;
      }
    }
    return null;
  }, [rack, equipmentList, uToY, getRackDimensions]);

  // 마우스 다운 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !rack) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const equipment = findEquipmentAtPosition(x, y);

    if (equipment) {
      setSelectedEquipmentId(equipment.id);

      // 이동 모드
      setDragMode('move');
      setDragEquipmentId(equipment.id);
      setDragStartY(y);
      setDragPreview({ startU: equipment.startU, heightU: equipment.heightU });
    } else {
      // 빈 슬롯 클릭 - 설비 추가 모달 열기
      const { rackWidth } = getRackDimensions();
      const rackX = (canvas.width - rackWidth) / 2;
      if (x >= rackX && x <= rackX + rackWidth) {
        const clickedU = yToU(y, rack.totalU);
        if (isSlotAvailable(clickedU, 1)) {
          setClickedStartU(clickedU);
          setShowAddModal(true);
          setSelectedEquipmentId(null);
        }
      } else {
        setSelectedEquipmentId(null);
      }
    }
  }, [rack, findEquipmentAtPosition, yToU, isSlotAvailable, getRackDimensions]);

  // 마우스 이동 핸들러
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !rack) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 호버 상태 업데이트
    const { rackWidth } = getRackDimensions();
    const rackX = (canvas.width - rackWidth) / 2;
    if (x >= rackX && x <= rackX + rackWidth && dragMode === 'none') {
      const u = yToU(y, rack.totalU);
      if (isSlotAvailable(u, 1)) {
        setHoveredU(u);
      } else {
        setHoveredU(null);
      }
    } else {
      setHoveredU(null);
    }

    // 드래그 처리
    if (dragMode === 'none') return;

    const { uHeight } = getRackDimensions();
    const deltaY = y - dragStartY;
    const deltaU = Math.round(deltaY / uHeight);

    const equipment = equipmentList.find(eq => eq.id === dragEquipmentId);
    if (!equipment) return;

    if (dragMode === 'move') {
      const newStartU = Math.max(1, Math.min(rack.totalU - equipment.heightU + 1, equipment.startU - deltaU));
      setDragPreview({ startU: newStartU, heightU: equipment.heightU });
    }
  }, [rack, dragMode, dragStartY, dragEquipmentId, equipmentList, yToU, isSlotAvailable, getRackDimensions]);

  // 마우스 업 핸들러
  const handleMouseUp = useCallback(() => {
    if (dragMode !== 'none' && dragPreview && dragEquipmentId) {
      const equipment = equipmentList.find(eq => eq.id === dragEquipmentId);
      if (equipment) {
        const available = isSlotAvailable(dragPreview.startU, dragPreview.heightU, dragEquipmentId);

        if (available && dragPreview.startU !== equipment.startU) {
          moveEquipmentMutation.mutate({ id: dragEquipmentId, startU: dragPreview.startU });
        }
      }
    }

    setDragMode('none');
    setDragEquipmentId(null);
    setDragPreview(null);
  }, [dragMode, dragPreview, dragEquipmentId, equipmentList, isSlotAvailable, moveEquipmentMutation]);

  // 마우스 리브 핸들러
  const handleMouseLeave = useCallback(() => {
    setHoveredU(null);
    handleMouseUp();
  }, [handleMouseUp]);

  // 더블클릭 핸들러
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !rack) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const equipment = findEquipmentAtPosition(x, y);
    if (equipment) {
      setSelectedEquipmentId(equipment.id);
      setShowDetailModal(true);
    }
  }, [rack, findEquipmentAtPosition]);

  // 커서 스타일
  const getCursorStyle = useCallback((): string => {
    if (dragMode === 'move') return 'grabbing';
    if (hoveredU !== null) return 'pointer';
    return 'default';
  }, [dragMode, hoveredU]);

  // 이미지 업로드 핸들러
  const handleImageUpload = (type: 'front' | 'rear') => {
    setUploadType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImageMutation.mutate({ type: uploadType, file });
    }
    e.target.value = '';
  };

  // 로딩
  if (isLoadingRack || isLoadingEquipment) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!rack) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-gray-500 mb-4">랙을 찾을 수 없습니다.</p>
        <button onClick={() => navigate(-1)} className="text-blue-600 hover:text-blue-700">
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
            title="돌아가기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              {rack.name} {rack.code && <span className="text-gray-500 font-normal">({rack.code})</span>}
            </h1>
            <p className="text-xs text-gray-500">
              수정: {formatShortDate(rack.updatedAt)}
            </p>
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

      {/* 메인 - 4:4:2 비율 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 캔버스 영역 - 40% */}
        <div ref={containerRef} className="w-[40%] overflow-auto bg-gray-50 border-r flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={handleDoubleClick}
            style={{ cursor: getCursorStyle() }}
          />
        </div>

        {/* 랙 사진 영역 - 40% */}
        <div className="w-[40%] overflow-hidden bg-gray-100 border-r flex items-center justify-center p-4">
          <div
            className="relative group bg-gray-200 flex items-center justify-center overflow-hidden cursor-pointer w-full h-full rounded-xl shadow-lg"
            onClick={() => {
              const imageUrl = viewMode === 'front' ? rack.frontImageUrl : rack.rearImageUrl;
              if (imageUrl) setFullscreenImage(imageUrl);
            }}
          >
            {(viewMode === 'front' ? rack.frontImageUrl : rack.rearImageUrl) ? (
              <img
                src={(viewMode === 'front' ? rack.frontImageUrl : rack.rearImageUrl)!}
                alt={viewMode === 'front' ? '정면 사진' : '후면 사진'}
                className="w-full h-full object-cover"
              />
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
              {(viewMode === 'front' ? rack.frontImageUrl : rack.rearImageUrl) && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const imageUrl = viewMode === 'front' ? rack.frontImageUrl : rack.rearImageUrl;
                      if (imageUrl) setFullscreenImage(imageUrl);
                    }}
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
            {/* 사진 수정일 표시 */}
            {(viewMode === 'front' ? rack.frontImageUrl : rack.rearImageUrl) && (
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                수정: {formatShortDate(rack.updatedAt)}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* 사이드 패널 - 20% */}
        <aside className="w-[20%] bg-white overflow-y-auto text-sm">
          {/* 랙 정보 */}
          <div className="p-3 border-b">
            <h2 className="font-medium text-gray-900 mb-2">랙 정보</h2>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">총 U / 사용</span>
                <span className="text-gray-900">{rack.totalU}U / {rack.usedU}U</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">설비 수</span>
                <span className="text-gray-900">{rack.equipmentCount}개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">수정일</span>
                <span className="text-gray-900">{formatShortDate(rack.updatedAt)}</span>
              </div>
            </div>
          </div>

          {/* 설비 목록 */}
          <div className="p-3">
            <h2 className="font-medium text-gray-900 mb-2">설비 ({equipmentList.length})</h2>
            {equipmentList.length === 0 ? (
              <p className="text-xs text-gray-500">캔버스의 빈 슬롯을 클릭하여 설비를 추가하세요.</p>
            ) : (
              <div className="space-y-1.5">
                {equipmentList.map((equipment) => (
                  <div
                    key={equipment.id}
                    onClick={() => setSelectedEquipmentId(equipment.id)}
                    onDoubleClick={() => {
                      setSelectedEquipmentId(equipment.id);
                      setShowDetailModal(true);
                    }}
                    className={`p-2 rounded cursor-pointer transition-colors ${
                      selectedEquipmentId === equipment.id
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded mt-0.5 flex-shrink-0"
                        style={{ backgroundColor: getCategoryColor(equipment.category) }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate text-xs">{equipment.name}</p>
                        <p className="text-[10px] text-gray-500">
                          {equipment.manager || '담당자 미지정'}
                          {equipment.model && ` · ${equipment.model}`}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          수정: {formatShortDate(equipment.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 설비 추가 모달 */}
      {showAddModal && (
        <EquipmentModal
          initialStartU={clickedStartU}
          onClose={() => {
            setShowAddModal(false);
            setClickedStartU(null);
            setError(null);
          }}
          onSubmit={(data) => createEquipmentMutation.mutate(data)}
          isLoading={createEquipmentMutation.isPending}
          error={error}
        />
      )}

      {/* 설비 상세 모달 */}
      {showDetailModal && selectedEquipment && (
        <EquipmentDetailModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowDetailModal(false);
            setError(null);
          }}
          onUpdate={(data) => updateEquipmentMutation.mutate({ id: selectedEquipment.id, data })}
          onDelete={() => {
            if (confirm('이 설비를 삭제하시겠습니까?')) {
              deleteEquipmentMutation.mutate(selectedEquipment.id);
            }
          }}
          isLoading={updateEquipmentMutation.isPending || deleteEquipmentMutation.isPending}
          error={error}
        />
      )}

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

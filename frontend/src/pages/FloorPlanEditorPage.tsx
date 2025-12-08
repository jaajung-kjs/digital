import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';
import { useIsAdmin } from '../stores/authStore';
import type {
  FloorPlanDetail,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  EditorState,
  RackItem,
  FloorPlanElement,
  WallProperties,
  DoorProperties,
  WindowProperties,
  ColumnProperties,
} from '../types/floorPlan';
import type { FloorDetail } from '../types';

// 초기 에디터 상태
const initialEditorState: EditorState = {
  tool: 'select',
  selectedIds: [],
  zoom: 100,
  panX: 0,
  panY: 0,
  gridSnap: true,
  gridSize: 20,
  showGrid: true,
};

// Undo/Redo를 위한 히스토리 타입
interface HistoryState {
  elements: FloorPlanElement[];
  racks: RackItem[];
}

export function FloorPlanEditorPage() {
  const { floorId } = useParams<{ floorId: string }>();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [editorState, setEditorState] = useState<EditorState>(initialEditorState);
  const [localElements, setLocalElements] = useState<FloorPlanElement[]>([]);
  const [localRacks, setLocalRacks] = useState<RackItem[]>([]);
  const [selectedRack, setSelectedRack] = useState<RackItem | null>(null);
  const [selectedElement, setSelectedElement] = useState<FloorPlanElement | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [rackModalOpen, setRackModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newRackName, setNewRackName] = useState('');

  // 벽 그리기 상태
  const [isDrawingWall, setIsDrawingWall] = useState(false);
  const [wallPoints, setWallPoints] = useState<[number, number][]>([]);
  const [wallPreviewEnd, setWallPreviewEnd] = useState<[number, number] | null>(null);

  // 오브젝트 미리보기 상태
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const [previewRotation, setPreviewRotation] = useState(0); // 0, 90, 180, 270

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ type: 'rack' | 'element'; id: string } | null>(null);

  // 캔버스 팬 상태
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);

  // Undo/Redo 히스토리
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 새 랙 추가 위치
  const [newRackPosition, setNewRackPosition] = useState<{ x: number; y: number }>({ x: 100, y: 100 });

  // 삭제된 요소/랙 ID 추적 (저장 시 백엔드에 전달)
  const [deletedElementIds, setDeletedElementIds] = useState<string[]>([]);
  const [deletedRackIds, setDeletedRackIds] = useState<string[]>([]);

  // 층 정보 조회
  const { data: floor, isLoading: floorLoading } = useQuery({
    queryKey: ['floor', floorId],
    queryFn: async () => {
      const response = await api.get<{ data: FloorDetail }>(`/floors/${floorId}`);
      return response.data.data;
    },
    enabled: !!floorId,
  });

  // 평면도 조회
  const { data: floorPlan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['floorPlan', floorId],
    queryFn: async () => {
      const response = await api.get<{ data: FloorPlanDetail }>(`/floors/${floorId}/floor-plan`);
      return response.data.data;
    },
    enabled: !!floorId,
    retry: false,
  });

  // 평면도 생성
  const createMutation = useMutation({
    mutationFn: (data: CreateFloorPlanRequest) =>
      api.post(`/floors/${floorId}/floor-plan`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
      queryClient.invalidateQueries({ queryKey: ['floor', floorId] });
      setCreateModalOpen(false);
      setNewPlanName('');
    },
  });

  // 평면도 저장
  const saveMutation = useMutation({
    mutationFn: (data: UpdateFloorPlanRequest) =>
      api.put(`/floor-plans/${floorPlan?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
      setHasChanges(false);
      // 저장 성공 후 삭제 목록 초기화
      setDeletedElementIds([]);
      setDeletedRackIds([]);
    },
  });

  // 평면도 삭제
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/floor-plans/${floorPlan?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
      queryClient.invalidateQueries({ queryKey: ['floor', floorId] });
      setDeleteModalOpen(false);
      // 층 목록으로 이동
      navigate(`/substations/${floor?.substationId}/floors`);
    },
  });

  // 히스토리에 상태 추가
  const pushHistory = useCallback((elements: FloorPlanElement[], racks: RackItem[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ elements: [...elements], racks: [...racks] });
      // 최대 50개 히스토리 유지
      if (newHistory.length > 50) {
        newHistory.shift();
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setLocalElements(prevState.elements);
      setLocalRacks(prevState.racks);
      setHistoryIndex(prev => prev - 1);
      setHasChanges(true);
    }
  }, [history, historyIndex]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setLocalElements(nextState.elements);
      setLocalRacks(nextState.racks);
      setHistoryIndex(prev => prev + 1);
      setHasChanges(true);
    }
  }, [history, historyIndex]);

  // 평면도 데이터 로드
  useEffect(() => {
    if (floorPlan) {
      setLocalElements(floorPlan.elements);
      setLocalRacks(floorPlan.racks);
      setEditorState(prev => ({
        ...prev,
        gridSize: floorPlan.gridSize,
      }));
      // 초기 히스토리 설정
      setHistory([{ elements: floorPlan.elements, racks: floorPlan.racks }]);
      setHistoryIndex(0);
    }
  }, [floorPlan]);

  // 캔버스 렌더링
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !floorPlan) return;

    const { zoom, panX, panY, showGrid, gridSize } = editorState;
    const scale = zoom / 100;

    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    // 배경
    ctx.fillStyle = floorPlan.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, floorPlan.canvasWidth, floorPlan.canvasHeight);

    // 그리드
    if (showGrid) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= floorPlan.canvasWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, floorPlan.canvasHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= floorPlan.canvasHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(floorPlan.canvasWidth, y);
        ctx.stroke();
      }
    }

    // 요소 렌더링 (벽, 문, 창문, 기둥)
    localElements.forEach((element) => {
      if (!element.isVisible) return;

      const isSelected = editorState.selectedIds.includes(element.id);

      switch (element.elementType) {
        case 'wall': {
          const props = element.properties as WallProperties;
          if (props.points && props.points.length >= 2) {
            ctx.strokeStyle = props.color || '#333333';
            ctx.lineWidth = props.thickness || 10;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(props.points[0][0], props.points[0][1]);
            for (let i = 1; i < props.points.length; i++) {
              ctx.lineTo(props.points[i][0], props.points[i][1]);
            }
            ctx.stroke();

            // 선택 하이라이트
            if (isSelected) {
              ctx.strokeStyle = '#3b82f6';
              ctx.lineWidth = 2;
              ctx.setLineDash([5, 5]);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
          break;
        }
        case 'door': {
          const props = element.properties as DoorProperties;
          ctx.save();
          ctx.translate(props.x, props.y);
          ctx.rotate(((props.rotation || 0) * Math.PI) / 180);

          // 문 그리기
          ctx.fillStyle = isSelected ? '#dbeafe' : '#fef3c7';
          ctx.strokeStyle = isSelected ? '#3b82f6' : '#d97706';
          ctx.lineWidth = 2;
          ctx.fillRect(0, 0, props.width, 10);
          ctx.strokeRect(0, 0, props.width, 10);

          // 문 열림 방향 표시 (호)
          ctx.beginPath();
          ctx.strokeStyle = isSelected ? '#3b82f6' : '#d97706';
          ctx.setLineDash([3, 3]);
          if (props.openDirection === 'inside') {
            ctx.arc(0, 10, props.width, -Math.PI / 2, 0);
          } else {
            ctx.arc(0, 0, props.width, 0, Math.PI / 2);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
          break;
        }
        case 'window': {
          const props = element.properties as WindowProperties;
          ctx.save();
          ctx.translate(props.x, props.y);
          ctx.rotate(((props.rotation || 0) * Math.PI) / 180);

          // 창문 그리기
          ctx.fillStyle = isSelected ? '#dbeafe' : '#e0f2fe';
          ctx.strokeStyle = isSelected ? '#3b82f6' : '#0284c7';
          ctx.lineWidth = 2;
          ctx.fillRect(0, 0, props.width, 8);
          ctx.strokeRect(0, 0, props.width, 8);

          // 가운데 선
          ctx.beginPath();
          ctx.moveTo(props.width / 2, 0);
          ctx.lineTo(props.width / 2, 8);
          ctx.stroke();

          ctx.restore();
          break;
        }
        case 'column': {
          const props = element.properties as ColumnProperties;
          ctx.fillStyle = isSelected ? '#dbeafe' : '#6b7280';
          ctx.strokeStyle = isSelected ? '#3b82f6' : '#374151';
          ctx.lineWidth = 2;

          if (props.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(props.x + props.width / 2, props.y + props.height / 2, props.width / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillRect(props.x, props.y, props.width, props.height);
            ctx.strokeRect(props.x, props.y, props.width, props.height);
          }
          break;
        }
      }
    });

    // 랙 렌더링
    localRacks.forEach((rack) => {
      const isSelected = editorState.selectedIds.includes(rack.id);

      ctx.save();
      ctx.translate(rack.positionX + rack.width / 2, rack.positionY + rack.height / 2);
      ctx.rotate((rack.rotation * Math.PI) / 180);
      ctx.translate(-rack.width / 2, -rack.height / 2);

      // 랙 배경
      ctx.fillStyle = isSelected ? '#dbeafe' : '#f3f4f6';
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#374151';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.fillRect(0, 0, rack.width, rack.height);
      ctx.strokeRect(0, 0, rack.width, rack.height);

      // 랙 이름
      ctx.fillStyle = '#111827';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rack.name, rack.width / 2, rack.height / 2);

      ctx.restore();
    });

    // 벽 그리기 미리보기
    if (isDrawingWall && wallPoints.length === 1) {
      const startPoint = wallPoints[0];

      // 시작점 표시 (빨간 원)
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(startPoint[0], startPoint[1], 6, 0, Math.PI * 2);
      ctx.fill();

      // 미리보기 선 (마우스 위치까지)
      if (wallPreviewEnd) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(startPoint[0], startPoint[1]);
        ctx.lineTo(wallPreviewEnd[0], wallPreviewEnd[1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 오브젝트 미리보기 렌더링
    if (previewPosition) {
      ctx.globalAlpha = 0.6;

      switch (editorState.tool) {
        case 'door': {
          ctx.save();
          ctx.translate(previewPosition.x, previewPosition.y);
          ctx.rotate((previewRotation * Math.PI) / 180);

          // 문 미리보기
          ctx.fillStyle = '#fef3c7';
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 2;
          ctx.fillRect(0, 0, 60, 10);
          ctx.strokeRect(0, 0, 60, 10);

          // 문 열림 방향 표시 (호)
          ctx.beginPath();
          ctx.setLineDash([3, 3]);
          ctx.arc(0, 10, 60, -Math.PI / 2, 0);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
          break;
        }
        case 'window': {
          ctx.save();
          ctx.translate(previewPosition.x, previewPosition.y);
          ctx.rotate((previewRotation * Math.PI) / 180);

          // 창문 미리보기
          ctx.fillStyle = '#e0f2fe';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2;
          ctx.fillRect(0, 0, 80, 8);
          ctx.strokeRect(0, 0, 80, 8);

          // 가운데 선
          ctx.beginPath();
          ctx.moveTo(40, 0);
          ctx.lineTo(40, 8);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'column': {
          // 기둥 미리보기
          ctx.fillStyle = '#6b7280';
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 2;
          ctx.fillRect(previewPosition.x, previewPosition.y, 40, 40);
          ctx.strokeRect(previewPosition.x, previewPosition.y, 40, 40);
          break;
        }
        case 'rack': {
          // 랙 미리보기
          ctx.fillStyle = '#f3f4f6';
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 1;
          ctx.fillRect(previewPosition.x, previewPosition.y, 60, 100);
          ctx.strokeRect(previewPosition.x, previewPosition.y, 60, 100);

          ctx.fillStyle = '#111827';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('새 랙', previewPosition.x + 30, previewPosition.y + 50);
          break;
        }
      }

      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [floorPlan, localElements, localRacks, editorState, isDrawingWall, wallPoints, wallPreviewEnd, previewPosition, previewRotation]);

  // 캔버스 크기 조정 및 렌더링
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      renderCanvas();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [renderCanvas]);

  // 마우스 좌표를 캔버스 좌표로 변환
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = editorState.zoom / 100;
    const x = (e.clientX - rect.left - editorState.panX) / scale;
    const y = (e.clientY - rect.top - editorState.panY) / scale;
    return { x, y };
  };

  // 그리드 스냅
  const snapToGrid = (x: number, y: number) => {
    if (!editorState.gridSnap) return { x, y };
    return {
      x: Math.round(x / editorState.gridSize) * editorState.gridSize,
      y: Math.round(y / editorState.gridSize) * editorState.gridSize,
    };
  };

  // 점을 특정 중심 기준으로 역회전 (히트박스 계산용)
  const rotatePointAroundOrigin = (px: number, py: number, cx: number, cy: number, angleDeg: number) => {
    const angleRad = (-angleDeg * Math.PI) / 180; // 역회전
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = px - cx;
    const dy = py - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  };

  // 점과 선분 사이의 거리 계산
  const distanceToLineSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 요소 찾기
  const findElementAt = (x: number, y: number) => {
    // 랙 찾기
    const rack = localRacks.find(r => {
      return x >= r.positionX && x <= r.positionX + r.width &&
             y >= r.positionY && y <= r.positionY + r.height;
    });
    if (rack) return { type: 'rack' as const, item: rack };

    // 요소 찾기 (기둥, 문, 창문, 벽)
    const element = [...localElements].reverse().find(e => {
      if (!e.isVisible) return false;

      switch (e.elementType) {
        case 'wall': {
          const props = e.properties as WallProperties;
          if (!props.points || props.points.length < 2) return false;
          const thickness = (props.thickness || 10) / 2 + 5; // 클릭 여유 추가
          // 모든 선분에 대해 거리 검사
          for (let i = 0; i < props.points.length - 1; i++) {
            const [x1, y1] = props.points[i];
            const [x2, y2] = props.points[i + 1];
            const dist = distanceToLineSegment(x, y, x1, y1, x2, y2);
            if (dist <= thickness) return true;
          }
          return false;
        }
        case 'door': {
          const props = e.properties as DoorProperties;
          const doorWidth = props.width;
          const doorHeight = 10;
          const rotation = props.rotation || 0;
          // 회전 중심 (문의 시작점 기준)
          const cx = props.x;
          const cy = props.y;
          // 클릭 좌표를 역회전하여 원래 좌표계에서 확인
          const rotated = rotatePointAroundOrigin(x, y, cx, cy, rotation);
          return rotated.x >= props.x && rotated.x <= props.x + doorWidth &&
                 rotated.y >= props.y && rotated.y <= props.y + doorHeight;
        }
        case 'window': {
          const props = e.properties as WindowProperties;
          const windowWidth = props.width;
          const windowHeight = 8;
          const rotation = props.rotation || 0;
          // 회전 중심 (창문의 시작점 기준)
          const cx = props.x;
          const cy = props.y;
          // 클릭 좌표를 역회전하여 원래 좌표계에서 확인
          const rotated = rotatePointAroundOrigin(x, y, cx, cy, rotation);
          return rotated.x >= props.x && rotated.x <= props.x + windowWidth &&
                 rotated.y >= props.y && rotated.y <= props.y + windowHeight;
        }
        case 'column': {
          const props = e.properties as ColumnProperties;
          return x >= props.x && x <= props.x + props.width &&
                 y >= props.y && y <= props.y + props.height;
        }
        default:
          return false;
      }
    });
    if (element) return { type: 'element' as const, item: element };

    return null;
  };

  // 캔버스 마우스 다운
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x, y } = getCanvasCoordinates(e);

    // 중간 버튼(휠 클릭)이면 무조건 팬 모드
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: screenX, y: screenY });
      return;
    }

    if (editorState.tool === 'select') {
      const found = findElementAt(x, y);
      if (found) {
        setIsDragging(true);
        setDragStart({ x, y });
        setDragTarget({ type: found.type, id: found.item.id });
        setEditorState(prev => ({ ...prev, selectedIds: [found.item.id] }));

        if (found.type === 'rack') {
          setSelectedRack(found.item as RackItem);
          setSelectedElement(null);
        } else {
          setSelectedElement(found.item as FloorPlanElement);
          setSelectedRack(null);
        }
      } else {
        // 빈 공간 클릭 시 팬 모드 시작
        setIsPanning(true);
        setPanStart({ x: screenX, y: screenY });
        setEditorState(prev => ({ ...prev, selectedIds: [] }));
        setSelectedRack(null);
        setSelectedElement(null);
      }
    }
  };

  // 캔버스 마우스 이동
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // 캔버스 팬 처리
    if (isPanning && panStart) {
      const dx = screenX - panStart.x;
      const dy = screenY - panStart.y;
      setEditorState(prev => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      }));
      setPanStart({ x: screenX, y: screenY });
      return;
    }

    const { x, y } = getCanvasCoordinates(e);
    const snapped = snapToGrid(x, y);

    // 벽 그리기 중 미리보기 업데이트
    if (editorState.tool === 'wall' && isDrawingWall && wallPoints.length === 1) {
      setWallPreviewEnd([snapped.x, snapped.y]);
      return;
    }

    // 오브젝트 미리보기 위치 업데이트
    if (['door', 'window', 'column', 'rack'].includes(editorState.tool)) {
      setPreviewPosition({ x: snapped.x, y: snapped.y });
    } else {
      setPreviewPosition(null);
    }

    if (!isDragging || !dragStart || !dragTarget) return;

    // 목표 위치를 그리드에 스냅 (X,Y 동시 이동 수정)
    if (dragTarget.type === 'rack') {
      setLocalRacks(prev => prev.map(r => {
        if (r.id === dragTarget.id) {
          const newX = snapped.x - (dragStart.x - r.positionX);
          const newY = snapped.y - (dragStart.y - r.positionY);
          const finalPos = snapToGrid(newX, newY);
          return { ...r, positionX: finalPos.x, positionY: finalPos.y };
        }
        return r;
      }));
    } else {
      setLocalElements(prev => prev.map(el => {
        if (el.id === dragTarget.id) {
          const props = { ...el.properties };
          if ('x' in props && 'y' in props) {
            const currentProps = props as { x: number; y: number };
            const newX = snapped.x - (dragStart.x - currentProps.x);
            const newY = snapped.y - (dragStart.y - currentProps.y);
            const finalPos = snapToGrid(newX, newY);
            currentProps.x = finalPos.x;
            currentProps.y = finalPos.y;
          }
          return { ...el, properties: props };
        }
        return el;
      }));
    }

    setDragStart(snapped);
    setHasChanges(true);
  };

  // 캔버스 마우스 업
  const handleCanvasMouseUp = () => {
    if (isDragging) {
      pushHistory(localElements, localRacks);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragTarget(null);
    // 팬 모드 종료
    setIsPanning(false);
    setPanStart(null);
  };

  // 캔버스 클릭 처리
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan || !canvasRef.current) return;

    const { x, y } = getCanvasCoordinates(e);
    const snapped = snapToGrid(x, y);

    switch (editorState.tool) {
      case 'wall':
        if (!isDrawingWall) {
          // 첫 클릭: 시작점 설정
          setIsDrawingWall(true);
          setWallPoints([[snapped.x, snapped.y]]);
          setWallPreviewEnd(null);
        } else {
          // 두 번째 클릭: 즉시 벽 확정
          const newWall: FloorPlanElement = {
            id: `temp-${Date.now()}`,
            elementType: 'wall',
            properties: {
              points: [wallPoints[0], [snapped.x, snapped.y]],
              thickness: 10,
              color: '#333333',
            },
            zIndex: 0,
            isVisible: true,
          };
          const newElements = [...localElements, newWall];
          setLocalElements(newElements);
          pushHistory(newElements, localRacks);

          // 상태 초기화
          setIsDrawingWall(false);
          setWallPoints([]);
          setWallPreviewEnd(null);
          setHasChanges(true);
        }
        break;

      case 'door': {
        const newDoor: FloorPlanElement = {
          id: `temp-${Date.now()}`,
          elementType: 'door',
          properties: {
            x: snapped.x,
            y: snapped.y,
            width: 60,
            openDirection: 'inside',
            rotation: previewRotation,
          } as DoorProperties,
          zIndex: localElements.length,
          isVisible: true,
        };
        const newElements = [...localElements, newDoor];
        setLocalElements(newElements);
        pushHistory(newElements, localRacks);
        setHasChanges(true);
        setPreviewRotation(0); // 회전 초기화
        break;
      }

      case 'window': {
        const newWindow: FloorPlanElement = {
          id: `temp-${Date.now()}`,
          elementType: 'window',
          properties: {
            x: snapped.x,
            y: snapped.y,
            width: 80,
            rotation: previewRotation,
          } as WindowProperties,
          zIndex: localElements.length,
          isVisible: true,
        };
        const newElements = [...localElements, newWindow];
        setLocalElements(newElements);
        pushHistory(newElements, localRacks);
        setHasChanges(true);
        setPreviewRotation(0); // 회전 초기화
        break;
      }

      case 'column': {
        const newColumn: FloorPlanElement = {
          id: `temp-${Date.now()}`,
          elementType: 'column',
          properties: {
            x: snapped.x,
            y: snapped.y,
            width: 40,
            height: 40,
            shape: 'rect',
          } as ColumnProperties,
          zIndex: localElements.length,
          isVisible: true,
        };
        const newElements = [...localElements, newColumn];
        setLocalElements(newElements);
        pushHistory(newElements, localRacks);
        setHasChanges(true);
        break;
      }

      case 'rack':
        setNewRackPosition({ x: snapped.x, y: snapped.y });
        setRackModalOpen(true);
        break;

      case 'delete': {
        const found = findElementAt(x, y);
        if (found) {
          if (found.type === 'rack') {
            const newRacks = localRacks.filter(r => r.id !== found.item.id);
            setLocalRacks(newRacks);
            pushHistory(localElements, newRacks);
            // 서버에 저장된 항목만 삭제 목록에 추가
            if (!found.item.id.startsWith('temp-')) {
              setDeletedRackIds(prev => [...prev, found.item.id]);
            }
          } else {
            const newElements = localElements.filter(e => e.id !== found.item.id);
            setLocalElements(newElements);
            pushHistory(newElements, localRacks);
            // 서버에 저장된 항목만 삭제 목록에 추가
            if (!found.item.id.startsWith('temp-')) {
              setDeletedElementIds(prev => [...prev, found.item.id]);
            }
          }
          setHasChanges(true);
        }
        break;
      }
    }
  };

  // 더블클릭 핸들러 (벽은 이제 두 번 클릭으로 확정되므로 불필요)
  const handleCanvasDoubleClick = () => {
    // 현재 사용하지 않음 - 추후 다른 기능에 활용 가능
  };

  // 키보드 이벤트
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에서는 단축키 무시
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        setIsDrawingWall(false);
        setWallPoints([]);
        setWallPreviewEnd(null);
        setEditorState(prev => ({ ...prev, selectedIds: [] }));
        setSelectedRack(null);
        setSelectedElement(null);
      }

      // 도구 단축키
      if (e.key === 'v') setEditorState(prev => ({ ...prev, tool: 'select' }));
      if (e.key === 'w') setEditorState(prev => ({ ...prev, tool: 'wall' }));
      if (e.key === 'd') setEditorState(prev => ({ ...prev, tool: 'door' }));
      if (e.key === 'n') setEditorState(prev => ({ ...prev, tool: 'window' }));
      if (e.key === 'c') setEditorState(prev => ({ ...prev, tool: 'column' }));
      if (e.key === 'r') setEditorState(prev => ({ ...prev, tool: 'rack' }));
      if (e.key === 'g') setEditorState(prev => ({ ...prev, gridSnap: !prev.gridSnap }));

      // Q 키로 회전 (미리보기 또는 선택된 문/창문)
      if (e.key === 'q') {
        if (selectedElement && ['door', 'window'].includes(selectedElement.elementType)) {
          // 선택된 요소 회전
          const newElements = localElements.map(el => {
            if (el.id === selectedElement.id) {
              const props = { ...el.properties } as DoorProperties | WindowProperties;
              props.rotation = ((props.rotation || 0) + 90) % 360;
              return { ...el, properties: props };
            }
            return el;
          });
          setLocalElements(newElements);
          pushHistory(newElements, localRacks);
          setHasChanges(true);
          const updated = newElements.find(el => el.id === selectedElement.id);
          if (updated) setSelectedElement(updated);
        } else if (['door', 'window'].includes(editorState.tool)) {
          // 미리보기 회전
          setPreviewRotation(prev => (prev + 90) % 360);
        }
      }

      // Delete 키로 선택 항목 삭제
      if (e.key === 'Delete' && editorState.selectedIds.length > 0) {
        // 삭제될 항목 중 서버에 저장된 것들의 ID를 추적
        const deletedRacks = localRacks
          .filter(r => editorState.selectedIds.includes(r.id) && !r.id.startsWith('temp-'))
          .map(r => r.id);
        const deletedElements = localElements
          .filter(el => editorState.selectedIds.includes(el.id) && !el.id.startsWith('temp-'))
          .map(el => el.id);

        if (deletedRacks.length > 0) {
          setDeletedRackIds(prev => [...prev, ...deletedRacks]);
        }
        if (deletedElements.length > 0) {
          setDeletedElementIds(prev => [...prev, ...deletedElements]);
        }

        const newRacks = localRacks.filter(r => !editorState.selectedIds.includes(r.id));
        const newElements = localElements.filter(el => !editorState.selectedIds.includes(el.id));
        setLocalRacks(newRacks);
        setLocalElements(newElements);
        pushHistory(newElements, newRacks);
        setEditorState(prev => ({ ...prev, selectedIds: [] }));
        setSelectedRack(null);
        setSelectedElement(null);
        setHasChanges(true);
      }

      // Ctrl+S 저장
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }

      // Ctrl+Z Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z 또는 Ctrl+Y Redo
      if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorState.selectedIds, editorState.gridSnap, editorState.tool, localElements, localRacks, undo, redo, pushHistory, selectedElement]);

  // 저장 핸들러
  const handleSave = () => {
    if (!floorPlan) return;

    const updateData: UpdateFloorPlanRequest = {
      canvasWidth: floorPlan.canvasWidth,
      canvasHeight: floorPlan.canvasHeight,
      gridSize: editorState.gridSize,
      elements: localElements.map(e => ({
        id: e.id.startsWith('temp-') ? null : e.id,
        elementType: e.elementType,
        properties: e.properties,
        zIndex: e.zIndex,
        isVisible: e.isVisible,
      })),
      racks: localRacks.map(r => ({
        id: r.id.startsWith('temp-') ? null : r.id,
        name: r.name,
        code: r.code || undefined,
        positionX: r.positionX,
        positionY: r.positionY,
        width: r.width,
        height: r.height,
        rotation: r.rotation,
        totalU: r.totalU,
        description: r.description || undefined,
      })),
      // 삭제된 항목 ID 전달
      deletedElementIds: deletedElementIds.length > 0 ? deletedElementIds : undefined,
      deletedRackIds: deletedRackIds.length > 0 ? deletedRackIds : undefined,
    };

    saveMutation.mutate(updateData);
  };

  // 줌 핸들러
  const handleZoom = (delta: number) => {
    setEditorState(prev => ({
      ...prev,
      zoom: Math.max(25, Math.min(400, prev.zoom + delta)),
    }));
  };

  // 랙 추가
  const handleAddRack = () => {
    const newRack: RackItem = {
      id: `temp-${Date.now()}`,
      name: newRackName,
      code: null,
      positionX: newRackPosition.x,
      positionY: newRackPosition.y,
      width: 60,
      height: 100,
      rotation: 0,
      totalU: 42,
      frontImageUrl: null,
      rearImageUrl: null,
      description: null,
    };
    const newRacks = [...localRacks, newRack];
    setLocalRacks(newRacks);
    pushHistory(localElements, newRacks);
    setRackModalOpen(false);
    setNewRackName('');
    setHasChanges(true);
  };

  // 평면도가 없는 경우
  const isPlanNotFound = planError && (planError as { response?: { status: number } }).response?.status === 404;

  const isLoading = floorLoading || planLoading;

  if (isLoading && !isPlanNotFound) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 상단 툴바 */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to={`/substations/${floor?.substationId}/floors`}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {floor?.name} 평면도
            </h1>
            {floorPlan && (
              <p className="text-xs text-gray-500">버전 {floorPlan.version}</p>
            )}
          </div>
        </div>

        {floorPlan && isAdmin && (
          <div className="flex items-center gap-2">
            {/* Undo/Redo 버튼 */}
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title="실행 취소 (Ctrl+Z)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title="다시 실행 (Ctrl+Y)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
              </svg>
            </button>
            <div className="border-l h-6 mx-2" />
            <button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                hasChanges
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saveMutation.isPending ? '저장 중...' : '저장'}
            </button>
            <div className="border-l h-6 mx-2" />
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="p-2 hover:bg-red-50 rounded-lg text-red-600"
              title="평면도 삭제"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 메인 영역 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 평면도가 없는 경우 */}
        {isPlanNotFound ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">평면도가 없습니다</h3>
              <p className="mt-2 text-gray-500">새 평면도를 생성하세요.</p>
              {isAdmin && (
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  평면도 생성
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* 도구 패널 */}
            <div className="w-20 bg-white border-r flex flex-col items-center py-4 gap-1">
              <ToolButton
                active={editorState.tool === 'select'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'select' }))}
                title="선택 (V)"
                label="선택"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </ToolButton>

              <div className="border-t w-12 my-2" />

              <ToolButton
                active={editorState.tool === 'wall'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'wall' }))}
                title="벽 (W)"
                label="벽"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'door'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'door' }))}
                title="문 (D) - Q로 회전"
                label="문"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v18M3 3h18v18H3V3z" />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'window'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'window' }))}
                title="창문 (N) - Q로 회전"
                label="창문"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4V4zm8 0v16M4 12h16" />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'column'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'column' }))}
                title="기둥 (C)"
                label="기둥"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4v16H4V4zm12 0h4v16h-4V4z" />
                </svg>
              </ToolButton>

              <div className="border-t w-12 my-2" />

              <ToolButton
                active={editorState.tool === 'rack'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'rack' }))}
                title="랙 (R)"
                label="랙"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h14v16H5V4zm2 3h10M7 10h10M7 13h10M7 16h10" />
                </svg>
              </ToolButton>

              <div className="border-t w-12 my-2" />

              <ToolButton
                active={editorState.tool === 'delete'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'delete' }))}
                title="삭제 (Delete)"
                label="삭제"
              >
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </ToolButton>
            </div>

            {/* 캔버스 영역 */}
            <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-200">
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                onDoubleClick={handleCanvasDoubleClick}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className={`${
                  isPanning ? 'cursor-grabbing' :
                  editorState.tool === 'select' ? 'cursor-grab' :
                  editorState.tool === 'delete' ? 'cursor-not-allowed' :
                  'cursor-crosshair'
                }`}
              />

              {/* 줌 컨트롤 */}
              <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-2 flex items-center gap-2">
                <button
                  onClick={() => handleZoom(-10)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-sm font-medium w-12 text-center">{editorState.zoom}%</span>
                <button
                  onClick={() => handleZoom(10)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <div className="border-l h-6 mx-1" />
                <button
                  onClick={() => setEditorState(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                  className={`p-1 rounded ${editorState.showGrid ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
                  title="그리드 표시"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z" />
                  </svg>
                </button>
                <button
                  onClick={() => setEditorState(prev => ({ ...prev, gridSnap: !prev.gridSnap }))}
                  className={`p-1 rounded ${editorState.gridSnap ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
                  title="그리드 스냅 (G)"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
              </div>

              {/* 상태 바 */}
              <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow px-3 py-1 text-sm text-gray-600">
                그리드: {editorState.gridSize}px | 줌: {editorState.zoom}%
                {isDrawingWall && ` | 벽 그리기 중 (끝점 클릭으로 완료, ESC 취소)`}
                {['door', 'window'].includes(editorState.tool) && ` | 회전: ${previewRotation}° (Q키로 회전)`}
              </div>

              {/* 회전 버튼 (문/창문 도구 선택 시 또는 문/창문 선택 시) */}
              {(['door', 'window'].includes(editorState.tool) ||
                (selectedElement && ['door', 'window'].includes(selectedElement.elementType))) && (
                <div className="absolute top-4 left-4 bg-white rounded-lg shadow p-2">
                  <button
                    onClick={() => {
                      if (selectedElement && ['door', 'window'].includes(selectedElement.elementType)) {
                        // 선택된 요소 회전
                        const newElements = localElements.map(el => {
                          if (el.id === selectedElement.id) {
                            const props = { ...el.properties } as DoorProperties | WindowProperties;
                            props.rotation = ((props.rotation || 0) + 90) % 360;
                            return { ...el, properties: props };
                          }
                          return el;
                        });
                        setLocalElements(newElements);
                        pushHistory(newElements, localRacks);
                        setHasChanges(true);
                        // selectedElement 업데이트
                        const updated = newElements.find(el => el.id === selectedElement.id);
                        if (updated) setSelectedElement(updated);
                      } else {
                        // 미리보기 회전
                        setPreviewRotation(prev => (prev + 90) % 360);
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded text-sm"
                    title="90도 회전 (Q)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    회전 ({selectedElement && ['door', 'window'].includes(selectedElement.elementType)
                      ? ((selectedElement.properties as DoorProperties | WindowProperties).rotation || 0)
                      : previewRotation}°)
                  </button>
                </div>
              )}
            </div>

            {/* 속성 패널 */}
            {(selectedRack || selectedElement) && (
              <div className="w-80 bg-white border-l p-4 overflow-y-auto">
                {selectedRack && (
                  <>
                    <h3 className="font-semibold text-gray-900 mb-4">랙: {selectedRack.name}</h3>
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-gray-500">X 위치</label>
                          <span className="font-medium">{selectedRack.positionX}</span>
                        </div>
                        <div>
                          <label className="block text-gray-500">Y 위치</label>
                          <span className="font-medium">{selectedRack.positionY}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-gray-500">너비</label>
                          <span className="font-medium">{selectedRack.width}</span>
                        </div>
                        <div>
                          <label className="block text-gray-500">높이</label>
                          <span className="font-medium">{selectedRack.height}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-gray-500">회전</label>
                        <span className="font-medium">{selectedRack.rotation}°</span>
                      </div>
                      <div>
                        <label className="block text-gray-500">총 U</label>
                        <span className="font-medium">{selectedRack.totalU}U</span>
                      </div>
                      {selectedRack.equipmentCount !== undefined && (
                        <div>
                          <label className="block text-gray-500">설비 수</label>
                          <span className="font-medium">{selectedRack.equipmentCount}개</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {selectedElement && (
                  <>
                    <h3 className="font-semibold text-gray-900 mb-4">
                      {selectedElement.elementType === 'door' && '문'}
                      {selectedElement.elementType === 'window' && '창문'}
                      {selectedElement.elementType === 'column' && '기둥'}
                      {selectedElement.elementType === 'wall' && '벽'}
                    </h3>
                    <div className="space-y-3 text-sm">
                      {selectedElement.elementType === 'door' && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-gray-500">X 위치</label>
                              <span className="font-medium">{(selectedElement.properties as DoorProperties).x}</span>
                            </div>
                            <div>
                              <label className="block text-gray-500">Y 위치</label>
                              <span className="font-medium">{(selectedElement.properties as DoorProperties).y}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-500">너비</label>
                            <span className="font-medium">{(selectedElement.properties as DoorProperties).width}</span>
                          </div>
                          <div>
                            <label className="block text-gray-500">회전</label>
                            <span className="font-medium">{(selectedElement.properties as DoorProperties).rotation || 0}°</span>
                          </div>
                          <div>
                            <label className="block text-gray-500">열림 방향</label>
                            <span className="font-medium">
                              {(selectedElement.properties as DoorProperties).openDirection === 'inside' ? '안쪽' : '바깥쪽'}
                            </span>
                          </div>
                        </>
                      )}
                      {selectedElement.elementType === 'window' && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-gray-500">X 위치</label>
                              <span className="font-medium">{(selectedElement.properties as WindowProperties).x}</span>
                            </div>
                            <div>
                              <label className="block text-gray-500">Y 위치</label>
                              <span className="font-medium">{(selectedElement.properties as WindowProperties).y}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-500">너비</label>
                            <span className="font-medium">{(selectedElement.properties as WindowProperties).width}</span>
                          </div>
                          <div>
                            <label className="block text-gray-500">회전</label>
                            <span className="font-medium">{(selectedElement.properties as WindowProperties).rotation || 0}°</span>
                          </div>
                        </>
                      )}
                      {selectedElement.elementType === 'column' && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-gray-500">X 위치</label>
                              <span className="font-medium">{(selectedElement.properties as ColumnProperties).x}</span>
                            </div>
                            <div>
                              <label className="block text-gray-500">Y 위치</label>
                              <span className="font-medium">{(selectedElement.properties as ColumnProperties).y}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-gray-500">너비</label>
                              <span className="font-medium">{(selectedElement.properties as ColumnProperties).width}</span>
                            </div>
                            <div>
                              <label className="block text-gray-500">높이</label>
                              <span className="font-medium">{(selectedElement.properties as ColumnProperties).height}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-500">모양</label>
                            <span className="font-medium">
                              {(selectedElement.properties as ColumnProperties).shape === 'rect' ? '사각형' : '원형'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 평면도 생성 모달 */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">평면도 생성</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">평면도 이름</label>
              <input
                type="text"
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="예: B1층 ICT실 평면도"
              />
            </div>
            {createMutation.error && (
              <p className="text-red-600 text-sm mb-4">{getErrorMessage(createMutation.error)}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={() => createMutation.mutate({ name: newPlanName })}
                disabled={!newPlanName || createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 랙 추가 모달 */}
      {rackModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">랙 추가</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">랙 이름</label>
              <input
                type="text"
                value={newRackName}
                onChange={(e) => setNewRackName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="예: RACK-A01"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setRackModalOpen(false);
                  setNewRackName('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleAddRack}
                disabled={!newRackName}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 평면도 삭제 확인 모달 */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-red-600 mb-4">평면도 삭제</h3>
            <p className="text-gray-600 mb-2">
              <strong>{floorPlan?.name}</strong> 평면도를 삭제하시겠습니까?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              평면도에 포함된 모든 구조물과 랙 배치 정보가 삭제됩니다.
              이 작업은 되돌릴 수 없습니다.
            </p>
            {deleteMutation.error && (
              <p className="text-red-600 text-sm mb-4">{getErrorMessage(deleteMutation.error)}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 도구 버튼 컴포넌트
function ToolButton({
  active,
  onClick,
  title,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-14 py-2 flex flex-col items-center justify-center rounded-lg transition-colors ${
        active ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
      }`}
    >
      {children}
      <span className="text-[10px] mt-1">{label}</span>
    </button>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  const [newPlanName, setNewPlanName] = useState('');
  const [newRackName, setNewRackName] = useState('');

  // 벽 그리기 상태
  const [isDrawingWall, setIsDrawingWall] = useState(false);
  const [wallPoints, setWallPoints] = useState<[number, number][]>([]);

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ type: 'rack' | 'element'; id: string } | null>(null);

  // Undo/Redo 히스토리
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 새 랙 추가 위치
  const [newRackPosition, setNewRackPosition] = useState<{ x: number; y: number }>({ x: 100, y: 100 });

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
    if (isDrawingWall && wallPoints.length > 0) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(wallPoints[0][0], wallPoints[0][1]);
      for (let i = 1; i < wallPoints.length; i++) {
        ctx.lineTo(wallPoints[i][0], wallPoints[i][1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [floorPlan, localElements, localRacks, editorState, isDrawingWall, wallPoints]);

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

  // 요소 찾기
  const findElementAt = (x: number, y: number) => {
    // 랙 찾기
    const rack = localRacks.find(r => {
      return x >= r.positionX && x <= r.positionX + r.width &&
             y >= r.positionY && y <= r.positionY + r.height;
    });
    if (rack) return { type: 'rack' as const, item: rack };

    // 요소 찾기 (기둥, 문, 창문)
    const element = [...localElements].reverse().find(e => {
      if (!e.isVisible) return false;

      switch (e.elementType) {
        case 'door': {
          const props = e.properties as DoorProperties;
          return x >= props.x && x <= props.x + props.width &&
                 y >= props.y && y <= props.y + 10;
        }
        case 'window': {
          const props = e.properties as WindowProperties;
          return x >= props.x && x <= props.x + props.width &&
                 y >= props.y && y <= props.y + 8;
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

    const { x, y } = getCanvasCoordinates(e);

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
        setEditorState(prev => ({ ...prev, selectedIds: [] }));
        setSelectedRack(null);
        setSelectedElement(null);
      }
    }
  };

  // 캔버스 마우스 이동
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragStart || !dragTarget) return;

    const { x, y } = getCanvasCoordinates(e);
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;
    const snappedDx = editorState.gridSnap ? Math.round(dx / editorState.gridSize) * editorState.gridSize : dx;
    const snappedDy = editorState.gridSnap ? Math.round(dy / editorState.gridSize) * editorState.gridSize : dy;

    if (dragTarget.type === 'rack') {
      setLocalRacks(prev => prev.map(r => {
        if (r.id === dragTarget.id) {
          return { ...r, positionX: r.positionX + snappedDx, positionY: r.positionY + snappedDy };
        }
        return r;
      }));
    } else {
      setLocalElements(prev => prev.map(e => {
        if (e.id === dragTarget.id) {
          const props = { ...e.properties };
          if ('x' in props && 'y' in props) {
            (props as { x: number; y: number }).x += snappedDx;
            (props as { x: number; y: number }).y += snappedDy;
          }
          return { ...e, properties: props };
        }
        return e;
      }));
    }

    setDragStart({ x, y });
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
  };

  // 캔버스 클릭 처리
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan || !canvasRef.current) return;

    const { x, y } = getCanvasCoordinates(e);
    const snapped = snapToGrid(x, y);

    switch (editorState.tool) {
      case 'wall':
        if (!isDrawingWall) {
          setIsDrawingWall(true);
          setWallPoints([[snapped.x, snapped.y]]);
        } else {
          setWallPoints(prev => [...prev, [snapped.x, snapped.y]]);
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
          } as DoorProperties,
          zIndex: localElements.length,
          isVisible: true,
        };
        const newElements = [...localElements, newDoor];
        setLocalElements(newElements);
        pushHistory(newElements, localRacks);
        setHasChanges(true);
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
          } as WindowProperties,
          zIndex: localElements.length,
          isVisible: true,
        };
        const newElements = [...localElements, newWindow];
        setLocalElements(newElements);
        pushHistory(newElements, localRacks);
        setHasChanges(true);
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
          } else {
            const newElements = localElements.filter(e => e.id !== found.item.id);
            setLocalElements(newElements);
            pushHistory(newElements, localRacks);
          }
          setHasChanges(true);
        }
        break;
      }
    }
  };

  // 벽 그리기 완료 (더블클릭)
  const handleCanvasDoubleClick = () => {
    if (editorState.tool === 'wall' && isDrawingWall && wallPoints.length >= 2) {
      const newWall: FloorPlanElement = {
        id: `temp-${Date.now()}`,
        elementType: 'wall',
        properties: {
          points: wallPoints,
          thickness: 10,
          color: '#333333',
        },
        zIndex: 0,
        isVisible: true,
      };
      const newElements = [...localElements, newWall];
      setLocalElements(newElements);
      pushHistory(newElements, localRacks);
      setIsDrawingWall(false);
      setWallPoints([]);
      setHasChanges(true);
    }
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

      // Delete 키로 선택 항목 삭제
      if (e.key === 'Delete' && editorState.selectedIds.length > 0) {
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
  }, [editorState.selectedIds, editorState.gridSnap, localElements, localRacks, undo, redo, pushHistory]);

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
            <div className="w-16 bg-white border-r flex flex-col items-center py-4 gap-2">
              <ToolButton
                active={editorState.tool === 'select'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'select' }))}
                title="선택 (V)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </ToolButton>

              <div className="border-t w-10 my-2" />

              <ToolButton
                active={editorState.tool === 'wall'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'wall' }))}
                title="벽 (W)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'door'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'door' }))}
                title="문 (D)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v18M3 3h18v18H3V3z" />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'window'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'window' }))}
                title="창문 (N)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4V4zm8 0v16M4 12h16" />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'column'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'column' }))}
                title="기둥 (C)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4v16H4V4zm12 0h4v16h-4V4z" />
                </svg>
              </ToolButton>

              <div className="border-t w-10 my-2" />

              <ToolButton
                active={editorState.tool === 'rack'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'rack' }))}
                title="랙 (R)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h14v16H5V4zm2 3h10M7 10h10M7 13h10M7 16h10" />
                </svg>
              </ToolButton>

              <div className="border-t w-10 my-2" />

              <ToolButton
                active={editorState.tool === 'delete'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'delete' }))}
                title="삭제 (Delete)"
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
                  editorState.tool === 'select' ? 'cursor-default' :
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
                {isDrawingWall && ` | 벽 그리기 중 (더블클릭으로 완료)`}
              </div>
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
    </div>
  );
}

// 도구 버튼 컴포넌트
function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
        active ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

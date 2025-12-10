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
  LineProperties,
  RectProperties,
  CircleProperties,
  DoorProperties,
  WindowProperties,
  TextProperties,
} from '../types/floorPlan';
import type { FloorDetail } from '../types';

// 유틸리티 함수 import
import { snapToGrid as snapToGridUtil } from '../utils/canvas/canvasTransform';
import {
  renderLinePreview,
  renderCirclePreview,
  renderRectPreview,
  renderPlacementPreview,
  renderElements,
  renderRacks,
  type DrawingToolType,
} from '../utils/floorplan/renderers';
import { findItemAt } from '../utils/floorplan/hitTestUtils';
// 표준화된 시스템 import
import {
  type Position,
  createPropertyUpdater as updateElementProperty,
  createRotateUpdater,
  createFlipHUpdater,
  createFlipVUpdater,
  createIncreaseStrokeWidthUpdater,
  createDecreaseStrokeWidthUpdater,
  createIncreaseFontSizeUpdater,
  createDecreaseFontSizeUpdater,
  createToggleFontWeightUpdater,
  hasProperty,
  getPropertyValue,
  STROKE_WIDTH_PRESETS,
  FONT_SIZE_PRESETS,
} from '../utils/floorplan/elementSystem';
import {
  createDragSession,
  applyDrag,
  type DragSession,
} from '../utils/floorplan/dragSystem';

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

// 그리드 설정 (CAD 스타일 이중 격자)
const GRID_CONFIG = {
  majorGrid: {
    size: 100,
    color: '#c0c0c0',
    lineWidth: 1,
  },
  minorGrid: {
    size: 20,
    color: '#e8e8e8',
    lineWidth: 0.5,
  },
};

// Undo/Redo를 위한 히스토리 타입
interface HistoryState {
  elements: FloorPlanElement[];
  racks: RackItem[];
}

// 모든 오브젝트가 화면에 맞게 보이도록 zoom, panX, panY 계산
function calculateFitToContent(
  elements: FloorPlanElement[],
  racks: RackItem[],
  canvasWidth: number,
  canvasHeight: number
): { zoom: number; panX: number; panY: number } {
  if (elements.length === 0 && racks.length === 0) {
    return { zoom: 100, panX: 0, panY: 0 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  elements.forEach(el => {
    if (!el.isVisible) return;
    if (el.elementType === 'line') {
      const props = el.properties as LineProperties;
      props.points.forEach(([x, y]) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      });
    } else if (el.elementType === 'circle') {
      const props = el.properties as CircleProperties;
      minX = Math.min(minX, props.cx - props.radius);
      minY = Math.min(minY, props.cy - props.radius);
      maxX = Math.max(maxX, props.cx + props.radius);
      maxY = Math.max(maxY, props.cy + props.radius);
    } else {
      const props = el.properties as unknown as { x?: number; y?: number; width?: number; height?: number };
      if (props.x !== undefined && props.y !== undefined) {
        minX = Math.min(minX, props.x);
        minY = Math.min(minY, props.y);
        maxX = Math.max(maxX, props.x + (props.width || 50));
        maxY = Math.max(maxY, props.y + (props.height || 50));
      }
    }
  });

  racks.forEach(rack => {
    minX = Math.min(minX, rack.positionX);
    minY = Math.min(minY, rack.positionY);
    maxX = Math.max(maxX, rack.positionX + rack.width);
    maxY = Math.max(maxY, rack.positionY + rack.height);
  });

  // 오브젝트가 없으면 기본값
  if (minX === Infinity) {
    return { zoom: 100, panX: 0, panY: 0 };
  }

  // 여백 추가
  const padding = 50;
  minX -= padding; minY -= padding;
  maxX += padding; maxY += padding;

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;

  // 화면에 맞는 zoom 계산
  const zoomX = (canvasWidth / contentWidth) * 100;
  const zoomY = (canvasHeight / contentHeight) * 100;
  const zoom = Math.min(zoomX, zoomY, 100); // 최대 100%

  // 콘텐츠 중앙 정렬을 위한 pan 계산
  const scale = zoom / 100;
  const panX = (canvasWidth - contentWidth * scale) / 2 - minX * scale;
  const panY = (canvasHeight - contentHeight * scale) / 2 - minY * scale;

  return { zoom: Math.round(zoom), panX, panY };
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

  // 선 그리기 상태
  const [isDrawingLine, setIsDrawingLine] = useState(false);
  const [linePoints, setLinePoints] = useState<[number, number][]>([]);
  const [linePreviewEnd, setLinePreviewEnd] = useState<[number, number] | null>(null);

  // 원 그리기 상태
  const [isDrawingCircle, setIsDrawingCircle] = useState(false);
  const [circleCenter, setCircleCenter] = useState<{ x: number; y: number } | null>(null);
  const [circlePreviewRadius, setCirclePreviewRadius] = useState<number>(0);

  // 사각형 드래그 그리기 상태
  const [isDrawingRect, setIsDrawingRect] = useState(false);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectPreviewEnd, setRectPreviewEnd] = useState<{ x: number; y: number } | null>(null);

  // 텍스트 입력 상태
  const [isEditingText, setIsEditingText] = useState(false);
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number } | null>(null);
  const [textInputValue, setTextInputValue] = useState('');

  // 오브젝트 미리보기 상태 (회전은 배치 후에만 가능)
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);

  // 드래그 상태 (표준화된 드래그 시스템 사용)
  const [dragSession, setDragSession] = useState<DragSession | null>(null);

  // 캔버스 팬 상태
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Undo/Redo 히스토리
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 새 랙 추가 위치
  const [newRackPosition, setNewRackPosition] = useState<{ x: number; y: number }>({ x: 100, y: 100 });

  // 실시간 마우스 좌표 (월드 좌표)
  const [mouseWorldPosition, setMouseWorldPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 삭제된 요소/랙 ID 추적 (저장 시 백엔드에 전달)
  const [deletedElementIds, setDeletedElementIds] = useState<string[]>([]);
  const [deletedRackIds, setDeletedRackIds] = useState<string[]>([]);

  // 뷰포트 초기화 완료 여부
  const [viewportInitialized, setViewportInitialized] = useState(false);

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

  // selectedElement 동기화 - localElements가 변경될 때 selectedElement도 업데이트
  useEffect(() => {
    if (selectedElement) {
      const updated = localElements.find(el => el.id === selectedElement.id);
      if (updated) {
        setSelectedElement(updated);
      } else {
        // 요소가 삭제된 경우
        setSelectedElement(null);
      }
    }
  }, [localElements]);

  // 평면도 데이터 로드
  useEffect(() => {
    if (floorPlan) {
      const elements = floorPlan.elements.map(e => ({
        ...e,
        isLocked: e.isLocked ?? false,
      }));

      setLocalElements(elements);
      setLocalRacks(floorPlan.racks);
      setEditorState(prev => ({
        ...prev,
        gridSize: floorPlan.gridSize,
      }));
      // 초기 히스토리 설정
      setHistory([{ elements, racks: floorPlan.racks }]);
      setHistoryIndex(0);
      // 뷰포트 초기화 플래그 리셋 (데이터 로드 시마다)
      setViewportInitialized(false);
    }
  }, [floorPlan]);

  // 뷰포트 초기화 (localStorage 복원 또는 Fit to Content)
  useEffect(() => {
    if (!floorPlan || !containerRef.current || viewportInitialized) return;
    // 캔버스 크기가 확정될 때까지 대기
    const container = containerRef.current;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    // floorPlan의 데이터가 localElements/localRacks에 반영될 때까지 대기
    // floorPlan에 요소가 있는데 localElements가 비어있으면 아직 로드 중
    const hasFloorPlanData = floorPlan.elements.length > 0 || floorPlan.racks.length > 0;
    const hasLocalData = localElements.length > 0 || localRacks.length > 0;
    if (hasFloorPlanData && !hasLocalData) return;

    const savedViewport = localStorage.getItem(`floorplan-viewport-${floorId}`);

    if (savedViewport) {
      try {
        const { zoom, panX, panY } = JSON.parse(savedViewport);
        setEditorState(prev => ({
          ...prev,
          zoom: zoom ?? 100,
          panX: panX ?? 0,
          panY: panY ?? 0,
        }));
      } catch {
        // 파싱 실패 시 Fit to Content
        const fitView = calculateFitToContent(localElements, localRacks, container.clientWidth, container.clientHeight);
        setEditorState(prev => ({ ...prev, ...fitView }));
      }
    } else {
      // localStorage 없으면 Fit to Content
      const fitView = calculateFitToContent(localElements, localRacks, container.clientWidth, container.clientHeight);
      setEditorState(prev => ({ ...prev, ...fitView }));
    }

    setViewportInitialized(true);
  }, [floorPlan, floorId, localElements, localRacks, viewportInitialized]);

  // 뷰포트 상태 저장 함수
  const saveViewportState = useCallback(() => {
    if (!floorId) return;
    localStorage.setItem(`floorplan-viewport-${floorId}`, JSON.stringify({
      zoom: editorState.zoom,
      panX: editorState.panX,
      panY: editorState.panY,
    }));
  }, [floorId, editorState.zoom, editorState.panX, editorState.panY]);

  // 페이지 이탈 시 뷰포트 상태 저장
  useEffect(() => {
    const handleBeforeUnload = () => saveViewportState();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      saveViewportState(); // cleanup 시에도 저장
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveViewportState]);

  // 캔버스 렌더링 (무한 캔버스)
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !floorPlan) return;

    const { zoom, panX, panY, showGrid } = editorState;
    const scale = zoom / 100;

    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 무한 캔버스: 뷰포트 영역 계산 (월드 좌표)
    const viewportLeft = -panX / scale;
    const viewportTop = -panY / scale;
    const viewportRight = viewportLeft + canvas.width / scale;
    const viewportBottom = viewportTop + canvas.height / scale;

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    // 배경 (뷰포트 전체)
    ctx.fillStyle = floorPlan.backgroundColor || '#ffffff';
    ctx.fillRect(viewportLeft, viewportTop, canvas.width / scale, canvas.height / scale);

    // 이중 격자 그리드 (CAD 스타일) - 뷰포트 영역만 렌더링 (무한 캔버스)
    // 줌 레벨별 그리드 동적 조정
    if (showGrid) {
      const zoomPercent = zoom;

      // 줌 레벨별 그리드 크기 결정
      let majorSize: number;
      let minorSize: number | null;

      if (zoomPercent < 30) {
        // 10-30%: 큰 간격
        majorSize = 500;
        minorSize = 100;
      } else if (zoomPercent < 50) {
        // 30-50%: Major만
        majorSize = 200;
        minorSize = null;
      } else {
        // 50% 이상: 기본 그리드 유지
        majorSize = 100;
        minorSize = 20;
      }

      const gridStartX = Math.floor(viewportLeft / majorSize) * majorSize;
      const gridStartY = Math.floor(viewportTop / majorSize) * majorSize;
      const gridEndX = Math.ceil(viewportRight / majorSize) * majorSize;
      const gridEndY = Math.ceil(viewportBottom / majorSize) * majorSize;

      // Minor Grid 먼저 (아래 레이어)
      if (minorSize !== null) {
        const minorStartX = Math.floor(viewportLeft / minorSize) * minorSize;
        const minorStartY = Math.floor(viewportTop / minorSize) * minorSize;
        const minorEndX = Math.ceil(viewportRight / minorSize) * minorSize;
        const minorEndY = Math.ceil(viewportBottom / minorSize) * minorSize;

        ctx.strokeStyle = GRID_CONFIG.minorGrid.color;
        ctx.lineWidth = GRID_CONFIG.minorGrid.lineWidth;
        for (let x = minorStartX; x <= minorEndX; x += minorSize) {
          ctx.beginPath();
          ctx.moveTo(x, minorStartY);
          ctx.lineTo(x, minorEndY);
          ctx.stroke();
        }
        for (let y = minorStartY; y <= minorEndY; y += minorSize) {
          ctx.beginPath();
          ctx.moveTo(minorStartX, y);
          ctx.lineTo(minorEndX, y);
          ctx.stroke();
        }
      }

      // Major Grid (위 레이어)
      ctx.strokeStyle = GRID_CONFIG.majorGrid.color;
      ctx.lineWidth = GRID_CONFIG.majorGrid.lineWidth;
      for (let x = gridStartX; x <= gridEndX; x += majorSize) {
        ctx.beginPath();
        ctx.moveTo(x, gridStartY);
        ctx.lineTo(x, gridEndY);
        ctx.stroke();
      }
      for (let y = gridStartY; y <= gridEndY; y += majorSize) {
        ctx.beginPath();
        ctx.moveTo(gridStartX, y);
        ctx.lineTo(gridEndX, y);
        ctx.stroke();
      }

      // 원점 표시 (0,0 위치)
      if (viewportLeft <= 0 && viewportRight >= 0 && viewportTop <= 0 && viewportBottom >= 0) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.stroke();
      }
    }

    // 요소 렌더링 (표준화된 렌더러 사용)
    renderElements(ctx, localElements, editorState.selectedIds);

    // 랙 렌더링 (표준화된 렌더러 사용)
    renderRacks(ctx, localRacks, editorState.selectedIds);

    // 선 그리기 미리보기
    if (isDrawingLine && linePoints.length === 1) {
      renderLinePreview(ctx, linePoints[0], linePreviewEnd);
    }

    // 원 그리기 미리보기
    if (isDrawingCircle && circleCenter) {
      renderCirclePreview(ctx, circleCenter, circlePreviewRadius);
    }

    // 사각형 그리기 미리보기
    if (isDrawingRect && rectStart) {
      renderRectPreview(ctx, rectStart, rectPreviewEnd);
    }

    // 오브젝트 배치 미리보기 렌더링 (door, window, rack, text) - 회전 없이 기본 방향으로만
    if (previewPosition && ['door', 'window', 'rack', 'text'].includes(editorState.tool)) {
      renderPlacementPreview(ctx, editorState.tool as DrawingToolType, previewPosition, 0);
    }

    ctx.restore();
  }, [floorPlan, localElements, localRacks, editorState, isDrawingLine, linePoints, linePreviewEnd, isDrawingCircle, circleCenter, circlePreviewRadius, isDrawingRect, rectStart, rectPreviewEnd, previewPosition]);

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

  // 그리드 스냅 (유틸리티 래퍼)
  const snapToGrid = (x: number, y: number) => {
    return snapToGridUtil(x, y, editorState.gridSize, editorState.gridSnap);
  };

  // 요소 찾기
  // 특정 좌표에서 Element 또는 Rack 찾기
  const findElementAt = (x: number, y: number) => {
    return findItemAt(x, y, localElements, localRacks);
  };

  // 캔버스 마우스 다운
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x, y } = getCanvasCoordinates(e);

    // 중간 버튼(휠 클릭) 또는 Space+클릭이면 팬 모드
    if (e.button === 1 || isSpacePressed) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: screenX, y: screenY });
      return;
    }

    if (editorState.tool === 'select') {
      const found = findElementAt(x, y);
      if (found) {
        // 표준화된 드래그 세션 생성
        const session = createDragSession(found, { x, y });
        setDragSession(session);
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

    // 실시간 마우스 좌표 업데이트 (월드 좌표)
    const { x: worldX, y: worldY } = getCanvasCoordinates(e);
    setMouseWorldPosition({ x: Math.round(worldX), y: Math.round(worldY) });

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

    // 선 그리기 중 미리보기 업데이트
    if (editorState.tool === 'line' && isDrawingLine && linePoints.length === 1) {
      setLinePreviewEnd([snapped.x, snapped.y]);
      return;
    }

    // 원 그리기 중 미리보기 업데이트
    if (editorState.tool === 'circle' && isDrawingCircle && circleCenter) {
      const dx = snapped.x - circleCenter.x;
      const dy = snapped.y - circleCenter.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      setCirclePreviewRadius(Math.max(5, radius));
      return;
    }

    // 사각형 그리기 중 미리보기 업데이트
    if (editorState.tool === 'rect' && isDrawingRect && rectStart) {
      setRectPreviewEnd({ x: snapped.x, y: snapped.y });
      return;
    }

    // 오브젝트 미리보기 위치 업데이트
    if (['door', 'window', 'rack', 'text'].includes(editorState.tool)) {
      setPreviewPosition({ x: snapped.x, y: snapped.y });
    } else {
      setPreviewPosition(null);
    }

    // 표준화된 드래그 시스템 사용
    if (!dragSession || !dragSession.isActive) return;

    // 그리드 스냅 함수
    const snapFn = (pos: Position) => snapToGrid(pos.x, pos.y);

    // 통합 드래그 적용 (Element/Rack 자동 처리)
    const result = applyDrag(localElements, localRacks, dragSession, snapped, snapFn);
    setLocalElements(result.elements);
    setLocalRacks(result.racks);
    setHasChanges(true);
  };

  // 캔버스 마우스 업
  const handleCanvasMouseUp = () => {
    if (dragSession?.isActive) {
      pushHistory(localElements, localRacks);
    }
    setDragSession(null);
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
      case 'line':
        if (!isDrawingLine) {
          // 첫 클릭: 시작점 설정
          setIsDrawingLine(true);
          setLinePoints([[snapped.x, snapped.y]]);
          setLinePreviewEnd(null);
        } else {
          // 두 번째 클릭: 선 확정
          const newLine: FloorPlanElement = {
            id: `temp-${Date.now()}`,
            elementType: 'line',
            properties: {
              points: [linePoints[0], [snapped.x, snapped.y]],
              strokeWidth: 2,
              strokeColor: '#1a1a1a',
              strokeStyle: 'solid',
            } as LineProperties,
            zIndex: localElements.length,
            isVisible: true,
            isLocked: false,
          };
          const newElements = [...localElements, newLine];
          setLocalElements(newElements);
          pushHistory(newElements, localRacks);

          // 상태 초기화 및 선택 도구로 전환
          setIsDrawingLine(false);
          setLinePoints([]);
          setLinePreviewEnd(null);
          setHasChanges(true);
          setEditorState(prev => ({ ...prev, tool: 'select' }));
        }
        break;

      case 'rect':
        if (!isDrawingRect) {
          // 첫 클릭: 시작점 설정
          setIsDrawingRect(true);
          setRectStart({ x: snapped.x, y: snapped.y });
          setRectPreviewEnd(null);
        } else {
          // 두 번째 클릭: 사각형 확정
          const endX = snapped.x;
          const endY = snapped.y;
          const x = Math.min(rectStart!.x, endX);
          const y = Math.min(rectStart!.y, endY);
          const width = Math.abs(endX - rectStart!.x);
          const height = Math.abs(endY - rectStart!.y);

          if (width >= 10 && height >= 10) {
            const newRect: FloorPlanElement = {
              id: `temp-${Date.now()}`,
              elementType: 'rect',
              properties: {
                x,
                y,
                width,
                height,
                rotation: 0,
                flipH: false,
                flipV: false,
                fillColor: 'transparent',
                strokeColor: '#1a1a1a',
                strokeWidth: 2,
                strokeStyle: 'solid',
                cornerRadius: 0,
              } as RectProperties,
              zIndex: localElements.length,
              isVisible: true,
              isLocked: false,
            };
            const newElements = [...localElements, newRect];
            setLocalElements(newElements);
            pushHistory(newElements, localRacks);
            setHasChanges(true);
          }

          // 상태 초기화 및 선택 도구로 전환
          setIsDrawingRect(false);
          setRectStart(null);
          setRectPreviewEnd(null);
          setEditorState(prev => ({ ...prev, tool: 'select' }));
        }
        break;

      case 'circle':
        if (!isDrawingCircle) {
          // 첫 클릭: 중심점 설정
          setIsDrawingCircle(true);
          setCircleCenter({ x: snapped.x, y: snapped.y });
          setCirclePreviewRadius(0);
        } else {
          // 두 번째 클릭: 원 확정
          const newCircle: FloorPlanElement = {
            id: `temp-${Date.now()}`,
            elementType: 'circle',
            properties: {
              cx: circleCenter!.x,
              cy: circleCenter!.y,
              radius: Math.max(5, circlePreviewRadius),
              fillColor: 'transparent',
              strokeColor: '#1a1a1a',
              strokeWidth: 2,
              strokeStyle: 'solid',
            } as CircleProperties,
            zIndex: localElements.length,
            isVisible: true,
            isLocked: false,
          };
          const newElements = [...localElements, newCircle];
          setLocalElements(newElements);
          pushHistory(newElements, localRacks);

          // 상태 초기화 및 선택 도구로 전환
          setIsDrawingCircle(false);
          setCircleCenter(null);
          setCirclePreviewRadius(0);
          setHasChanges(true);
          setEditorState(prev => ({ ...prev, tool: 'select' }));
        }
        break;

      case 'door': {
        // 클릭 위치에 기본 크기로 배치 (회전/반전은 배치 후에만 가능)
        const newDoor: FloorPlanElement = {
          id: `temp-${Date.now()}`,
          elementType: 'door',
          properties: {
            x: snapped.x,
            y: snapped.y,
            width: 60,
            height: 10,
            rotation: 0,
            flipH: false,
            flipV: false,
            openDirection: 'inside',
            strokeWidth: 2,
            strokeColor: '#d97706',
          } as DoorProperties,
          zIndex: localElements.length,
          isVisible: true,
          isLocked: false,
        };
        const newElements = [...localElements, newDoor];
        setLocalElements(newElements);
        pushHistory(newElements, localRacks);
        setHasChanges(true);
        setEditorState(prev => ({ ...prev, tool: 'select' }));
        break;
      }

      case 'window': {
        // 클릭 위치에 기본 크기로 배치 (회전/반전은 배치 후에만 가능)
        const newWindow: FloorPlanElement = {
          id: `temp-${Date.now()}`,
          elementType: 'window',
          properties: {
            x: snapped.x,
            y: snapped.y,
            width: 80,
            height: 8,
            rotation: 0,
            flipH: false,
            flipV: false,
            strokeWidth: 2,
            strokeColor: '#0284c7',
          } as WindowProperties,
          zIndex: localElements.length,
          isVisible: true,
          isLocked: false,
        };
        const newElements = [...localElements, newWindow];
        setLocalElements(newElements);
        pushHistory(newElements, localRacks);
        setHasChanges(true);
        setEditorState(prev => ({ ...prev, tool: 'select' }));
        break;
      }

      case 'rack':
        setNewRackPosition({ x: snapped.x, y: snapped.y });
        setRackModalOpen(true);
        break;

      case 'text': {
        // 텍스트 입력 모드 시작
        setIsEditingText(true);
        setTextInputPosition({ x: snapped.x, y: snapped.y });
        setTextInputValue('');
        break;
      }

      case 'delete': {
        const found = findElementAt(x, y);
        if (found) {
          if (found.type === 'rack') {
            const newRacks = localRacks.filter(r => r.id !== found.item.id);
            setLocalRacks(newRacks);
            pushHistory(localElements, newRacks);
            if (!found.item.id.startsWith('temp-')) {
              setDeletedRackIds(prev => [...prev, found.item.id]);
            }
          } else {
            const newElements = localElements.filter(e => e.id !== found.item.id);
            setLocalElements(newElements);
            pushHistory(newElements, localRacks);
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

  // 더블클릭 핸들러 - 랙 더블클릭 시 랙 에디터로 이동
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - editorState.panX) / (editorState.zoom / 100);
    const y = (e.clientY - rect.top - editorState.panY) / (editorState.zoom / 100);

    // 클릭된 랙 찾기
    for (const rack of [...localRacks].reverse()) {
      if (
        x >= rack.positionX &&
        x <= rack.positionX + rack.width &&
        y >= rack.positionY &&
        y <= rack.positionY + rack.height
      ) {
        // 랙 에디터로 이동
        navigate(`/racks/${rack.id}`);
        return;
      }
    }
  };

  // 키보드 이벤트
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에서는 단축키 무시
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Space 키 누름 (팬 모드)
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      if (e.key === 'Escape') {
        // ESC: 선택 도구로 전환 + 선택 해제 + 그리기 취소
        setIsDrawingLine(false);
        setLinePoints([]);
        setLinePreviewEnd(null);
        setIsDrawingRect(false);
        setRectStart(null);
        setRectPreviewEnd(null);
        setIsDrawingCircle(false);
        setCircleCenter(null);
        setCirclePreviewRadius(0);
        setIsEditingText(false);
        setTextInputPosition(null);
        setTextInputValue('');
        setPreviewPosition(null);
        setEditorState(prev => ({ ...prev, tool: 'select', selectedIds: [] }));
        setSelectedRack(null);
        setSelectedElement(null);
      }

      // 도구 단축키 (CAD 스타일)
      if (e.key === 'v' || e.key === 'V') setEditorState(prev => ({ ...prev, tool: 'select' }));
      if (e.key === 'l' || e.key === 'L') setEditorState(prev => ({ ...prev, tool: 'line' }));
      if (e.key === 'r' || e.key === 'R') setEditorState(prev => ({ ...prev, tool: 'rect' }));
      if (e.key === 'o' || e.key === 'O') setEditorState(prev => ({ ...prev, tool: 'circle' }));
      if (e.key === 'd' || e.key === 'D') setEditorState(prev => ({ ...prev, tool: 'door' }));
      if (e.key === 'w' || e.key === 'W') setEditorState(prev => ({ ...prev, tool: 'window' }));
      if (e.key === 'k' || e.key === 'K') setEditorState(prev => ({ ...prev, tool: 'rack' }));
      if (e.key === 't' || e.key === 'T') setEditorState(prev => ({ ...prev, tool: 'text' }));
      if (e.key === 'g' || e.key === 'G') setEditorState(prev => ({ ...prev, showGrid: !prev.showGrid }));
      if (e.key === 's' && !e.ctrlKey) setEditorState(prev => ({ ...prev, gridSnap: !prev.gridSnap }));

      // H 키: 수평 반전, F 키: 수직 반전
      if ((e.key === 'h' || e.key === 'H') && selectedElement) {
        const newElements = localElements.map(el => {
          if (el.id === selectedElement.id) {
            const props = { ...el.properties };
            if ('flipH' in props) {
              (props as DoorProperties | WindowProperties | RectProperties).flipH =
                !(props as DoorProperties | WindowProperties | RectProperties).flipH;
            }
            return { ...el, properties: props };
          }
          return el;
        });
        setLocalElements(newElements);
        pushHistory(newElements, localRacks);
        setHasChanges(true);
        const updated = newElements.find(el => el.id === selectedElement.id);
        if (updated) setSelectedElement(updated);
      }

      if ((e.key === 'f' || e.key === 'F') && selectedElement) {
        const newElements = localElements.map(el => {
          if (el.id === selectedElement.id) {
            const props = { ...el.properties };
            if ('flipV' in props) {
              (props as DoorProperties | WindowProperties | RectProperties).flipV =
                !(props as DoorProperties | WindowProperties | RectProperties).flipV;
            }
            return { ...el, properties: props };
          }
          return el;
        });
        setLocalElements(newElements);
        pushHistory(newElements, localRacks);
        setHasChanges(true);
        const updated = newElements.find(el => el.id === selectedElement.id);
        if (updated) setSelectedElement(updated);
      }

      // Q 키로 회전 (캔버스에 배치된 요소만 - 회전 지원하는 모든 타입)
      if (e.key === 'q' && selectedElement) {
        const rotatable = ['rect', 'door', 'window', 'text'];
        if (rotatable.includes(selectedElement.elementType)) {
          const newElements = localElements.map(el => {
            if (el.id === selectedElement.id) {
              const props = { ...el.properties } as RectProperties | DoorProperties | WindowProperties | TextProperties;
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

    const handleKeyUp = (e: KeyboardEvent) => {
      // Space 키 놓음
      if (e.key === ' ') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
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

  // 마우스 휠 줌 핸들러 (커서 중심)
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // 줌 전 커서 위치의 월드 좌표
    const scale = editorState.zoom / 100;
    const worldBeforeX = (cursorX - editorState.panX) / scale;
    const worldBeforeY = (cursorY - editorState.panY) / scale;

    // 줌 계산
    const zoomFactor = e.ctrlKey ? 1.25 : 1.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(10, Math.min(1000,
      editorState.zoom * (direction > 0 ? zoomFactor : 1 / zoomFactor)
    ));

    // 줌 후에도 커서 위치의 월드 좌표가 같은 화면 위치에 있도록 팬 조정
    const newScale = newZoom / 100;
    const newPanX = cursorX - worldBeforeX * newScale;
    const newPanY = cursorY - worldBeforeY * newScale;

    setEditorState(prev => ({
      ...prev,
      zoom: Math.round(newZoom),
      panX: newPanX,
      panY: newPanY,
    }));
  }, [editorState.zoom, editorState.panX, editorState.panY]);

  // 휠 이벤트 리스너 등록
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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
      totalU: 12,
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
    setEditorState(prev => ({ ...prev, tool: 'select' }));
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
    <div className="h-screen w-full flex flex-col bg-gray-100 overflow-hidden">
      {/* 상단 툴바 */}
      <div className="shrink-0 bg-white border-b px-4 py-2 flex items-center justify-between">
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

            {/* 편집 툴바 - 선택된 요소가 있을 때만 활성화 */}
            <div className="flex items-center gap-1">
              {/* 회전 */}
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const updater = createRotateUpdater(selectedElement);
                  if (updater) {
                    setLocalElements(updater);
                    setHasChanges(true);
                  }
                }}
                disabled={!hasProperty(selectedElement, 'rotation')}
                className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                title="회전 90° (Q)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              {/* 수평 반전 */}
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const updater = createFlipHUpdater(selectedElement);
                  if (updater) {
                    setLocalElements(updater);
                    setHasChanges(true);
                  }
                }}
                disabled={!hasProperty(selectedElement, 'flipH')}
                className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                title="수평 반전 (H)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 5h8m-8 5h8M12 3v18" />
                </svg>
              </button>

              {/* 수직 반전 */}
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const updater = createFlipVUpdater(selectedElement);
                  if (updater) {
                    setLocalElements(updater);
                    setHasChanges(true);
                  }
                }}
                disabled={!hasProperty(selectedElement, 'flipV')}
                className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                title="수직 반전 (F)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V8m5-5v18m5-13v8" />
                </svg>
              </button>

              <div className="border-l h-5 mx-1" />

              {/* 선 굵기 */}
              <div className="flex items-center border rounded h-7 overflow-hidden">
                <button
                  onClick={() => {
                    if (!selectedElement) return;
                    const updater = createDecreaseStrokeWidthUpdater(selectedElement);
                    if (updater) {
                      setLocalElements(updater);
                      setHasChanges(true);
                    }
                  }}
                  disabled={!hasProperty(selectedElement, 'strokeWidth')}
                  className="w-6 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="굵기 감소"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M20 12H4" />
                  </svg>
                </button>
                <select
                  value={getPropertyValue(selectedElement, 'strokeWidth', 2)}
                  onChange={(e) => {
                    if (!selectedElement) return;
                    setLocalElements(updateElementProperty(selectedElement.id, 'strokeWidth', parseInt(e.target.value)));
                    setHasChanges(true);
                  }}
                  disabled={!hasProperty(selectedElement, 'strokeWidth')}
                  className="h-full text-xs px-1 border-0 bg-transparent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none"
                  title="선 굵기"
                >
                  {STROKE_WIDTH_PRESETS.map(w => (
                    <option key={w} value={w}>{w}px</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!selectedElement) return;
                    const updater = createIncreaseStrokeWidthUpdater(selectedElement);
                    if (updater) {
                      setLocalElements(updater);
                      setHasChanges(true);
                    }
                  }}
                  disabled={!hasProperty(selectedElement, 'strokeWidth')}
                  className="w-6 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="굵기 증가"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* 선 색상 */}
              <input
                type="color"
                value={getPropertyValue(selectedElement, 'strokeColor', '#1a1a1a')}
                onChange={(e) => {
                  if (!selectedElement) return;
                  setLocalElements(updateElementProperty(selectedElement.id, 'strokeColor', e.target.value));
                  setHasChanges(true);
                }}
                disabled={!hasProperty(selectedElement, 'strokeColor')}
                className="w-7 h-7 border rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="선 색상"
              />

              {/* 채움 색상 */}
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={(() => {
                    const fill = getPropertyValue<string>(selectedElement, 'fillColor', '');
                    return (!fill || fill === 'transparent') ? '#ffffff' : fill;
                  })()}
                  onChange={(e) => {
                    if (!selectedElement) return;
                    setLocalElements(updateElementProperty(selectedElement.id, 'fillColor', e.target.value));
                    setHasChanges(true);
                  }}
                  disabled={!hasProperty(selectedElement, 'fillColor') || getPropertyValue<string>(selectedElement, 'fillColor', '') === 'transparent'}
                  className="w-7 h-7 border rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  title="채움 색상"
                />
                <label className="flex items-center gap-0.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={getPropertyValue<string>(selectedElement, 'fillColor', '') === 'transparent'}
                    onChange={(e) => {
                      if (!selectedElement) return;
                      setLocalElements(updateElementProperty(selectedElement.id, 'fillColor', e.target.checked ? 'transparent' : '#ffffff'));
                      setHasChanges(true);
                    }}
                    disabled={!hasProperty(selectedElement, 'fillColor')}
                    className="w-3 h-3"
                  />
                  투명
                </label>
              </div>

              <div className="border-l h-5 mx-1" />

              {/* 텍스트 크기 */}
              <div className="flex items-center border rounded h-7 overflow-hidden">
                <button
                  onClick={() => {
                    if (!selectedElement) return;
                    const updater = createDecreaseFontSizeUpdater(selectedElement);
                    if (updater) {
                      setLocalElements(updater);
                      setHasChanges(true);
                    }
                  }}
                  disabled={selectedElement?.elementType !== 'text'}
                  className="w-6 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="크기 감소"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M20 12H4" />
                  </svg>
                </button>
                <select
                  value={selectedElement?.elementType === 'text' ? getPropertyValue(selectedElement, 'fontSize', 14) : 14}
                  onChange={(e) => {
                    if (!selectedElement) return;
                    setLocalElements(updateElementProperty(selectedElement.id, 'fontSize', parseInt(e.target.value)));
                    setHasChanges(true);
                  }}
                  disabled={selectedElement?.elementType !== 'text'}
                  className="h-full text-xs px-1 border-0 bg-transparent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none"
                  title="텍스트 크기"
                >
                  {FONT_SIZE_PRESETS.map(s => (
                    <option key={s} value={s}>{s}px</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!selectedElement) return;
                    const updater = createIncreaseFontSizeUpdater(selectedElement);
                    if (updater) {
                      setLocalElements(updater);
                      setHasChanges(true);
                    }
                  }}
                  disabled={selectedElement?.elementType !== 'text'}
                  className="w-6 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="크기 증가"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* 텍스트 굵기 */}
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const updater = createToggleFontWeightUpdater(selectedElement);
                  if (updater) {
                    setLocalElements(updater);
                    setHasChanges(true);
                  }
                }}
                disabled={selectedElement?.elementType !== 'text'}
                className={`p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed ${
                  selectedElement?.elementType === 'text' && getPropertyValue<string>(selectedElement, 'fontWeight', '') === 'bold'
                    ? 'bg-gray-200'
                    : 'hover:bg-gray-100'
                }`}
                title="텍스트 굵게"
              >
                <span className="font-bold text-sm">B</span>
              </button>

              {/* 선 스타일 */}
              <select
                value={getPropertyValue(selectedElement, 'strokeStyle', 'solid')}
                onChange={(e) => {
                  if (!selectedElement) return;
                  setLocalElements(updateElementProperty(selectedElement.id, 'strokeStyle', e.target.value));
                  setHasChanges(true);
                }}
                disabled={!hasProperty(selectedElement, 'strokeStyle')}
                className="h-7 text-xs border rounded px-1 disabled:opacity-30 disabled:cursor-not-allowed"
                title="선 스타일"
              >
                <option value="solid">실선</option>
                <option value="dashed">점선</option>
                <option value="dotted">점</option>
              </select>

              <div className="border-l h-5 mx-1" />

              {/* 레이어 순서 */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => {
                    if (!selectedElement) return;
                    const maxZ = Math.max(...localElements.map(e => e.zIndex));
                    setLocalElements(prev => prev.map(el =>
                      el.id === selectedElement.id ? { ...el, zIndex: maxZ + 1 } : el
                    ));
                    setHasChanges(true);
                  }}
                  disabled={!selectedElement}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  title="맨 앞으로"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (!selectedElement) return;
                    const currentZ = selectedElement.zIndex;
                    const higherElements = localElements.filter(e => e.zIndex > currentZ);
                    if (higherElements.length === 0) return;
                    const nextZ = Math.min(...higherElements.map(e => e.zIndex));
                    setLocalElements(prev => prev.map(el => {
                      if (el.id === selectedElement.id) return { ...el, zIndex: nextZ + 1 };
                      if (el.zIndex === nextZ) return { ...el, zIndex: currentZ };
                      return el;
                    }));
                    setHasChanges(true);
                  }}
                  disabled={!selectedElement}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  title="앞으로"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (!selectedElement) return;
                    const currentZ = selectedElement.zIndex;
                    const lowerElements = localElements.filter(e => e.zIndex < currentZ);
                    if (lowerElements.length === 0) return;
                    const prevZ = Math.max(...lowerElements.map(e => e.zIndex));
                    setLocalElements(prev => prev.map(el => {
                      if (el.id === selectedElement.id) return { ...el, zIndex: prevZ - 1 };
                      if (el.zIndex === prevZ) return { ...el, zIndex: currentZ };
                      return el;
                    }));
                    setHasChanges(true);
                  }}
                  disabled={!selectedElement}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  title="뒤로"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (!selectedElement) return;
                    const minZ = Math.min(...localElements.map(e => e.zIndex));
                    setLocalElements(prev => prev.map(el =>
                      el.id === selectedElement.id ? { ...el, zIndex: minZ - 1 } : el
                    ));
                    setHasChanges(true);
                  }}
                  disabled={!selectedElement}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  title="맨 뒤로"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

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
      <div className="flex-1 flex overflow-hidden min-h-0">
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
            <div className="w-28 shrink-0 bg-white border-r flex flex-col py-2 px-1 gap-0.5">
              <ToolButton
                active={editorState.tool === 'select'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'select' }))}
                title="선택 도구"
                label="선택"
                shortcut="V"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </ToolButton>

              <div className="border-t my-1" />

              <ToolButton
                active={editorState.tool === 'line'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'line' }))}
                title="선 그리기"
                label="선"
                shortcut="L"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20L20 4" />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'rect'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'rect' }))}
                title="사각형 그리기"
                label="사각형"
                shortcut="R"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4V4z" />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'circle'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'circle' }))}
                title="원 그리기"
                label="원"
                shortcut="O"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle cx="12" cy="12" r="8" strokeWidth={2} />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'text'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'text' }))}
                title="텍스트 입력"
                label="텍스트"
                shortcut="T"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M12 6v12M8 18h8" />
                </svg>
              </ToolButton>

              <div className="border-t my-1" />

              <ToolButton
                active={editorState.tool === 'door'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'door' }))}
                title="문 배치"
                label="문"
                shortcut="D"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v18M3 3h18v18H3V3z" />
                </svg>
              </ToolButton>

              <ToolButton
                active={editorState.tool === 'window'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'window' }))}
                title="창문 배치"
                label="창문"
                shortcut="W"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4V4zm8 0v16M4 12h16" />
                </svg>
              </ToolButton>

              <div className="border-t my-1" />

              <ToolButton
                active={editorState.tool === 'rack'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'rack' }))}
                title="랙 배치"
                label="랙"
                shortcut="K"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h14v16H5V4zm2 3h10M7 10h10M7 13h10M7 16h10" />
                </svg>
              </ToolButton>

              <div className="border-t my-1" />

              <ToolButton
                active={editorState.tool === 'delete'}
                onClick={() => setEditorState(prev => ({ ...prev, tool: 'delete' }))}
                title="삭제 모드"
                label="삭제"
                shortcut="Del"
                danger
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </ToolButton>
            </div>

            {/* 캔버스 + 하단패널 영역 */}
            <div className="flex-1 flex flex-col min-w-0">
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
                  isSpacePressed ? 'cursor-grab' :
                  editorState.tool === 'select' ? 'cursor-default' :
                  editorState.tool === 'delete' ? 'cursor-not-allowed' :
                  'cursor-crosshair'
                }`}
              />

              {/* 줌 컨트롤 (우상단) - 화이트톤 스타일 */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                {/* 줌 컨트롤 그룹 */}
                <div className="bg-white/95 backdrop-blur shadow-sm border border-gray-200 rounded-lg flex items-center h-8 px-1 gap-0.5">
                  <button
                    onClick={() => setEditorState(prev => ({ ...prev, zoom: Math.max(10, prev.zoom - 10) }))}
                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                    title="축소"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M20 12H4" />
                    </svg>
                  </button>
                  <div
                    className="w-14 h-6 flex items-center justify-center text-xs font-mono text-gray-700 cursor-pointer hover:bg-gray-100 rounded"
                    onClick={() => setEditorState(prev => ({ ...prev, zoom: 100 }))}
                    title="100%로 리셋 (클릭)"
                  >
                    {editorState.zoom}%
                  </div>
                  <button
                    onClick={() => setEditorState(prev => ({ ...prev, zoom: Math.min(1000, prev.zoom + 10) }))}
                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                    title="확대"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <div className="w-px h-4 bg-gray-300 mx-0.5" />
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setEditorState(prev => ({ ...prev, zoom: parseInt(e.target.value) }));
                      }
                    }}
                    className="w-6 h-6 bg-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded cursor-pointer appearance-none text-center text-xs"
                    title="줌 프리셋"
                  >
                    <option value="" className="bg-white">▾</option>
                    <option value="10" className="bg-white">10%</option>
                    <option value="25" className="bg-white">25%</option>
                    <option value="50" className="bg-white">50%</option>
                    <option value="100" className="bg-white">100%</option>
                    <option value="200" className="bg-white">200%</option>
                    <option value="400" className="bg-white">400%</option>
                  </select>
                </div>

                {/* 그리드/스냅 토글 그룹 */}
                <div className="bg-white/95 backdrop-blur shadow-sm border border-gray-200 rounded-lg flex items-center h-8 px-0.5">
                  <button
                    onClick={() => setEditorState(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                    className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                      editorState.showGrid
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                    title={`그리드 ${editorState.showGrid ? 'ON' : 'OFF'} (G)`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setEditorState(prev => ({ ...prev, gridSnap: !prev.gridSnap }))}
                    className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                      editorState.gridSnap
                        ? 'text-amber-600 bg-amber-50'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                    title={`스냅 ${editorState.gridSnap ? 'ON' : 'OFF'} (S)`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M4 12h4m8 0h4M12 4v4m0 8v4" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 도구 안내 (좌상단) - CAD 스타일 커맨드 바 */}
              <div className="absolute top-3 left-3 bg-gray-900/95 backdrop-blur text-white rounded shadow-lg min-w-[200px] overflow-hidden text-xs font-mono">
                {/* 현재 도구 */}
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700">
                  <span className="text-gray-400">도구:</span>
                  <span className="font-semibold text-green-400">
                    {{
                      select: '선택',
                      line: '선',
                      rect: '사각형',
                      circle: '원',
                      door: '문',
                      window: '창문',
                      rack: '랙',
                      text: '텍스트',
                      delete: '삭제',
                    }[editorState.tool]}
                  </span>
                  <span className="text-gray-500 ml-auto">
                    {{
                      select: 'V',
                      line: 'L',
                      rect: 'R',
                      circle: 'O',
                      door: 'D',
                      window: 'W',
                      rack: 'K',
                      text: 'T',
                      delete: 'Del',
                    }[editorState.tool]}
                  </span>
                </div>
                {/* 상태별 안내 */}
                <div className="px-3 py-1.5 text-gray-300">
                  {editorState.tool === 'select' && (
                    editorState.selectedIds.length > 0
                      ? <><span className="text-yellow-400">{editorState.selectedIds.length}개 선택</span> | Del: 삭제 | H/F: 반전</>
                      : <>클릭: 선택 | 드래그: 다중선택 | Space+드래그: 팬</>
                  )}
                  {editorState.tool === 'line' && (isDrawingLine
                    ? <><span className="text-cyan-400">그리는 중</span> | 클릭: 완료 | ESC: 취소</>
                    : <>클릭: 시작점 지정</>
                  )}
                  {editorState.tool === 'rect' && (isDrawingRect
                    ? <><span className="text-cyan-400">그리는 중</span> | 클릭: 완료 | ESC: 취소</>
                    : <>드래그: 대각선 방향으로 그리기</>
                  )}
                  {editorState.tool === 'circle' && (isDrawingCircle
                    ? <><span className="text-cyan-400">반지름: {Math.round(circlePreviewRadius || 0)}px</span> | 클릭: 완료</>
                    : <>클릭: 중심점 지정</>
                  )}
                  {editorState.tool === 'text' && <>클릭: 텍스트 입력 위치</>}
                  {editorState.tool === 'door' && (
                    <><span className="text-orange-400">문</span> | 클릭: 배치 (회전/반전은 배치 후 가능)</>
                  )}
                  {editorState.tool === 'window' && (
                    <><span className="text-blue-400">창문</span> | 클릭: 배치 (회전/반전은 배치 후 가능)</>
                  )}
                  {editorState.tool === 'rack' && <>클릭: 랙 배치 위치</>}
                  {editorState.tool === 'delete' && <><span className="text-red-400">삭제 모드</span> | 클릭하여 삭제</>}
                </div>
              </div>

              {/* 텍스트 입력 오버레이 */}
              {isEditingText && textInputPosition && (
                <div
                  className="absolute"
                  style={{
                    left: textInputPosition.x * (editorState.zoom / 100) + editorState.panX,
                    top: textInputPosition.y * (editorState.zoom / 100) + editorState.panY,
                  }}
                >
                  <input
                    type="text"
                    autoFocus
                    value={textInputValue}
                    onChange={(e) => setTextInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && textInputValue.trim()) {
                        // 텍스트 요소 생성
                        const newText: FloorPlanElement = {
                          id: `temp-${Date.now()}`,
                          elementType: 'text',
                          properties: {
                            x: textInputPosition.x,
                            y: textInputPosition.y,
                            text: textInputValue,
                            fontSize: 14,
                            fontWeight: 'normal',
                            color: '#1a1a1a',
                            rotation: 0,
                            textAlign: 'left',
                          } as TextProperties,
                          zIndex: localElements.length,
                          isVisible: true,
                          isLocked: false,
                        };
                        const newElements = [...localElements, newText];
                        setLocalElements(newElements);
                        pushHistory(newElements, localRacks);
                        setHasChanges(true);
                        setIsEditingText(false);
                        setTextInputPosition(null);
                        setTextInputValue('');
                        setEditorState(prev => ({ ...prev, tool: 'select' }));
                      } else if (e.key === 'Escape') {
                        setIsEditingText(false);
                        setTextInputPosition(null);
                        setTextInputValue('');
                      }
                    }}
                    onBlur={() => {
                      if (textInputValue.trim()) {
                        // 텍스트 요소 생성
                        const newText: FloorPlanElement = {
                          id: `temp-${Date.now()}`,
                          elementType: 'text',
                          properties: {
                            x: textInputPosition.x,
                            y: textInputPosition.y,
                            text: textInputValue,
                            fontSize: 14,
                            fontWeight: 'normal',
                            color: '#1a1a1a',
                            rotation: 0,
                            textAlign: 'left',
                          } as TextProperties,
                          zIndex: localElements.length,
                          isVisible: true,
                          isLocked: false,
                        };
                        const newElements = [...localElements, newText];
                        setLocalElements(newElements);
                        pushHistory(newElements, localRacks);
                        setHasChanges(true);
                        setEditorState(prev => ({ ...prev, tool: 'select' }));
                      }
                      setIsEditingText(false);
                      setTextInputPosition(null);
                      setTextInputValue('');
                    }}
                    className="px-2 py-1 border border-blue-500 rounded text-sm outline-none bg-white shadow-lg min-w-[120px]"
                    placeholder="텍스트 입력..."
                  />
                </div>
              )}
              </div>

              {/* 하단 속성바 - 화이트톤 스타일 */}
              {floorPlan && (
                <div className="h-9 shrink-0 bg-gray-50 border-t border-gray-200 flex items-center px-3 gap-2 text-xs">
          {/* 선택된 요소 타입 표시 */}
          <div className="flex items-center gap-1.5 min-w-[100px]">
            <div className={`w-2 h-2 rounded-full ${
              editorState.selectedIds.length > 0 ? 'bg-blue-500' : 'bg-gray-400'
            }`} />
            <span className="font-medium text-gray-700">
              {editorState.selectedIds.length === 0 && '선택 없음'}
              {editorState.selectedIds.length === 1 && selectedElement && (
                <>
                  {selectedElement.elementType === 'line' && '선 (Line)'}
                  {selectedElement.elementType === 'rect' && '사각형 (Rect)'}
                  {selectedElement.elementType === 'circle' && '원 (Circle)'}
                  {selectedElement.elementType === 'door' && '문 (Door)'}
                  {selectedElement.elementType === 'window' && '창문 (Window)'}
                  {selectedElement.elementType === 'text' && '텍스트 (Text)'}
                </>
              )}
              {editorState.selectedIds.length === 1 && selectedRack && `랙: ${selectedRack.name}`}
              {editorState.selectedIds.length > 1 && `${editorState.selectedIds.length}개 선택됨`}
            </span>
          </div>

          <div className="w-px h-5 bg-gray-300" />

          {/* 속성 편집 영역 */}
          <div className="flex-1 flex items-center gap-3">
            {selectedElement?.elementType === 'line' && (
              <>
                <PropertyGroup label="두께" value={`${(selectedElement.properties as LineProperties).strokeWidth || 2}px`} />
                <PropertyGroup label="색상">
                  <span
                    className="w-4 h-4 rounded border border-gray-300"
                    style={{ backgroundColor: (selectedElement.properties as LineProperties).strokeColor || '#1a1a1a' }}
                  />
                </PropertyGroup>
                <PropertyGroup label="스타일" value={(selectedElement.properties as LineProperties).strokeStyle || 'solid'} />
              </>
            )}
            {selectedElement?.elementType === 'rect' && (
              <>
                <PropertyGroup label="X" value={(selectedElement.properties as RectProperties).x} />
                <PropertyGroup label="Y" value={(selectedElement.properties as RectProperties).y} />
                <PropertyGroup label="W" value={(selectedElement.properties as RectProperties).width} />
                <PropertyGroup label="H" value={(selectedElement.properties as RectProperties).height} />
                <PropertyGroup label="R" value={`${(selectedElement.properties as RectProperties).rotation || 0}°`} />
              </>
            )}
            {selectedElement?.elementType === 'circle' && (
              <>
                <PropertyGroup label="X" value={(selectedElement.properties as CircleProperties).cx} />
                <PropertyGroup label="Y" value={(selectedElement.properties as CircleProperties).cy} />
                <PropertyGroup label="반지름" value={(selectedElement.properties as CircleProperties).radius} />
              </>
            )}
            {selectedElement?.elementType === 'door' && (
              <>
                <PropertyGroup label="X" value={(selectedElement.properties as DoorProperties).x} />
                <PropertyGroup label="Y" value={(selectedElement.properties as DoorProperties).y} />
                <PropertyGroup label="W" value={(selectedElement.properties as DoorProperties).width} />
                <PropertyGroup label="R" value={`${(selectedElement.properties as DoorProperties).rotation || 0}°`} />
                <PropertyGroup label="FlipH" value={(selectedElement.properties as DoorProperties).flipH ? 'Y' : 'N'} />
                <PropertyGroup label="FlipV" value={(selectedElement.properties as DoorProperties).flipV ? 'Y' : 'N'} />
              </>
            )}
            {selectedElement?.elementType === 'window' && (
              <>
                <PropertyGroup label="X" value={(selectedElement.properties as WindowProperties).x} />
                <PropertyGroup label="Y" value={(selectedElement.properties as WindowProperties).y} />
                <PropertyGroup label="W" value={(selectedElement.properties as WindowProperties).width} />
                <PropertyGroup label="R" value={`${(selectedElement.properties as WindowProperties).rotation || 0}°`} />
                <PropertyGroup label="FlipH" value={(selectedElement.properties as WindowProperties).flipH ? 'Y' : 'N'} />
                <PropertyGroup label="FlipV" value={(selectedElement.properties as WindowProperties).flipV ? 'Y' : 'N'} />
              </>
            )}
            {selectedElement?.elementType === 'text' && (
              <>
                <PropertyGroup label="X" value={(selectedElement.properties as TextProperties).x} />
                <PropertyGroup label="Y" value={(selectedElement.properties as TextProperties).y} />
                <PropertyGroup label="크기" value={`${(selectedElement.properties as TextProperties).fontSize}px`} />
                <PropertyGroup label="텍스트" value={(selectedElement.properties as TextProperties).text} />
              </>
            )}
            {selectedRack && (
              <>
                <PropertyGroup label="X" value={selectedRack.positionX} />
                <PropertyGroup label="Y" value={selectedRack.positionY} />
                <PropertyGroup label="W" value={selectedRack.width} />
                <PropertyGroup label="H" value={selectedRack.height} />
                <PropertyGroup label="R" value={`${selectedRack.rotation}°`} />
                <PropertyGroup label="U" value={`${selectedRack.totalU}U`} />
              </>
            )}
          </div>

          <div className="w-px h-5 bg-gray-300" />

          {/* 마우스 좌표 (우측 고정) - 화이트톤 스타일 */}
          <div className="flex items-center gap-3 font-mono text-gray-600">
            <div className="flex items-center gap-1">
              <span className="text-gray-400">X</span>
              <span className="bg-white px-2 py-0.5 rounded border border-gray-200 min-w-[50px] text-right">{mouseWorldPosition.x}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-400">Y</span>
              <span className="bg-white px-2 py-0.5 rounded border border-gray-200 min-w-[50px] text-right">{mouseWorldPosition.y}</span>
            </div>
          </div>
                </div>
              )}
            </div>

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

// 도구 버튼 컴포넌트 (한글 라벨 + 단축키)
function ToolButton({
  active,
  onClick,
  title,
  label,
  shortcut,
  danger,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
  shortcut: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-full px-2 py-1.5 flex items-center gap-2 rounded-lg transition-colors ${
        active
          ? danger
            ? 'bg-red-100 text-red-600'
            : 'bg-blue-100 text-blue-600'
          : danger
            ? 'hover:bg-red-50 text-red-500'
            : 'hover:bg-gray-100 text-gray-600'
      }`}
    >
      <div className="w-5 h-5 flex-shrink-0">{children}</div>
      <span className="text-xs whitespace-nowrap">{label} <span className="text-gray-400">({shortcut})</span></span>
    </button>
  );
}

// 속성 그룹 컴포넌트 (하단 속성바용 - 화이트톤)
function PropertyGroup({
  label,
  value,
  children
}: {
  label: string;
  value?: string | number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-500 text-[10px]">{label}</span>
      {children || (
        <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-700 font-mono text-[11px] min-w-[32px] text-center">
          {value}
        </span>
      )}
    </div>
  );
}

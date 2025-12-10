/**
 * 통합 드래그 시스템 (Drag System)
 *
 * 모든 드래그 동작을 표준화된 방식으로 처리
 * - 드래그 시작: 초기 상태 캡처
 * - 드래그 이동: 델타 계산 및 적용
 * - 드래그 종료: 최종 상태 확정
 */

import type {
  FloorPlanElement,
  RackItem,
  LineProperties,
} from '../../types/floorPlan';
import {
  Position,
  getElementPosition,
  setElementPosition,
  getRackPosition,
} from './elementSystem';

// ============================================
// 드래그 상태 타입
// ============================================

/** Line 요소의 초기 points (특별 처리 필요) */
export type LineInitialPoints = [number, number][];

/** 드래그 대상 아이템 */
export interface DragItem {
  type: 'element' | 'rack';
  id: string;
  /** 드래그 시작 시 기준점 */
  initialPosition: Position;
  /** Line 요소의 경우 모든 점의 초기 위치 */
  initialPoints?: LineInitialPoints;
}

/** 드래그 세션 상태 */
export interface DragSession {
  /** 드래그 시작 마우스 위치 (월드 좌표) */
  startMousePosition: Position;
  /** 현재 드래그 대상 */
  target: DragItem;
  /** 드래그 활성화 여부 */
  isActive: boolean;
}

// ============================================
// 드래그 세션 생성
// ============================================

/**
 * Element 드래그 세션 생성
 */
export function createElementDragSession(
  element: FloorPlanElement,
  mousePosition: Position
): DragSession {
  const initialPosition = getElementPosition(element);

  // Line의 경우 모든 points 저장 (깊은 복사)
  let initialPoints: LineInitialPoints | undefined;
  if (element.elementType === 'line') {
    const lineProps = element.properties as LineProperties;
    initialPoints = lineProps.points.map(p => [...p] as [number, number]);
  }

  return {
    startMousePosition: { ...mousePosition },
    target: {
      type: 'element',
      id: element.id,
      initialPosition,
      initialPoints,
    },
    isActive: true,
  };
}

/**
 * Rack 드래그 세션 생성
 */
export function createRackDragSession(
  rack: RackItem,
  mousePosition: Position
): DragSession {
  return {
    startMousePosition: { ...mousePosition },
    target: {
      type: 'rack',
      id: rack.id,
      initialPosition: getRackPosition(rack),
    },
    isActive: true,
  };
}

/**
 * 통합 드래그 세션 생성 (Element 또는 Rack)
 */
export function createDragSession(
  item: { type: 'element'; item: FloorPlanElement } | { type: 'rack'; item: RackItem },
  mousePosition: Position
): DragSession {
  if (item.type === 'element') {
    return createElementDragSession(item.item, mousePosition);
  } else {
    return createRackDragSession(item.item, mousePosition);
  }
}

// ============================================
// 드래그 델타 계산
// ============================================

/**
 * 마우스 이동에 따른 델타 계산
 */
export function calculateDragDelta(
  session: DragSession,
  currentMousePosition: Position
): Position {
  return {
    x: currentMousePosition.x - session.startMousePosition.x,
    y: currentMousePosition.y - session.startMousePosition.y,
  };
}

/**
 * 드래그 후 새 위치 계산
 */
export function calculateNewPosition(
  session: DragSession,
  currentMousePosition: Position,
  snapFn?: (pos: Position) => Position
): Position {
  const delta = calculateDragDelta(session, currentMousePosition);
  let newPos = {
    x: session.target.initialPosition.x + delta.x,
    y: session.target.initialPosition.y + delta.y,
  };

  if (snapFn) {
    newPos = snapFn(newPos);
  }

  return newPos;
}

// ============================================
// Element 드래그 적용
// ============================================

/**
 * 드래그 적용 - Element
 * @returns 새 properties 객체
 */
export function applyDragToElement(
  element: FloorPlanElement,
  session: DragSession,
  currentMousePosition: Position,
  snapFn?: (pos: Position) => Position
): FloorPlanElement['properties'] {
  const newPos = calculateNewPosition(session, currentMousePosition, snapFn);
  const props = { ...element.properties };

  // Line 특별 처리: 모든 점을 동시에 이동
  if (element.elementType === 'line' && session.target.initialPoints) {
    const lineProps = props as LineProperties;
    const dx = newPos.x - session.target.initialPosition.x;
    const dy = newPos.y - session.target.initialPosition.y;

    lineProps.points = session.target.initialPoints.map(([px, py]) =>
      [px + dx, py + dy] as [number, number]
    );
    return props;
  }

  // 나머지 요소: setElementPosition 사용
  return setElementPosition({ ...element, properties: props }, newPos);
}

/**
 * Elements 배열에 드래그 적용
 */
export function applyDragToElements(
  elements: FloorPlanElement[],
  session: DragSession,
  currentMousePosition: Position,
  snapFn?: (pos: Position) => Position
): FloorPlanElement[] {
  if (session.target.type !== 'element') return elements;

  return elements.map(el => {
    if (el.id === session.target.id) {
      return {
        ...el,
        properties: applyDragToElement(el, session, currentMousePosition, snapFn),
      };
    }
    return el;
  });
}

// ============================================
// Rack 드래그 적용
// ============================================

/**
 * 드래그 적용 - Rack
 * @returns 새 positionX, positionY
 */
export function applyDragToRack(
  session: DragSession,
  currentMousePosition: Position,
  snapFn?: (pos: Position) => Position
): { positionX: number; positionY: number } {
  const newPos = calculateNewPosition(session, currentMousePosition, snapFn);
  return {
    positionX: newPos.x,
    positionY: newPos.y,
  };
}

/**
 * Racks 배열에 드래그 적용
 */
export function applyDragToRacks(
  racks: RackItem[],
  session: DragSession,
  currentMousePosition: Position,
  snapFn?: (pos: Position) => Position
): RackItem[] {
  if (session.target.type !== 'rack') return racks;

  return racks.map(rack => {
    if (rack.id === session.target.id) {
      const newPosition = applyDragToRack(session, currentMousePosition, snapFn);
      return {
        ...rack,
        ...newPosition,
      };
    }
    return rack;
  });
}

// ============================================
// 통합 드래그 적용
// ============================================

export interface DragApplyResult {
  elements: FloorPlanElement[];
  racks: RackItem[];
}

/**
 * 통합 드래그 적용 (Element 또는 Rack 자동 감지)
 */
export function applyDrag(
  elements: FloorPlanElement[],
  racks: RackItem[],
  session: DragSession,
  currentMousePosition: Position,
  snapFn?: (pos: Position) => Position
): DragApplyResult {
  if (session.target.type === 'element') {
    return {
      elements: applyDragToElements(elements, session, currentMousePosition, snapFn),
      racks,
    };
  } else {
    return {
      elements,
      racks: applyDragToRacks(racks, session, currentMousePosition, snapFn),
    };
  }
}

// ============================================
// 드래그 세션 종료
// ============================================

/**
 * 드래그 세션 비활성화
 */
export function endDragSession(session: DragSession): DragSession {
  return {
    ...session,
    isActive: false,
  };
}

/**
 * 빈 드래그 세션 (초기 상태)
 */
export const EMPTY_DRAG_SESSION: DragSession | null = null;

// ============================================
// 유틸리티
// ============================================

/**
 * 드래그 거리 계산 (임계값 체크용)
 */
export function getDragDistance(
  session: DragSession,
  currentMousePosition: Position
): number {
  const delta = calculateDragDelta(session, currentMousePosition);
  return Math.sqrt(delta.x * delta.x + delta.y * delta.y);
}

/**
 * 드래그 시작 임계값 체크
 */
export function isDragThresholdMet(
  session: DragSession,
  currentMousePosition: Position,
  threshold: number = 3
): boolean {
  return getDragDistance(session, currentMousePosition) >= threshold;
}

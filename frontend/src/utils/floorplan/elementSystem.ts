/**
 * 통합 요소 시스템 (Element System)
 *
 * 모든 요소 타입을 일관된 인터페이스로 처리하는 표준화 시스템
 * - 위치(Position): 모든 요소의 위치를 {x, y}로 통일
 * - 크기(Size): 모든 요소의 크기를 {width, height}로 통일
 * - 변환(Transform): rotation, flipH, flipV 통일
 * - 이동(Move): 델타값으로 모든 요소 이동
 */

import type {
  FloorPlanElement,
  ElementType,
  ElementProperties,
  LineProperties,
  RectProperties,
  CircleProperties,
  DoorProperties,
  WindowProperties,
  TextProperties,
  RackItem,
} from '../../types/floorPlan';

// ============================================
// 공통 인터페이스
// ============================================

/** 위치 인터페이스 - 모든 요소의 기준점 */
export interface Position {
  x: number;
  y: number;
}

/** 크기 인터페이스 */
export interface Size {
  width: number;
  height: number;
}

/** 바운딩 박스 (회전 전) */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 변환 속성 */
export interface Transform {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

// ============================================
// 요소 타입별 특성 정의
// ============================================

interface ElementTypeConfig {
  /** 위치 속성명 */
  positionKeys: { x: string; y: string };
  /** 크기 속성명 (없으면 null) */
  sizeKeys: { width: string; height: string } | null;
  /** 회전 지원 여부 */
  supportsRotation: boolean;
  /** 반전 지원 여부 */
  supportsFlip: boolean;
  /** 기본 크기 (크기가 없는 요소용) */
  defaultSize?: Size;
}

const ELEMENT_CONFIG: Record<ElementType, ElementTypeConfig> = {
  line: {
    positionKeys: { x: 'points[0][0]', y: 'points[0][1]' },
    sizeKeys: null,
    supportsRotation: false,
    supportsFlip: false,
  },
  rect: {
    positionKeys: { x: 'x', y: 'y' },
    sizeKeys: { width: 'width', height: 'height' },
    supportsRotation: true,
    supportsFlip: true,
  },
  circle: {
    positionKeys: { x: 'cx', y: 'cy' },
    sizeKeys: null,
    supportsRotation: false,
    supportsFlip: false,
  },
  door: {
    positionKeys: { x: 'x', y: 'y' },
    sizeKeys: { width: 'width', height: 'height' },
    supportsRotation: true,
    supportsFlip: true,
  },
  window: {
    positionKeys: { x: 'x', y: 'y' },
    sizeKeys: { width: 'width', height: 'height' },
    supportsRotation: true,
    supportsFlip: true,
  },
  text: {
    positionKeys: { x: 'x', y: 'y' },
    sizeKeys: null,
    supportsRotation: true,
    supportsFlip: false,
    defaultSize: { width: 100, height: 20 },
  },
};

// ============================================
// 위치 관련 함수
// ============================================

/**
 * 요소의 위치(기준점) 가져오기
 * - Line: 첫 번째 점
 * - Circle: 중심점
 * - 기타: x, y
 */
export function getElementPosition(element: FloorPlanElement): Position {
  const props = element.properties;

  switch (element.elementType) {
    case 'line': {
      const lineProps = props as LineProperties;
      return {
        x: lineProps.points[0][0],
        y: lineProps.points[0][1],
      };
    }
    case 'circle': {
      const circleProps = props as CircleProperties;
      return {
        x: circleProps.cx,
        y: circleProps.cy,
      };
    }
    default: {
      const standardProps = props as RectProperties | DoorProperties | WindowProperties | TextProperties;
      return {
        x: standardProps.x,
        y: standardProps.y,
      };
    }
  }
}

/**
 * 요소의 위치 설정
 * @returns 새 properties 객체 (불변성 유지)
 */
export function setElementPosition(
  element: FloorPlanElement,
  newPos: Position
): ElementProperties {
  const props = { ...element.properties };

  switch (element.elementType) {
    case 'line': {
      const lineProps = props as LineProperties;
      const oldPos = getElementPosition(element);
      const dx = newPos.x - oldPos.x;
      const dy = newPos.y - oldPos.y;
      lineProps.points = lineProps.points.map(([px, py]) =>
        [px + dx, py + dy] as [number, number]
      );
      break;
    }
    case 'circle': {
      const circleProps = props as CircleProperties;
      circleProps.cx = newPos.x;
      circleProps.cy = newPos.y;
      break;
    }
    default: {
      const standardProps = props as RectProperties | DoorProperties | WindowProperties | TextProperties;
      standardProps.x = newPos.x;
      standardProps.y = newPos.y;
      break;
    }
  }

  return props;
}

/**
 * 요소를 델타값만큼 이동
 * @returns 새 properties 객체 (불변성 유지)
 */
export function moveElement(
  element: FloorPlanElement,
  delta: Position
): ElementProperties {
  const currentPos = getElementPosition(element);
  return setElementPosition(element, {
    x: currentPos.x + delta.x,
    y: currentPos.y + delta.y,
  });
}

/**
 * 요소를 새 위치로 이동 (초기 위치 기준)
 * 드래그 시 초기 위치에서 상대적으로 이동할 때 사용
 */
export function moveElementFromInitial(
  element: FloorPlanElement,
  initialPos: Position,
  newPos: Position
): ElementProperties {
  const delta = {
    x: newPos.x - initialPos.x,
    y: newPos.y - initialPos.y,
  };

  const props = { ...element.properties };

  switch (element.elementType) {
    case 'line': {
      // Line은 initialPoints를 별도로 저장해서 사용해야 함
      // 이 함수에서는 현재 위치 기준으로 이동
      const lineProps = props as LineProperties;
      lineProps.points = lineProps.points.map(([px, py]) =>
        [px + delta.x, py + delta.y] as [number, number]
      );
      break;
    }
    case 'circle': {
      const circleProps = props as CircleProperties;
      circleProps.cx = initialPos.x + delta.x;
      circleProps.cy = initialPos.y + delta.y;
      break;
    }
    default: {
      const standardProps = props as RectProperties | DoorProperties | WindowProperties | TextProperties;
      standardProps.x = initialPos.x + delta.x;
      standardProps.y = initialPos.y + delta.y;
      break;
    }
  }

  return props;
}

// ============================================
// 크기 관련 함수
// ============================================

/**
 * 요소의 크기 가져오기
 */
export function getElementSize(element: FloorPlanElement): Size {
  const props = element.properties;

  switch (element.elementType) {
    case 'line': {
      const lineProps = props as LineProperties;
      const xs = lineProps.points.map(p => p[0]);
      const ys = lineProps.points.map(p => p[1]);
      return {
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    }
    case 'circle': {
      const circleProps = props as CircleProperties;
      return {
        width: circleProps.radius * 2,
        height: circleProps.radius * 2,
      };
    }
    case 'text': {
      // 텍스트는 대략적인 크기
      const textProps = props as TextProperties;
      return {
        width: textProps.text.length * textProps.fontSize * 0.6,
        height: textProps.fontSize * 1.2,
      };
    }
    default: {
      const standardProps = props as RectProperties | DoorProperties | WindowProperties;
      return {
        width: standardProps.width,
        height: standardProps.height,
      };
    }
  }
}

/**
 * 요소의 바운딩 박스 가져오기 (회전 전)
 */
export function getElementBoundingBox(element: FloorPlanElement): BoundingBox {
  const pos = getElementPosition(element);
  const size = getElementSize(element);

  switch (element.elementType) {
    case 'line': {
      const lineProps = element.properties as LineProperties;
      const xs = lineProps.points.map(p => p[0]);
      const ys = lineProps.points.map(p => p[1]);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: size.width,
        height: size.height,
      };
    }
    case 'circle': {
      const circleProps = element.properties as CircleProperties;
      return {
        x: circleProps.cx - circleProps.radius,
        y: circleProps.cy - circleProps.radius,
        width: size.width,
        height: size.height,
      };
    }
    default:
      return {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      };
  }
}

// ============================================
// 변환 관련 함수
// ============================================

/**
 * 요소의 변환 속성 가져오기
 */
export function getElementTransform(element: FloorPlanElement): Transform {
  const config = ELEMENT_CONFIG[element.elementType];
  const props = element.properties as unknown as Record<string, unknown>;

  return {
    rotation: config.supportsRotation ? ((props.rotation as number) || 0) : 0,
    flipH: config.supportsFlip ? ((props.flipH as boolean) || false) : false,
    flipV: config.supportsFlip ? ((props.flipV as boolean) || false) : false,
  };
}

/**
 * 요소의 변환 속성 설정
 * @returns 새 properties 객체 (불변성 유지)
 */
export function setElementTransform(
  element: FloorPlanElement,
  transform: Partial<Transform>
): ElementProperties {
  const config = ELEMENT_CONFIG[element.elementType];
  const props = { ...element.properties } as unknown as Record<string, unknown>;

  if (transform.rotation !== undefined && config.supportsRotation) {
    props.rotation = transform.rotation;
  }
  if (transform.flipH !== undefined && config.supportsFlip) {
    props.flipH = transform.flipH;
  }
  if (transform.flipV !== undefined && config.supportsFlip) {
    props.flipV = transform.flipV;
  }

  return props as unknown as ElementProperties;
}

/**
 * 요소 회전 (90도씩)
 */
export function rotateElement(element: FloorPlanElement): ElementProperties | null {
  const config = ELEMENT_CONFIG[element.elementType];
  if (!config.supportsRotation) return null;

  const currentTransform = getElementTransform(element);
  return setElementTransform(element, {
    rotation: (currentTransform.rotation + 90) % 360,
  });
}

/**
 * 요소 수평 반전 토글
 */
export function flipElementH(element: FloorPlanElement): ElementProperties | null {
  const config = ELEMENT_CONFIG[element.elementType];
  if (!config.supportsFlip) return null;

  const currentTransform = getElementTransform(element);
  return setElementTransform(element, {
    flipH: !currentTransform.flipH,
  });
}

/**
 * 요소 수직 반전 토글
 */
export function flipElementV(element: FloorPlanElement): ElementProperties | null {
  const config = ELEMENT_CONFIG[element.elementType];
  if (!config.supportsFlip) return null;

  const currentTransform = getElementTransform(element);
  return setElementTransform(element, {
    flipV: !currentTransform.flipV,
  });
}

// ============================================
// 기능 지원 체크 함수
// ============================================

export function supportsRotation(elementType: ElementType): boolean {
  return ELEMENT_CONFIG[elementType].supportsRotation;
}

export function supportsFlip(elementType: ElementType): boolean {
  return ELEMENT_CONFIG[elementType].supportsFlip;
}

export function supportsResize(elementType: ElementType): boolean {
  return ELEMENT_CONFIG[elementType].sizeKeys !== null;
}

// ============================================
// 랙(Rack) 전용 함수
// ============================================

export function getRackPosition(rack: RackItem): Position {
  return {
    x: rack.positionX,
    y: rack.positionY,
  };
}

export function getRackSize(rack: RackItem): Size {
  return {
    width: rack.width,
    height: rack.height,
  };
}

export function getRackBoundingBox(rack: RackItem): BoundingBox {
  return {
    x: rack.positionX,
    y: rack.positionY,
    width: rack.width,
    height: rack.height,
  };
}

export function moveRack(_rack: RackItem, newPos: Position): Partial<RackItem> {
  return {
    positionX: newPos.x,
    positionY: newPos.y,
  };
}

// ============================================
// 통합 인터페이스 (요소 + 랙)
// ============================================

export type CanvasItem =
  | { type: 'element'; item: FloorPlanElement }
  | { type: 'rack'; item: RackItem };

export function getItemPosition(canvasItem: CanvasItem): Position {
  if (canvasItem.type === 'element') {
    return getElementPosition(canvasItem.item);
  } else {
    return getRackPosition(canvasItem.item);
  }
}

export function getItemSize(canvasItem: CanvasItem): Size {
  if (canvasItem.type === 'element') {
    return getElementSize(canvasItem.item);
  } else {
    return getRackSize(canvasItem.item);
  }
}

export function getItemBoundingBox(canvasItem: CanvasItem): BoundingBox {
  if (canvasItem.type === 'element') {
    return getElementBoundingBox(canvasItem.item);
  } else {
    return getRackBoundingBox(canvasItem.item);
  }
}

// ============================================
// 속성 업데이트 헬퍼
// ============================================

/**
 * 요소의 특정 속성 업데이트
 * @returns 업데이트된 요소 (새 객체)
 */
export function updateElementProperty(
  element: FloorPlanElement,
  key: string,
  value: unknown
): FloorPlanElement {
  return {
    ...element,
    properties: {
      ...element.properties,
      [key]: value,
    },
  };
}

/**
 * 여러 속성 한번에 업데이트
 */
export function updateElementProperties(
  element: FloorPlanElement,
  updates: Partial<ElementProperties>
): FloorPlanElement {
  return {
    ...element,
    properties: {
      ...element.properties,
      ...updates,
    },
  };
}

/**
 * 요소 배열에서 특정 요소 업데이트
 */
export function updateElementInArray(
  elements: FloorPlanElement[],
  elementId: string,
  updater: (element: FloorPlanElement) => FloorPlanElement
): FloorPlanElement[] {
  return elements.map(el =>
    el.id === elementId ? updater(el) : el
  );
}

/**
 * 요소 배열에서 특정 요소의 속성 업데이트
 */
export function updateElementPropertyInArray(
  elements: FloorPlanElement[],
  elementId: string,
  key: string,
  value: unknown
): FloorPlanElement[] {
  return updateElementInArray(elements, elementId, el =>
    updateElementProperty(el, key, value)
  );
}

// ============================================
// 툴바 액션 (toolbarActions.ts에서 병합)
// ============================================

/**
 * Element 업데이트 함수 타입
 */
export type ElementUpdater = (prev: FloorPlanElement[]) => FloorPlanElement[];

/**
 * 속성 업데이트 헬퍼 (배열용)
 */
export function createPropertyUpdater<T>(
  elementId: string,
  property: string,
  value: T
): ElementUpdater {
  return (prev) => prev.map(el =>
    el.id === elementId
      ? { ...el, properties: { ...el.properties, [property]: value } }
      : el
  );
}

// 프리셋 상수
export const STROKE_WIDTH_PRESETS = [1, 2, 3, 4, 6, 8];
export const FONT_SIZE_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32];

/**
 * 회전값 계산
 */
export function getRotatedValue(element: FloorPlanElement): number | null {
  if (!supportsRotation(element.elementType)) return null;
  const props = element.properties as unknown as Record<string, unknown>;
  return (((props.rotation as number) || 0) + 90) % 360;
}

/**
 * 수평 반전값 계산
 */
export function getFlippedHValue(element: FloorPlanElement): boolean | null {
  if (!supportsFlip(element.elementType)) return null;
  const props = element.properties as unknown as Record<string, unknown>;
  return !(props.flipH as boolean);
}

/**
 * 수직 반전값 계산
 */
export function getFlippedVValue(element: FloorPlanElement): boolean | null {
  if (!supportsFlip(element.elementType)) return null;
  const props = element.properties as unknown as Record<string, unknown>;
  return !(props.flipV as boolean);
}

/**
 * 선 굵기 증가
 */
export function getIncreasedStrokeWidth(element: FloorPlanElement): number | null {
  const props = element.properties as unknown as Record<string, unknown>;
  if (!('strokeWidth' in props)) return null;
  const current = (props.strokeWidth as number) || 2;
  const idx = STROKE_WIDTH_PRESETS.indexOf(current);
  return idx < STROKE_WIDTH_PRESETS.length - 1 ? STROKE_WIDTH_PRESETS[idx + 1] : null;
}

/**
 * 선 굵기 감소
 */
export function getDecreasedStrokeWidth(element: FloorPlanElement): number | null {
  const props = element.properties as unknown as Record<string, unknown>;
  if (!('strokeWidth' in props)) return null;
  const current = (props.strokeWidth as number) || 2;
  const idx = STROKE_WIDTH_PRESETS.indexOf(current);
  return idx > 0 ? STROKE_WIDTH_PRESETS[idx - 1] : null;
}

/**
 * 텍스트 크기 증가
 */
export function getIncreasedFontSize(element: FloorPlanElement): number | null {
  if (element.elementType !== 'text') return null;
  const props = element.properties as TextProperties;
  const current = props.fontSize || 14;
  const idx = FONT_SIZE_PRESETS.indexOf(current);
  return idx < FONT_SIZE_PRESETS.length - 1 ? FONT_SIZE_PRESETS[idx + 1] : null;
}

/**
 * 텍스트 크기 감소
 */
export function getDecreasedFontSize(element: FloorPlanElement): number | null {
  if (element.elementType !== 'text') return null;
  const props = element.properties as TextProperties;
  const current = props.fontSize || 14;
  const idx = FONT_SIZE_PRESETS.indexOf(current);
  return idx > 0 ? FONT_SIZE_PRESETS[idx - 1] : null;
}

/**
 * 텍스트 굵기 토글
 */
export function getToggledFontWeight(element: FloorPlanElement): string | null {
  if (element.elementType !== 'text') return null;
  const props = element.properties as TextProperties;
  return props.fontWeight === 'bold' ? 'normal' : 'bold';
}

/**
 * 속성 존재 여부 확인
 */
export function hasProperty(element: FloorPlanElement | null, property: string): boolean {
  if (!element) return false;
  return property in (element.properties || {});
}

/**
 * 속성 값 가져오기
 */
export function getPropertyValue<T>(
  element: FloorPlanElement | null,
  property: string,
  defaultValue: T
): T {
  if (!element) return defaultValue;
  const props = element.properties as unknown as Record<string, unknown>;
  return (props[property] as T) ?? defaultValue;
}

// 업데이터 생성 함수들
export const createRotateUpdater = (el: FloorPlanElement): ElementUpdater | null => {
  const val = getRotatedValue(el);
  return val === null ? null : createPropertyUpdater(el.id, 'rotation', val);
};

export const createFlipHUpdater = (el: FloorPlanElement): ElementUpdater | null => {
  const val = getFlippedHValue(el);
  return val === null ? null : createPropertyUpdater(el.id, 'flipH', val);
};

export const createFlipVUpdater = (el: FloorPlanElement): ElementUpdater | null => {
  const val = getFlippedVValue(el);
  return val === null ? null : createPropertyUpdater(el.id, 'flipV', val);
};

export const createIncreaseStrokeWidthUpdater = (el: FloorPlanElement): ElementUpdater | null => {
  const val = getIncreasedStrokeWidth(el);
  return val === null ? null : createPropertyUpdater(el.id, 'strokeWidth', val);
};

export const createDecreaseStrokeWidthUpdater = (el: FloorPlanElement): ElementUpdater | null => {
  const val = getDecreasedStrokeWidth(el);
  return val === null ? null : createPropertyUpdater(el.id, 'strokeWidth', val);
};

export const createIncreaseFontSizeUpdater = (el: FloorPlanElement): ElementUpdater | null => {
  const val = getIncreasedFontSize(el);
  return val === null ? null : createPropertyUpdater(el.id, 'fontSize', val);
};

export const createDecreaseFontSizeUpdater = (el: FloorPlanElement): ElementUpdater | null => {
  const val = getDecreasedFontSize(el);
  return val === null ? null : createPropertyUpdater(el.id, 'fontSize', val);
};

export const createToggleFontWeightUpdater = (el: FloorPlanElement): ElementUpdater | null => {
  const val = getToggledFontWeight(el);
  return val === null ? null : createPropertyUpdater(el.id, 'fontWeight', val);
};

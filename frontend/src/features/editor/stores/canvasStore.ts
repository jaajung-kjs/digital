import { create } from 'zustand';
import type { DragSession } from '../../../utils/floorplan/dragSystem';

interface CanvasStoreState {
  // Line drawing state
  isDrawingLine: boolean;
  linePoints: [number, number][];
  linePreviewEnd: [number, number] | null;

  // Circle drawing state
  isDrawingCircle: boolean;
  circleCenter: { x: number; y: number } | null;
  circlePreviewRadius: number;
  circlePreviewEnd: { x: number; y: number } | null;

  // Rect drawing state
  isDrawingRect: boolean;
  rectStart: { x: number; y: number } | null;
  rectPreviewEnd: { x: number; y: number } | null;

  // Text editing state
  isEditingText: boolean;
  textInputPosition: { x: number; y: number } | null;
  textInputValue: string;

  // Placement preview position (for door, window, equipment, text)
  previewPosition: { x: number; y: number } | null;

  // Drag state
  dragSession: DragSession | null;

  // Pan state
  isPanning: boolean;
  panStart: { x: number; y: number } | null;
  isSpacePressed: boolean;

  // Equipment modal states
  equipmentModalOpen: boolean;
  pasteEquipmentModalOpen: boolean;
  newEquipmentName: string;
  pasteEquipmentName: string;
  newEquipmentPosition: { x: number; y: number };
}

interface CanvasStoreActions {
  // Line drawing
  setIsDrawingLine: (v: boolean) => void;
  setLinePoints: (pts: [number, number][]) => void;
  setLinePreviewEnd: (end: [number, number] | null) => void;

  // Circle drawing
  setIsDrawingCircle: (v: boolean) => void;
  setCircleCenter: (c: { x: number; y: number } | null) => void;
  setCirclePreviewRadius: (r: number) => void;
  setCirclePreviewEnd: (e: { x: number; y: number } | null) => void;

  // Rect drawing
  setIsDrawingRect: (v: boolean) => void;
  setRectStart: (s: { x: number; y: number } | null) => void;
  setRectPreviewEnd: (e: { x: number; y: number } | null) => void;

  // Text editing
  setIsEditingText: (v: boolean) => void;
  setTextInputPosition: (p: { x: number; y: number } | null) => void;
  setTextInputValue: (v: string) => void;

  // Preview
  setPreviewPosition: (p: { x: number; y: number } | null) => void;

  // Drag
  setDragSession: (s: DragSession | null) => void;

  // Pan
  setIsPanning: (v: boolean) => void;
  setPanStart: (p: { x: number; y: number } | null) => void;
  setIsSpacePressed: (v: boolean) => void;

  // Equipment modals
  setEquipmentModalOpen: (v: boolean) => void;
  setPasteEquipmentModalOpen: (v: boolean) => void;
  setNewEquipmentName: (v: string) => void;
  setPasteEquipmentName: (v: string) => void;
  setNewEquipmentPosition: (p: { x: number; y: number }) => void;

  // Reset all drawing/interaction state
  resetDrawingState: () => void;
}

export const useCanvasStore = create<CanvasStoreState & CanvasStoreActions>((set) => ({
  // Initial state
  isDrawingLine: false,
  linePoints: [],
  linePreviewEnd: null,
  isDrawingCircle: false,
  circleCenter: null,
  circlePreviewRadius: 0,
  circlePreviewEnd: null,
  isDrawingRect: false,
  rectStart: null,
  rectPreviewEnd: null,
  isEditingText: false,
  textInputPosition: null,
  textInputValue: '',
  previewPosition: null,
  dragSession: null,
  isPanning: false,
  panStart: null,
  isSpacePressed: false,
  equipmentModalOpen: false,
  pasteEquipmentModalOpen: false,
  newEquipmentName: '',
  pasteEquipmentName: '',
  newEquipmentPosition: { x: 100, y: 100 },

  // Actions
  setIsDrawingLine: (isDrawingLine) => set({ isDrawingLine }),
  setLinePoints: (linePoints) => set({ linePoints }),
  setLinePreviewEnd: (linePreviewEnd) => set({ linePreviewEnd }),
  setIsDrawingCircle: (isDrawingCircle) => set({ isDrawingCircle }),
  setCircleCenter: (circleCenter) => set({ circleCenter }),
  setCirclePreviewRadius: (circlePreviewRadius) => set({ circlePreviewRadius }),
  setCirclePreviewEnd: (circlePreviewEnd) => set({ circlePreviewEnd }),
  setIsDrawingRect: (isDrawingRect) => set({ isDrawingRect }),
  setRectStart: (rectStart) => set({ rectStart }),
  setRectPreviewEnd: (rectPreviewEnd) => set({ rectPreviewEnd }),
  setIsEditingText: (isEditingText) => set({ isEditingText }),
  setTextInputPosition: (textInputPosition) => set({ textInputPosition }),
  setTextInputValue: (textInputValue) => set({ textInputValue }),
  setPreviewPosition: (previewPosition) => set({ previewPosition }),
  setDragSession: (dragSession) => set({ dragSession }),
  setIsPanning: (isPanning) => set({ isPanning }),
  setPanStart: (panStart) => set({ panStart }),
  setIsSpacePressed: (isSpacePressed) => set({ isSpacePressed }),
  setEquipmentModalOpen: (equipmentModalOpen) => set({ equipmentModalOpen }),
  setPasteEquipmentModalOpen: (pasteEquipmentModalOpen) => set({ pasteEquipmentModalOpen }),
  setNewEquipmentName: (newEquipmentName) => set({ newEquipmentName }),
  setPasteEquipmentName: (pasteEquipmentName) => set({ pasteEquipmentName }),
  setNewEquipmentPosition: (newEquipmentPosition) => set({ newEquipmentPosition }),

  resetDrawingState: () => set({
    isDrawingLine: false,
    linePoints: [],
    linePreviewEnd: null,
    isDrawingCircle: false,
    circleCenter: null,
    circlePreviewRadius: 0,
    circlePreviewEnd: null,
    isDrawingRect: false,
    rectStart: null,
    rectPreviewEnd: null,
    isEditingText: false,
    textInputPosition: null,
    textInputValue: '',
    previewPosition: null,
  }),
}));

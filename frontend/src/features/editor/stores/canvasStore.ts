import { create } from 'zustand';
import type { DragSession } from '../../../utils/floorplan/dragSystem';
import { getEquipmentCategoryFromMaterial } from '../../../types/material';

interface CanvasStoreState {
  // Polyline (conduit/tray) drawing state
  isDrawingLine: boolean;
  linePoints: [number, number][];
  linePreviewEnd: [number, number] | null;

  // Equipment drawing state (drag-to-draw)
  isDrawingEquipment: boolean;
  equipmentStart: { x: number; y: number } | null;
  equipmentPreviewEnd: { x: number; y: number } | null;
  equipmentDrawnSize: { width: number; height: number } | null;

  // Text editing state
  isEditingText: boolean;
  textInputPosition: { x: number; y: number } | null;
  textInputValue: string;

  // Placement preview position (for text, equipment, pullbox)
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
  newEquipmentCategory: string;
  pasteEquipmentName: string;
  newEquipmentPosition: { x: number; y: number };

  // Material-based equipment selection
  newEquipmentMaterialCategoryId: string | null;
  newEquipmentMaterialCategoryCode: string | null;
  newEquipmentMaterialCategoryName: string | null;
  newEquipmentDisplayColor: string | null;
  newEquipmentSpecParams: Record<string, unknown> | null;
  newEquipmentSpecification: string | null;

  // Conduit/tray/pullbox material selection
  infraMaterialModalOpen: boolean;
  infraMaterialElementId: string | null;
}

interface CanvasStoreActions {
  setIsDrawingLine: (v: boolean) => void;
  setLinePoints: (pts: [number, number][]) => void;
  setLinePreviewEnd: (end: [number, number] | null) => void;

  setIsDrawingEquipment: (v: boolean) => void;
  setEquipmentStart: (s: { x: number; y: number } | null) => void;
  setEquipmentPreviewEnd: (e: { x: number; y: number } | null) => void;
  setEquipmentDrawnSize: (s: { width: number; height: number } | null) => void;

  setIsEditingText: (v: boolean) => void;
  setTextInputPosition: (p: { x: number; y: number } | null) => void;
  setTextInputValue: (v: string) => void;

  setPreviewPosition: (p: { x: number; y: number } | null) => void;

  setDragSession: (s: DragSession | null) => void;

  setIsPanning: (v: boolean) => void;
  setPanStart: (p: { x: number; y: number } | null) => void;
  setIsSpacePressed: (v: boolean) => void;

  setEquipmentModalOpen: (v: boolean) => void;
  setPasteEquipmentModalOpen: (v: boolean) => void;
  setNewEquipmentName: (v: string) => void;
  setNewEquipmentCategory: (v: string) => void;
  setPasteEquipmentName: (v: string) => void;
  setNewEquipmentPosition: (p: { x: number; y: number }) => void;

  setNewEquipmentMaterial: (
    categoryId: string | null,
    categoryCode: string | null,
    categoryName: string | null,
    displayColor: string | null,
    specParams: Record<string, unknown> | null,
    specification: string | null,
  ) => void;
  resetNewEquipmentMaterial: () => void;

  setInfraMaterialModalOpen: (v: boolean) => void;
  setInfraMaterialElementId: (id: string | null) => void;

  closeAllModals: () => void;
  resetDrawingState: () => void;
}

export const useCanvasStore = create<CanvasStoreState & CanvasStoreActions>((set) => ({
  isDrawingLine: false,
  linePoints: [],
  linePreviewEnd: null,
  isDrawingEquipment: false,
  equipmentStart: null,
  equipmentPreviewEnd: null,
  equipmentDrawnSize: null,
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
  newEquipmentCategory: 'NETWORK',
  pasteEquipmentName: '',
  newEquipmentPosition: { x: 100, y: 100 },
  newEquipmentMaterialCategoryId: null,
  newEquipmentMaterialCategoryCode: null,
  newEquipmentMaterialCategoryName: null,
  newEquipmentDisplayColor: null,
  newEquipmentSpecParams: null,
  newEquipmentSpecification: null,
  infraMaterialModalOpen: false,
  infraMaterialElementId: null,

  setIsDrawingLine: (isDrawingLine) => set({ isDrawingLine }),
  setLinePoints: (linePoints) => set({ linePoints }),
  setLinePreviewEnd: (linePreviewEnd) => set({ linePreviewEnd }),
  setIsDrawingEquipment: (isDrawingEquipment) => set({ isDrawingEquipment }),
  setEquipmentStart: (equipmentStart) => set({ equipmentStart }),
  setEquipmentPreviewEnd: (equipmentPreviewEnd) => set({ equipmentPreviewEnd }),
  setEquipmentDrawnSize: (equipmentDrawnSize) => set({ equipmentDrawnSize }),
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
  setNewEquipmentCategory: (newEquipmentCategory) => set({ newEquipmentCategory }),
  setPasteEquipmentName: (pasteEquipmentName) => set({ pasteEquipmentName }),
  setNewEquipmentPosition: (newEquipmentPosition) => set({ newEquipmentPosition }),

  setNewEquipmentMaterial: (categoryId, categoryCode, categoryName, displayColor, specParams, specification) =>
    set({
      newEquipmentMaterialCategoryId: categoryId,
      newEquipmentMaterialCategoryCode: categoryCode,
      newEquipmentMaterialCategoryName: categoryName,
      newEquipmentDisplayColor: displayColor,
      newEquipmentSpecParams: specParams,
      newEquipmentSpecification: specification,
      newEquipmentCategory: categoryCode
        ? getEquipmentCategoryFromMaterial(categoryCode)
        : 'NETWORK',
    }),
  resetNewEquipmentMaterial: () =>
    set({
      newEquipmentMaterialCategoryId: null,
      newEquipmentMaterialCategoryCode: null,
      newEquipmentMaterialCategoryName: null,
      newEquipmentDisplayColor: null,
      newEquipmentSpecParams: null,
      newEquipmentSpecification: null,
    }),

  setInfraMaterialModalOpen: (infraMaterialModalOpen) => set({ infraMaterialModalOpen }),
  setInfraMaterialElementId: (infraMaterialElementId) => set({ infraMaterialElementId }),

  closeAllModals: () => set({
    equipmentModalOpen: false,
    pasteEquipmentModalOpen: false,
    infraMaterialModalOpen: false,
    infraMaterialElementId: null,
  }),

  resetDrawingState: () => set({
    isDrawingLine: false,
    linePoints: [],
    linePreviewEnd: null,
    isDrawingEquipment: false,
    equipmentStart: null,
    equipmentPreviewEnd: null,
    equipmentDrawnSize: null,
    isEditingText: false,
    textInputPosition: null,
    textInputValue: '',
    previewPosition: null,
  }),
}));

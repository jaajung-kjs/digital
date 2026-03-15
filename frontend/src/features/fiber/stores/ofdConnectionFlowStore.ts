import { create } from 'zustand';
import { useEditorStore } from '../../editor/stores/editorStore';
import { generateTempId } from '../../../utils/idHelpers';

// ==================== Types ====================

export type OfdFlowPhase = 'idle' | 'selectingPort' | 'selectingTarget';

/**
 * - ofdAsSource: OFD clicked first → select port → pick target on canvas
 * - ofdAsTarget: Non-OFD source → OFD clicked as target → select port → auto-create
 */
export type OfdFlowDirection = 'ofdAsSource' | 'ofdAsTarget';

interface OfdConnectionFlowState {
  phase: OfdFlowPhase;
  direction: OfdFlowDirection | null;
  ofdId: string | null;
  /** Non-OFD source equipment (only set when direction='ofdAsTarget') */
  sourceEquipmentId: string | null;
  fiberPathId: string | null;
  portNumber: number | null;
  hoveredEquipmentId: string | null;
}

interface OfdConnectionFlowActions {
  /** OFD clicked as source: user will select port, then pick target on canvas */
  startFromOfd: (ofdId: string) => void;
  /** Non-OFD source chosen, OFD clicked as target: user selects port to finalize */
  startToOfd: (sourceEquipmentId: string, ofdId: string) => void;
  /** User selected a port in FiberPortGrid */
  selectPort: (fiberPathId: string, portNumber: number) => void;
  /** User clicked target equipment on canvas (only when phase='selectingTarget') */
  completeConnection: (targetEquipmentId: string) => void;
  /** Track hovered equipment during target selection */
  setHovered: (equipmentId: string | null) => void;
  /** Cancel the flow, return to idle */
  cancel: () => void;
}

// ==================== Initial State ====================

const initialState: OfdConnectionFlowState = {
  phase: 'idle',
  direction: null,
  ofdId: null,
  sourceEquipmentId: null,
  fiberPathId: null,
  portNumber: null,
  hoveredEquipmentId: null,
};

// ==================== Store ====================

export const useOfdConnectionFlowStore = create<OfdConnectionFlowState & OfdConnectionFlowActions>((set, get) => ({
  ...initialState,

  startFromOfd: (ofdId) => {
    set({
      phase: 'selectingPort',
      direction: 'ofdAsSource',
      ofdId,
      sourceEquipmentId: null,
      fiberPathId: null,
      portNumber: null,
    });
  },

  startToOfd: (sourceEquipmentId, ofdId) => {
    set({
      phase: 'selectingPort',
      direction: 'ofdAsTarget',
      ofdId,
      sourceEquipmentId,
      fiberPathId: null,
      portNumber: null,
    });
  },

  selectPort: (fiberPathId, portNumber) => {
    const { direction, sourceEquipmentId, ofdId } = get();

    if (direction === 'ofdAsTarget' && sourceEquipmentId && ofdId) {
      // OFD is target: port selection completes the flow → create cable immediately
      useEditorStore.getState().addChange({
        type: 'cable:create',
        localId: generateTempId(),
        sourceEquipmentId,
        targetEquipmentId: ofdId,
        cableType: 'FIBER',
        fiberPathId,
        fiberPortNumber: portNumber,
      });
      useEditorStore.getState().setHasChanges(true);
      set(initialState);
    } else {
      // OFD is source: store port info, wait for target selection on canvas
      set({ fiberPathId, portNumber, phase: 'selectingTarget' });
    }
  },

  completeConnection: (targetEquipmentId) => {
    const { phase, direction, ofdId, fiberPathId, portNumber } = get();
    if (phase !== 'selectingTarget' || direction !== 'ofdAsSource') return;
    if (!ofdId || !fiberPathId || !portNumber) return;

    useEditorStore.getState().addChange({
      type: 'cable:create',
      localId: generateTempId(),
      sourceEquipmentId: ofdId,
      targetEquipmentId,
      cableType: 'FIBER',
      fiberPathId,
      fiberPortNumber: portNumber,
    });
    useEditorStore.getState().setHasChanges(true);
    set(initialState);
  },

  setHovered: (hoveredEquipmentId) => set({ hoveredEquipmentId }),

  cancel: () => set(initialState),
}));

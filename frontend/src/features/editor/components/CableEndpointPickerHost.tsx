import { useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useCableDrawingStore } from '../../connections/stores/cableDrawingStore';
import { RackModulePicker } from '../../connections/components/RackModulePicker';
import { OfdPortPicker } from '../../connections/components/OfdPortPicker';

/**
 * P9 host: opens the right endpoint picker (rack module / OFD port) based on
 * the cable drawing store's phase. Sits at the editor root so it can render
 * above the canvas regardless of which equipment was clicked.
 *
 * Source phase: pickingSourceModule  → picker over `sourceEquipmentId`.
 * Target phase: pickingTargetModule  → picker over `targetEquipmentId`.
 *
 * On select / cancel, the store transitions to drawingPath / selectingSpec
 * (or back to selectingSource for a cancel).
 */
export function CableEndpointPickerHost() {
  const phase = useCableDrawingStore((s) => s.phase);
  const sourceEquipmentId = useCableDrawingStore((s) => s.sourceEquipmentId);
  const sourcePosition = useCableDrawingStore((s) => s.sourcePosition);
  const targetEquipmentId = useCableDrawingStore((s) => s.targetEquipmentId);
  const targetPosition = useCableDrawingStore((s) => s.targetPosition);

  const localEquipment = useEditorStore((s) => s.localEquipment);

  const activeEquipmentId =
    phase === 'pickingSourceModule'
      ? sourceEquipmentId
      : phase === 'pickingTargetModule'
        ? targetEquipmentId
        : null;

  const activeEquipment = useMemo(
    () =>
      activeEquipmentId
        ? localEquipment.find((eq) => eq.id === activeEquipmentId) ?? null
        : null,
    [activeEquipmentId, localEquipment],
  );

  if (!activeEquipment) return null;
  if (phase !== 'pickingSourceModule' && phase !== 'pickingTargetModule') return null;

  const isSource = phase === 'pickingSourceModule';
  const center = isSource ? sourcePosition : targetPosition;
  if (!center) return null;

  const handleCancel = () => {
    // Cancel the whole drawing flow — easier than trying to back up to the
    // previous phase since the user has already committed an endpoint click.
    useCableDrawingStore.getState().cancel();
  };

  if (activeEquipment.kind === 'RACK') {
    return (
      <RackModulePicker
        rackEquipmentId={activeEquipment.id}
        rackName={activeEquipment.name}
        onSelect={(moduleId) => {
          if (isSource) {
            useCableDrawingStore.getState().setSource(activeEquipment.id, center, {
              moduleId,
            });
          } else {
            useCableDrawingStore.getState().setTarget(activeEquipment.id, center, {
              moduleId,
            });
          }
        }}
        onCancel={handleCancel}
      />
    );
  }

  if (activeEquipment.kind === 'OFD') {
    return (
      <OfdPortPicker
        ofdEquipmentId={activeEquipment.id}
        ofdName={activeEquipment.name}
        onSelect={({ fiberPathId, portNumber }) => {
          if (isSource) {
            useCableDrawingStore.getState().setSource(activeEquipment.id, center, {
              fiberPathId,
              portNumber,
            });
          } else {
            useCableDrawingStore.getState().setTarget(activeEquipment.id, center, {
              fiberPathId,
              portNumber,
            });
          }
        }}
        onCancel={handleCancel}
      />
    );
  }

  return null;
}
